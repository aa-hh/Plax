import { getState, setState } from '../core/store.js';
import { serverUrl, plexHeaders, getServerToken } from '../plex/client.js';
import { getContinueWatching, getMetadata } from '../plex/library.js';
import { getCodecCapabilities } from '../platform/webos.js';
import { getProfile, PROFILES, requiresServerTranscode } from './qualityProfiles.js';
import { checkBitrate, kbpsToMbps } from './lgBitrateLimits.js';
import { extractVersions, pickBestVersion } from './versionSelector.js';
import { probePlayback } from './capabilityProbe.js';
import { loadDeviceDisplay } from '../platform/deviceDisplay.js';
import { normalizePlexPath } from './plexPaths.js';

var DEFAULT_TIMEOUT_MS = 7000;
var PROBE_BYTES = 512 * 1024;
var MIN_PROBE_BYTES = 4096;
var HEADROOM = 1.15;

var ITEM_PROBE_CACHE_MAX = 32;
var ITEM_PROBE_TTL_MS = 10 * 60 * 1000;
var itemProbeCache = Object.create(null);
var itemProbeOrder = [];
var itemProbeCacheScope = null;
var SESSION_TTL_MS = 10 * 60 * 1000;
var sessionController = null;
var sessionProbePromise = null;
var activeProbeController = null;
var playbackActive = false;

function setPlaybackActive(active) {
  var wasActive = playbackActive;
  playbackActive = !!active;
  if (playbackActive && !wasActive) {
    cancelNetworkProbe();
  }
}

function isPlaybackActive() {
  return playbackActive;
}

function serverScopeKey(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

function probeCacheKey(server, ratingKey, versionId) {
  return serverScopeKey(server) + ':' + String(ratingKey) + ':' + String(versionId || 'default');
}

function ensureItemProbeCacheScope(server) {
  var scope = serverScopeKey(server);
  if (itemProbeCacheScope !== scope) {
    itemProbeCache = Object.create(null);
    itemProbeOrder = [];
    itemProbeCacheScope = scope;
  }
}

function touchItemProbeKey(key) {
  var idx = itemProbeOrder.indexOf(key);
  if (idx >= 0) itemProbeOrder.splice(idx, 1);
  itemProbeOrder.push(key);
}

function evictItemProbeIfNeeded() {
  while (itemProbeOrder.length > ITEM_PROBE_CACHE_MAX) {
    var evict = itemProbeOrder.shift();
    delete itemProbeCache[evict];
  }
}

function clearItemProbeCache() {
  itemProbeCache = Object.create(null);
  itemProbeOrder = [];
  itemProbeCacheScope = null;
}

function getCachedProbeResult(server, ratingKey, versionId) {
  ensureItemProbeCacheScope(server);
  var key = probeCacheKey(server, ratingKey, versionId);
  var entry = itemProbeCache[key];
  if (!entry) return null;
  if (Date.now() - entry.at > ITEM_PROBE_TTL_MS) {
    delete itemProbeCache[key];
    var idx = itemProbeOrder.indexOf(key);
    if (idx >= 0) itemProbeOrder.splice(idx, 1);
    return null;
  }
  touchItemProbeKey(key);
  return entry.value;
}

function setCachedProbeResult(server, ratingKey, versionId, result) {
  ensureItemProbeCacheScope(server);
  var key = probeCacheKey(server, ratingKey, versionId);
  itemProbeCache[key] = { value: result, at: Date.now() };
  touchItemProbeKey(key);
  evictItemProbeIfNeeded();
}

function roundMbps(n) {
  return Math.round(n * 10) / 10;
}

function requiredMbpsForVersion(version) {
  if (!version || version.bitrate == null || version.bitrate === '') return 8;
  var kbps = parseInt(version.bitrate, 10);
  if (isNaN(kbps) || kbps <= 0) return 8;
  return roundMbps(kbpsToMbps(kbps) * HEADROOM);
}

function normalizePartPath(partKey) {
  return normalizePlexPath(partKey) || '';
}

function mergeByteChunks(chunks, totalLength) {
  var out = new Uint8Array(totalLength);
  var offset = 0;
  var i;
  for (i = 0; i < chunks.length; i++) {
    out.set(chunks[i], offset);
    offset += chunks[i].byteLength;
  }
  return out.buffer;
}

function readCappedResponseBody(response, maxBytes, signal) {
  if (!response || !response.body || typeof response.body.getReader !== 'function') {
    return Promise.reject(new Error('Probe response is not streamable'));
  }
  if (signal && signal.aborted) {
    return Promise.reject(new Error('cancelled'));
  }
  var reader = response.body.getReader();
  var chunks = [];
  var total = 0;

  function onProbeAbort() {
    reader.cancel().catch(function () {});
  }

  if (signal) {
    signal.addEventListener('abort', onProbeAbort);
  }

  function cleanupProbeRead() {
    if (signal) signal.removeEventListener('abort', onProbeAbort);
  }

  return (
    function pump() {
      if (signal && signal.aborted) {
        return reader.cancel().catch(function () {}).then(function () {
          throw new Error('cancelled');
        });
      }
      return reader.read().then(function (result) {
        if (signal && signal.aborted) {
          return reader.cancel().catch(function () {}).then(function () {
            throw new Error('cancelled');
          });
        }
        if (result.done) {
          cleanupProbeRead();
          return mergeByteChunks(chunks, total);
        }
        var chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
        var remaining = maxBytes - total;
        if (chunk.length <= remaining) {
          chunks.push(chunk);
          total += chunk.length;
          return pump();
        }
        chunks.push(chunk.subarray(0, remaining));
        total = maxBytes;
        cleanupProbeRead();
        return reader.cancel().catch(function () {}).then(function () {
          return mergeByteChunks(chunks, total);
        });
      });
    }
  )().then(function (buf) {
    cleanupProbeRead();
    return buf;
  }, function (err) {
    cleanupProbeRead();
    if (signal && signal.aborted) {
      return reader.cancel().catch(function () {}).then(function () {
        throw new Error('cancelled');
      });
    }
    return reader.cancel().catch(function () {}).then(function () {
      throw err;
    });
  });
}

function isAcceptableProbeStatus(status) {
  return status === 206 || status === 200;
}

function measurePartDownload(server, partKey, options) {
  options = options || {};
  if (playbackActive && !options.forceProbe) {
    return Promise.reject(new Error('Network probe deferred during playback'));
  }
  var path = normalizePartPath(partKey);
  if (!server || !server.connectionUri || !path) {
    return Promise.reject(new Error('No media file to test'));
  }

  var url = serverUrl(server.connectionUri, path, {}, server);
  var timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  var cancelled = options.isCancelled || function () { return false; };
  var signal = options.signal || null;
  var endByte = PROBE_BYTES - 1;
  var headers = plexHeaders({ Range: 'bytes=0-' + endByte });
  var serverToken = getServerToken(server);
  if (serverToken) headers['X-Plex-Token'] = serverToken;

  var started = Date.now();

  return new Promise(function (resolve, reject) {
    if (signal && signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }

    var timer = setTimeout(function () {
      reject(new Error('Network test timed out'));
    }, timeoutMs);

    var fetchOpts = { method: 'GET', headers: headers };
    if (signal) fetchOpts.signal = signal;

    fetch(url, fetchOpts)
      .then(function (res) {
        if (cancelled() || (signal && signal.aborted)) {
          clearTimeout(timer);
          reject(new Error('cancelled'));
          return null;
        }
        if (!isAcceptableProbeStatus(res.status)) {
          clearTimeout(timer);
          reject(new Error('HTTP ' + res.status));
          return null;
        }
        if (res.status === 200) {
          var contentLength = res.headers.get('Content-Length');
          if (contentLength) {
            var declaredLen = parseInt(contentLength, 10);
            if (!isNaN(declaredLen) && declaredLen > PROBE_BYTES) {
              if (res.body && typeof res.body.cancel === 'function') {
                res.body.cancel().catch(function () {});
              }
              clearTimeout(timer);
              reject(new Error('Server ignored Range request'));
              return null;
            }
          }
        }
        return readCappedResponseBody(res, PROBE_BYTES, signal);
      })
      .then(function (buf) {
        clearTimeout(timer);
        if (!buf) return;
        if (cancelled() || (signal && signal.aborted)) {
          reject(new Error('cancelled'));
          return;
        }
        var elapsedSec = Math.max(0.05, (Date.now() - started) / 1000);
        var bytes = buf.byteLength || 0;
        if (bytes < MIN_PROBE_BYTES) {
          reject(new Error('Response too small to measure'));
          return;
        }
        var mbps = (bytes * 8) / (elapsedSec * 1000000);
        resolve({
          measuredMbps: roundMbps(mbps),
          bytesRead: bytes,
          durationMs: Math.round(elapsedSec * 1000)
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (cancelled() || (signal && signal.aborted) ||
            (err && (err.message === 'cancelled' || err.name === 'AbortError'))) {
          reject(new Error('cancelled'));
          return;
        }
        reject(err);
      });
  });
}

var TRANSCODE_ORDER = ['4k', '1080', '720', '480'];

function pickTranscodeForSpeed(measuredMbps) {
  var usable = measuredMbps * 0.85;
  var i;
  for (i = 0; i < TRANSCODE_ORDER.length; i++) {
    var key = TRANSCODE_ORDER[i];
    var profile = PROFILES[key];
    var capMbps = profile.maxVideoBitrate / 1000;
    if (usable >= capMbps * HEADROOM) return key;
  }
  return '480';
}

function recommendSessionQuality(measuredMbps, deviceInfo) {
  if (measuredMbps == null || isNaN(measuredMbps)) {
    return {
      qualityKey: 'auto',
      label: getProfile('auto').label,
      reason: 'Could not measure link speed — Auto will adapt during playback.'
    };
  }

  var speedText = '~' + measuredMbps + ' Mbps measured';
  if (measuredMbps >= 35) {
    return {
      qualityKey: 'auto',
      label: getProfile('auto').label,
      reason: 'Good link (' + speedText + '). Auto will direct play when the file and TV allow.'
    };
  }

  var transcodeKey = pickTranscodeForSpeed(measuredMbps);
  var tProfile = getProfile(transcodeKey);
  return {
    qualityKey: transcodeKey,
    label: tProfile.label,
    reason: 'Link may be limited — ' + tProfile.label + ' is a safe default (' + speedText + ').'
  };
}

function recommendPlaybackQuality(ctx) {
  ctx = ctx || {};
  var version = ctx.version;
  var playbackProbe = ctx.playbackProbe;
  var measuredMbps = ctx.measuredMbps;
  var deviceInfo = ctx.deviceInfo;

  var required = requiredMbpsForVersion(version);
  var bitrateCheck = playbackProbe && playbackProbe.bitrateCheck
    ? playbackProbe.bitrateCheck
    : checkBitrate(version, deviceInfo);

  if (measuredMbps == null || isNaN(measuredMbps)) {
    return {
      qualityKey: 'auto',
      label: getProfile('auto').label,
      reason: 'Could not measure link speed — Auto will adapt during playback.'
    };
  }

  var speedText = '~' + measuredMbps + ' Mbps measured';

  if (bitrateCheck.exceeds) {
    var transcodeKey = pickTranscodeForSpeed(measuredMbps);
    var tProfile = getProfile(transcodeKey);
    return {
      qualityKey: transcodeKey,
      label: tProfile.label,
      reason: 'File exceeds TV Direct Play limit (' + bitrateCheck.actualMbps + ' Mbps). ' +
        'Use ' + transcodeKey + ' transcode (' + speedText + ').'
    };
  }

  if (playbackProbe && !playbackProbe.canDirectPlay && playbackProbe.canDirectStream) {
    if (measuredMbps >= required) {
      return {
        qualityKey: 'auto',
        label: getProfile('auto').label,
        reason: 'Remux likely OK (' + speedText + ').'
      };
    }
    var remuxKey = pickTranscodeForSpeed(measuredMbps);
    return {
      qualityKey: remuxKey,
      label: getProfile(remuxKey).label,
      reason: 'Link may be tight for direct stream — ' + getProfile(remuxKey).label +
        ' (' + speedText + ').'
    };
  }

  if (playbackProbe && !playbackProbe.canDirectPlay && !playbackProbe.canDirectStream) {
    var codecKey = pickTranscodeForSpeed(measuredMbps);
    return {
      qualityKey: codecKey,
      label: getProfile(codecKey).label,
      reason: 'Codecs need server transcode — ' + getProfile(codecKey).label +
        ' (' + speedText + ').'
    };
  }

  if (measuredMbps >= required) {
    return {
      qualityKey: 'auto',
      label: getProfile('auto').label,
      reason: 'Direct play OK (' + speedText + ', need ~' + required + ' Mbps).'
    };
  }

  var fallbackKey = pickTranscodeForSpeed(measuredMbps);
  return {
    qualityKey: fallbackKey,
    label: getProfile(fallbackKey).label,
    reason: 'Use ' + fallbackKey + ' transcode (' + speedText + ', need ~' + required + ' Mbps).'
  };
}

function recommendForItem(ctx) {
  ctx = ctx || {};
  var session = ctx.sessionProbe;
  var measuredMbps = ctx.measuredMbps;
  if (measuredMbps == null && session && session.mbps != null) {
    measuredMbps = session.mbps;
  }
  return recommendPlaybackQuality({
    version: ctx.version,
    playbackProbe: ctx.playbackProbe,
    measuredMbps: measuredMbps,
    deviceInfo: ctx.deviceInfo
  });
}

function codecSupportLabel(supported) {
  if (supported === 'probably') return 'supported';
  if (supported === 'maybe') return 'may work';
  return 'not reported';
}

function buildDeviceSummary(deviceInfo, capabilities) {
  deviceInfo = deviceInfo || {};
  capabilities = capabilities || getCodecCapabilities(deviceInfo);
  var bullets = [];
  var model = deviceInfo.modelName || deviceInfo.model;
  if (model) bullets.push('TV: ' + model + (deviceInfo.version ? ' (webOS ' + deviceInfo.version + ')' : ''));
  bullets.push(deviceInfo.uhd
    ? 'Display tier: 4K UHD panel'
    : 'Display tier: 1080p (LG FHD decode limits apply)');
  if (deviceInfo.hdr10 || deviceInfo.dolbyVision) {
    var hdrParts = [];
    if (deviceInfo.hdr10) hdrParts.push('HDR10');
    if (deviceInfo.dolbyVision) hdrParts.push('Dolby Vision');
    bullets.push('HDR: ' + hdrParts.join(', '));
  } else {
    bullets.push('HDR: not reported on this TV — HDR files may look flat');
  }
  bullets.push('H.264: ' + codecSupportLabel(capabilities.h264) +
    ' · HEVC: ' + codecSupportLabel(capabilities.hevc));
  bullets.push('AC-3: ' + codecSupportLabel(capabilities.ac3) +
    ' · E-AC-3: ' + codecSupportLabel(capabilities.eac3) +
    ' · DTS: ' + codecSupportLabel(capabilities.dts));
  var sampleCheck = checkBitrate({ bitrate: deviceInfo.uhd ? 55000 : 40000, videoCodec: 'hevc' }, deviceInfo);
  if (sampleCheck.limitMbps) {
    bullets.push('LG Direct Play ceiling (HEVC): ~' + sampleCheck.limitMbps + ' Mbps on this tier');
  }
  bullets.push('MKV: progressive direct play when codecs match; otherwise Auto uses HLS remux');
  return bullets;
}

function toStoreProbe(partial) {
  var mbps = partial.mbps != null ? partial.mbps : partial.measuredMbps;
  return {
    status: partial.status || 'pending',
    mbps: mbps != null ? mbps : null,
    measuredMbps: mbps != null ? mbps : null,
    recommendedQualityId: partial.recommendedQualityId || 'auto',
    recommendedLabel: partial.recommendedLabel || getProfile('auto').label,
    reason: partial.reason || '',
    deviceSummary: partial.deviceSummary || [],
    testedAt: partial.testedAt || 0,
    serverScope: partial.serverScope || 'noserver',
    error: partial.error || '',
    bytesRead: partial.bytesRead || 0,
    durationMs: partial.durationMs || 0
  };
}

function probeResultToStore(result, server, deviceSummary) {
  var rec = result.recommendation || recommendSessionQuality(result.measuredMbps);
  return toStoreProbe({
    status: result.status === 'error' ? 'error' : 'done',
    mbps: result.measuredMbps != null ? result.measuredMbps : null,
    recommendedQualityId: rec.qualityKey,
    recommendedLabel: rec.label,
    reason: rec.reason,
    deviceSummary: deviceSummary,
    testedAt: result.testedAt || Date.now(),
    serverScope: serverScopeKey(server),
    error: result.error || '',
    bytesRead: result.bytesRead || 0,
    durationMs: result.durationMs || 0
  });
}

function partKeyFromItem(item) {
  if (!item) return '';
  var versions = extractVersions(item);
  var version = pickBestVersion(versions);
  return (version && version.partKey) || item.key || '';
}

function resolveSessionProbePart(server, prefetch) {
  if (prefetch && prefetch.rows) {
    var r;
    for (r = 0; r < prefetch.rows.length; r++) {
      var items = prefetch.rows[r].items || [];
      var i;
      for (i = 0; i < items.length; i++) {
        var pk = partKeyFromItem(items[i]);
        if (pk) return Promise.resolve({ item: items[i], partKey: pk });
      }
    }
  }
  return getContinueWatching(server).then(function (items) {
    if (!items.length) return null;
    var candidate = null;
    var j;
    for (j = 0; j < items.length; j++) {
      if (items[j].type === 'movie' || items[j].type === 'episode') {
        candidate = items[j];
        break;
      }
    }
    candidate = candidate || items[0];
    var directKey = partKeyFromItem(candidate);
    if (directKey) return { item: candidate, partKey: directKey };
    return getMetadata(server, candidate.ratingKey).then(function (meta) {
      var metaKey = partKeyFromItem(meta);
      return metaKey ? { item: meta, partKey: metaKey } : null;
    });
  });
}

function createNetworkProbeController() {
  var cancelled = false;
  var abortController = new AbortController();
  return {
    signal: abortController.signal,
    cancel: function () {
      cancelled = true;
      abortController.abort();
    },
    isCancelled: function () {
      return cancelled || abortController.signal.aborted;
    }
  };
}

function runSessionNetworkProbe(options) {
  options = options || {};
  var server = options.server;
  var deviceInfo = options.deviceInfo || {};
  var capabilities = options.capabilities || getCodecCapabilities(deviceInfo);
  var controller = options.controller || createNetworkProbeController();
  var deviceSummary = buildDeviceSummary(deviceInfo, capabilities);
  var scope = serverScopeKey(server);

  if (options.existing && options.existing.status === 'done' &&
      options.existing.serverScope === scope && !options.force) {
    return Promise.resolve(options.existing);
  }

  return resolveSessionProbePart(server, options.prefetch).then(function (target) {
    if (controller.isCancelled()) throw new Error('cancelled');
    if (!target || !target.partKey) {
      return {
        status: 'error',
        error: 'No media on server to test',
        recommendation: recommendSessionQuality(null, deviceInfo),
        testedAt: Date.now()
      };
    }
    return measurePartDownload(server, target.partKey, {
      timeoutMs: options.timeoutMs,
      isCancelled: controller.isCancelled,
      signal: controller.signal
    }).then(function (measure) {
      if (controller.isCancelled()) throw new Error('cancelled');
      var recommendation = recommendSessionQuality(measure.measuredMbps, deviceInfo);
      return {
        status: 'done',
        measuredMbps: measure.measuredMbps,
        bytesRead: measure.bytesRead,
        durationMs: measure.durationMs,
        recommendation: recommendation,
        testedAt: Date.now()
      };
    });
  }).catch(function (err) {
    if (controller.isCancelled() || (err && err.message === 'cancelled')) throw err;
    return {
      status: 'error',
      error: (err && err.message) || 'Network test failed',
      recommendation: recommendSessionQuality(null, deviceInfo),
      testedAt: Date.now()
    };
  }).then(function (result) {
    return probeResultToStore(result, server, deviceSummary);
  });
}

function runNetworkProbe(options) {
  options = options || {};
  var server = options.server;
  var version = options.version;
  var item = options.item;
  var playbackProbe = options.playbackProbe;
  var deviceInfo = options.deviceInfo;
  var controller = options.controller || createNetworkProbeController();
  var ratingKey = item && item.ratingKey;
  var versionId = version && version.id;
  var capabilities = options.capabilities || getCodecCapabilities(deviceInfo);
  var deviceSummary = buildDeviceSummary(deviceInfo, capabilities);

  var cached = getCachedProbeResult(server, ratingKey, versionId);
  if (cached && !options.force) {
    return Promise.resolve(probeResultToStore(cached, server, deviceSummary));
  }

  var partKey = (version && version.partKey) || (item && item.key);
  return measurePartDownload(server, partKey, {
    timeoutMs: options.timeoutMs,
    isCancelled: controller.isCancelled,
    signal: controller.signal
  }).then(function (measure) {
    if (controller.isCancelled()) throw new Error('cancelled');
    var recommendation = recommendPlaybackQuality({
      version: version,
      playbackProbe: playbackProbe,
      measuredMbps: measure.measuredMbps,
      deviceInfo: deviceInfo
    });
    var result = {
      status: 'done',
      measuredMbps: measure.measuredMbps,
      bytesRead: measure.bytesRead,
      durationMs: measure.durationMs,
      recommendation: recommendation,
      testedAt: Date.now()
    };
    if (ratingKey) setCachedProbeResult(server, ratingKey, versionId, result);
    return probeResultToStore(result, server, deviceSummary);
  }).catch(function (err) {
    if (controller.isCancelled() || (err && err.message === 'cancelled')) {
      throw err;
    }
    var fail = {
      status: 'error',
      error: (err && err.message) || 'Network test failed',
      recommendation: recommendPlaybackQuality({
        version: version,
        playbackProbe: playbackProbe,
        measuredMbps: null,
        deviceInfo: deviceInfo
      }),
      testedAt: Date.now()
    };
    return probeResultToStore(fail, server, deviceSummary);
  });
}

function isCacheFresh(cache, server) {
  if (!cache || !cache.serverScope) return false;
  if (cache.serverScope !== serverScopeKey(server)) return false;
  if (cache.status === 'testing' || cache.status === 'running') return true;
  if (cache.status !== 'done' || !cache.testedAt) return false;
  return Date.now() - cache.testedAt < SESSION_TTL_MS;
}

function refineRecommendationForItem(cache, metadata, version, deviceInfo) {
  if (!cache) return cache;
  if (cache.status !== 'done' || !metadata) return cache;
  var measuredMbps = cache.measuredMbps != null ? cache.measuredMbps : cache.mbps;
  if (measuredMbps == null) return cache;
  var playbackProbe = probePlayback(metadata, version, null, deviceInfo || {});
  var rec = recommendForItem({
    version: version,
    playbackProbe: playbackProbe,
    measuredMbps: measuredMbps,
    sessionProbe: cache,
    deviceInfo: deviceInfo
  });
  return Object.assign({}, cache, {
    recommendedQualityId: rec.qualityKey,
    recommendedLabel: rec.label,
    reason: rec.reason
  });
}

function resolveEffectivePlaybackQuality(prefsQuality, refinedProbe) {
  if (prefsQuality !== 'auto') return prefsQuality;
  if (!refinedProbe || refinedProbe.status !== 'done') return 'auto';
  var id = refinedProbe.recommendedQualityId;
  if (id && getProfile(id)) return id;
  return 'auto';
}

function resolveInitialPlaybackStrategy(opts) {
  opts = opts || {};
  var prefsQuality = opts.prefsQuality || 'auto';
  var effectiveQuality = opts.effectiveQuality != null ? opts.effectiveQuality : prefsQuality;
  var probe = opts.playbackProbe;
  var refinedProbe = opts.refinedProbe;
  var forceTranscode = opts.forceTranscode;
  var version = opts.version;

  if (opts.directPlayOnly) return 'direct';
  if (requiresServerTranscode(effectiveQuality)) return 'transcode';
  if (forceTranscode) return 'transcode';

  var measuredMbps = null;
  if (refinedProbe) {
    measuredMbps = refinedProbe.measuredMbps != null
      ? refinedProbe.measuredMbps
      : refinedProbe.mbps;
  }
  var required = version ? requiredMbpsForVersion(version) : 8;

  if (prefsQuality === 'auto' && effectiveQuality !== 'auto') {
    return 'transcode';
  }

  if (prefsQuality === 'auto' && probe) {
    if (!probe.canDirectPlay && !probe.canDirectStream) return 'transcode';
    if (!probe.canDirectPlay && probe.canDirectStream) return 'direct-stream';
    if (measuredMbps != null && !isNaN(measuredMbps) && measuredMbps < required) {
      return 'transcode';
    }
  }
  return 'direct';
}

function buildRefinedProbeForPlay(server, item, version, deviceInfo, playbackProbe) {
  if (!server || !item) return null;
  var sessionCache = getState().networkProbe;
  var summary = (sessionCache && sessionCache.deviceSummary) || [];
  var cached = getCachedProbeResult(server, item.ratingKey, version && version.id);
  if (cached) {
    return refineRecommendationForItem(
      probeResultToStore(cached, server, summary),
      item,
      version,
      deviceInfo
    );
  }
  if (sessionCache && sessionCache.status === 'done' &&
      sessionCache.serverScope === serverScopeKey(server)) {
    return refineRecommendationForItem(sessionCache, item, version, deviceInfo);
  }
  if (playbackProbe && sessionCache) {
    return refineRecommendationForItem(sessionCache, item, version, deviceInfo);
  }
  return null;
}

function ensureItemProbeForPlay(server, item, version, deviceInfo, playbackProbe) {
  var refined = buildRefinedProbeForPlay(server, item, version, deviceInfo, playbackProbe);
  var cached = getCachedProbeResult(server, item.ratingKey, version && version.id);
  if (cached || !version || !version.partKey) {
    return Promise.resolve(refined);
  }
  if (playbackActive) {
    return Promise.resolve(refined);
  }
  return startNetworkProbeIfNeeded(server, {
    item: item,
    version: version,
    deviceInfo: deviceInfo,
    playbackProbe: playbackProbe,
    force: true
  }).then(function () {
    return buildRefinedProbeForPlay(server, item, version, deviceInfo, playbackProbe);
  }).catch(function () {
    return refined;
  });
}

function cancelNetworkProbe() {
  if (sessionController) {
    sessionController.cancel();
    sessionController = null;
  }
  if (activeProbeController) {
    activeProbeController.cancel();
    activeProbeController = null;
  }
  sessionProbePromise = null;
}

function startNetworkProbeIfNeeded(server, options) {
  options = options || {};
  if (!server) return Promise.resolve(null);
  if (playbackActive && !options.force) {
    var deferredCache = getState().networkProbe;
    if (isCacheFresh(deferredCache, server)) return Promise.resolve(deferredCache);
    return Promise.resolve(null);
  }

  var cache = getState().networkProbe;
  if (!options.force && isCacheFresh(cache, server)) {
    return Promise.resolve(cache);
  }
  if (!options.force && cache &&
      (cache.status === 'testing' || cache.status === 'running') &&
      cache.serverScope === serverScopeKey(server) && sessionProbePromise) {
    return sessionProbePromise;
  }

  if (options.item && options.version) {
    cancelNetworkProbe();
    activeProbeController = createNetworkProbeController();
    var itemController = activeProbeController;
    var itemDeviceInfo = options.deviceInfo || {};
    var itemPlaybackProbe = probePlayback(options.item, options.version, null, itemDeviceInfo);
    return runNetworkProbe({
      server: server,
      item: options.item,
      version: options.version,
      playbackProbe: itemPlaybackProbe,
      deviceInfo: itemDeviceInfo,
      force: true,
      controller: itemController
    }).then(function (storeProbe) {
      if (itemController.isCancelled()) return null;
      activeProbeController = null;
      // Per-title probes stay in itemProbeCache; do not replace session networkProbe.
      return storeProbe;
    }).catch(function (err) {
      if (err && err.message === 'cancelled') return null;
      activeProbeController = null;
      return null;
    });
  }

  cancelNetworkProbe();
  sessionController = createNetworkProbeController();
  sessionProbePromise = startSessionNetworkProbe(server, {
    setState: setState,
    getState: getState,
    deviceInfo: options.deviceInfo,
    capabilities: options.capabilities,
    prefetch: options.prefetch,
    force: !!options.force,
    controller: sessionController
  }).finally(function () {
    if (sessionProbePromise) sessionProbePromise = null;
    sessionController = null;
  });
  return sessionProbePromise;
}

function startSessionNetworkProbe(server, opts) {
  opts = opts || {};
  var setStateFn = opts.setState;
  var getStateFn = opts.getState;
  var deviceInfo = opts.deviceInfo || {};
  var scope = serverScopeKey(server);
  var running = toStoreProbe({
    status: 'testing',
    serverScope: scope,
    deviceSummary: buildDeviceSummary(deviceInfo, opts.capabilities)
  });
  if (setStateFn) setStateFn({ networkProbe: running });

  return runSessionNetworkProbe({
    server: server,
    prefetch: opts.prefetch,
    deviceInfo: deviceInfo,
    capabilities: opts.capabilities,
    force: !!opts.force,
    controller: opts.controller || createNetworkProbeController(),
    existing: getStateFn && getStateFn().networkProbe
  }).then(function (storeProbe) {
    if (setStateFn) setStateFn({ networkProbe: storeProbe });
    return storeProbe;
  }).catch(function (err) {
    if (err && err.message === 'cancelled') return null;
    var failed = toStoreProbe({
      status: 'error',
      serverScope: scope,
      error: (err && err.message) || 'Network test failed',
      deviceSummary: buildDeviceSummary(deviceInfo, opts.capabilities),
      testedAt: Date.now()
    });
    if (setStateFn) setStateFn({ networkProbe: failed });
    return failed;
  });
}

function startBootNetworkProbe(server, prefetch) {
  if (!server) return Promise.resolve(null);
  return new Promise(function (resolve) {
    loadDeviceDisplay(function (deviceInfo) {
      startNetworkProbeIfNeeded(server, {
        prefetch: prefetch,
        deviceInfo: deviceInfo,
        force: false
      }).then(resolve);
    });
  });
}

export {
  PROBE_BYTES,
  MIN_PROBE_BYTES,
  DEFAULT_TIMEOUT_MS,
  ITEM_PROBE_CACHE_MAX,
  ITEM_PROBE_TTL_MS,
  readCappedResponseBody,
  isAcceptableProbeStatus,
  SESSION_TTL_MS,
  measurePartDownload,
  recommendPlaybackQuality,
  recommendForItem,
  recommendSessionQuality,
  requiredMbpsForVersion,
  resolveEffectivePlaybackQuality,
  resolveInitialPlaybackStrategy,
  buildRefinedProbeForPlay,
  ensureItemProbeForPlay,
  probeCacheKey,
  runNetworkProbe,
  runSessionNetworkProbe,
  startSessionNetworkProbe,
  startNetworkProbeIfNeeded,
  startBootNetworkProbe,
  cancelNetworkProbe,
  setPlaybackActive,
  isPlaybackActive,
  isCacheFresh,
  refineRecommendationForItem,
  createNetworkProbeController,
  getCachedProbeResult,
  setCachedProbeResult,
  clearItemProbeCache,
  buildDeviceSummary,
  serverScopeKey,
  probeResultToStore,
  toStoreProbe
};
