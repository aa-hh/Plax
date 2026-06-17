import { getState } from '../core/store.js';
import {
  serverUrl,
  fetchText,
  plexHeaders,
  getServerToken,
  redactPlexUrl
} from '../plex/client.js';
import { applyPlexClientFields } from '../plex/clientIdentity.js';
import {
  applyProfileToParams,
  getProfile,
  isDirectPlayOnlyQuality,
  requiresServerTranscode
} from './qualityProfiles.js';
import {
  buildMinimalDecisionParams,
  buildUniversalDecisionUrl
} from './transcodeDecision.js';
import {
  parseTranscodeDecision,
  strategyFromPartDecision
} from './parseTranscodeDecision.js';
import { buildAudioTranscodeParam } from './tracks/audioTracks.js';
import { normalizePlexPath } from './plexPaths.js';
import {
  buildSubtitleTranscodeParams,
  resolveSessionPartPath,
  resolveSessionMetadataPath,
  offsetSecondsForPlex,
  getActiveTranscodeSession,
  plexLocationForServer,
  selectPartSubtitleStream
} from './tracks/subtitleTracks.js';
import {
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams,
  isSegmentedDeliveryProtocol,
  isWebOs4Tv,
  isHlsUrl,
  extractHlsManifestDiagnostics
} from './hlsPolicy.js';
import { buildWebOsClientProfileExtra } from './deviceProfile.js';
import { tvLog, tvError } from '../utils/tvDebug.js';

/**
 * Client-side strategy hint when `/decision` is unavailable. Playback URLs
 * normally follow the server decision instead of this helper.
 */
function resolvePlaybackStrategy(session) {
  var prefs = getState().playbackPrefs || {};
  var quality = session.quality || prefs.quality || 'original';
  if (session.playbackStrategy) return session.playbackStrategy;
  if (isDirectPlayOnlyQuality(quality) && !session.forceTranscode) {
    return 'direct';
  }
  if (requiresServerTranscode(quality)) {
    return session.transcodeProtocol === 'http' ? 'http-transcode' : 'transcode';
  }
  if (session.forceTranscode || prefs.directPlay === false) {
    return session.transcodeProtocol === 'http' ? 'http-transcode' : 'transcode';
  }
  return 'direct';
}

/** Plex Web-style client playback id (distinct from PMS transcode session query param). */
function generateClientPlaybackSessionId() {
  var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var i = 0; i < 24; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function sessionQualityKey(session) {
  var prefs = getState().playbackPrefs || {};
  return session.quality || prefs.quality || 'original';
}

function applyPlexTranscodeLevelParams(params, session, usesTranscoder) {
  if (!usesTranscoder && !requiresServerTranscode(sessionQualityKey(session))) return;
  params.subtitleSize = '75';
  params.audioBoost = '100';
}

function buildDecisionRequestFlags(session) {
  var prefs = getState().playbackPrefs || {};
  var quality = sessionQualityKey(session);
  var strategy = session.playbackStrategy;

  if (requiresServerTranscode(quality)) {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (session.forceTranscode || prefs.directPlay === false) {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (strategy === 'direct-stream') {
    return { directPlay: '0', directStream: '1', directStreamAudio: '1' };
  }
  if (strategy === 'transcode' || strategy === 'http-transcode') {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (strategy === 'direct' || isDirectPlayOnlyQuality(quality)) {
    return { directPlay: '1', directStream: '1', directStreamAudio: '1' };
  }
  return { directPlay: '1', directStream: '1', directStreamAudio: '1' };
}

function buildTranscodeParams(server, partKey, session, protocol, strategyOverride) {
  var prefs = getState().playbackPrefs || {};
  var strategy = strategyOverride || resolvePlaybackStrategy(session);
  var path = resolveSessionMetadataPath(session) || normalizePlexPath(partKey);
  var fullTranscode = strategy === 'transcode' || strategy === 'http-transcode';
  var directStream = strategy === 'direct-stream';
  var params = applyPlexClientFields({
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    fastSeek: '1',
    hasMDE: '1',
    directPlay: fullTranscode ? '0' : (directStream ? '0' : '1'),
    directStream: fullTranscode ? '0' : '1',
    directStreamAudio: fullTranscode ? '0' : '1',
    autoAdjustQuality: '0',
    mediaBufferSize: '102400',
    location: plexLocationForServer(server)
  });
  assignStartUrlSessionParams(params, session);
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  var usesTranscoder = directStream || fullTranscode;
  applyPlexTranscodeLevelParams(params, session, usesTranscoder);
  var softTextSubs = usesTranscoder && session.subtitleStreamId != null &&
    session.subtitleBurnIn !== true;
  Object.assign(params, buildSubtitleTranscodeParams(
    session.subtitleStreamId,
    session.subtitleOffset,
    {
      burnIn: session.subtitleBurnIn === true,
      clientSubtitles: softTextSubs,
      advancedSubtitles: session.subtitleBurnIn === true && session.subtitleAdvancedBurn
        ? 'burn'
        : undefined
    }
  ));

  if (protocol === 'http') {
    buildHttpTranscodeFallbackParams(params);
  } else {
    applyWebOsHlsTranscodeParams(params, { strategy: strategy });
  }

  return params;
}

/** Params sent to `/decision` — ask PMS with subtitles=auto when soft subs are on. */
function assignDecisionSessionParams(params, session) {
  var clientSession = session.playbackSessionId || session.sessionId;
  if (!clientSession) {
    clientSession = generateClientPlaybackSessionId();
    session.playbackSessionId = clientSession;
  }
  params.session = clientSession;
  delete params.transcodeSessionId;
  delete params['X-Plex-Session-Identifier'];
  return params;
}

function requirePmsTranscodeSession(session) {
  var resourceSession = getActiveTranscodeSession(session);
  if (!resourceSession) {
    var err = new Error(
      'Plex did not return a transcode session from /decision. Cannot start universal transcode.'
    );
    err.code = 'PMS_SESSION_MISSING';
    throw err;
  }
  return resourceSession;
}

function assignStartUrlSessionParams(params, session) {
  var resourceSession = requirePmsTranscodeSession(session);
  var clientSession = session.playbackSessionId || session.sessionId;
  params.session = resourceSession;
  params.transcodeSessionId = resourceSession;
  tvLog('session', 'play session alignment', {
    decisionResourceSession: resourceSession,
    clientPlaybackSessionId: clientSession,
    matchesClientSession: resourceSession === clientSession,
    playSession: params.session,
    playTranscodeSessionId: params.transcodeSessionId
  });
  return params;
}

function prefersMp4RemuxForDv(session) {
  var version = session && session.version;
  if (!version) return false;
  var container = String(version.container || '').toLowerCase();
  var profile = String(version.videoProfile || '').toLowerCase();
  var codec = String(version.videoCodec || '').toLowerCase();
  var hasDv = profile.indexOf('dv') >= 0 || codec.indexOf('dv') >= 0 ||
    profile.indexOf('dolby') >= 0;
  return hasDv && container === 'mkv';
}

function buildMinimalDecisionRequestParams(server, partKey, session, flagOverrides) {
  var prefs = getState().playbackPrefs || {};
  var deviceInfo = getState().deviceInfo || {};
  var path = resolveSessionMetadataPath(session) || normalizePlexPath(partKey);
  var params = applyPlexClientFields(Object.assign({
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    hasMDE: '1',
    directPlay: '1',
    directStream: '1',
    directStreamAudio: '1',
    mediaBufferSize: '102400',
    'X-Plex-Client-Profile-Name': 'Generic',
    'X-Plex-Client-Profile-Extra': buildWebOsClientProfileExtra(deviceInfo, {
      strategy: session.playbackStrategy || 'direct'
    }),
    location: plexLocationForServer(server)
  }, flagOverrides || {}));
  assignDecisionSessionParams(params, session);
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  if (session.subtitleStreamId != null && session.subtitleBurnIn !== true) {
    // We render text subs client-side (SRT TextTrack pipeline). On webOS 4 the
    // minimal "Generic" profile declares no SubtitleProfiles, so subtitles=auto
    // makes PMS burn the sub in → full transcode → Direct Play disabled. Tell it
    // subtitles=none so it direct-plays/streams the video untouched; we fetch
    // the SRT sidecar ourselves. webOS 5+ keeps the soft-mux (auto) path.
    params.subtitles = isWebOs4Tv() ? 'none' : 'auto';
  } else if (session.subtitleStreamId != null && session.subtitleBurnIn === true) {
    Object.assign(params, buildSubtitleTranscodeParams(
      session.subtitleStreamId,
      session.subtitleOffset,
      {
        burnIn: true,
        clientSubtitles: false,
        advancedSubtitles: session.subtitleAdvancedBurn ? 'burn' : undefined
      }
    ));
  }
  return buildMinimalDecisionParams(params, path);
}

function buildDecisionRequestParams(server, partKey, session, protocol) {
  var flags = buildDecisionRequestFlags(session);
  return buildMinimalDecisionRequestParams(server, partKey, session, flags);
}

function buildPlaybackUrl(server, partKey, session, protocol, strategyOverride) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildTranscodeParams(server, partKey, session, protocol, strategyOverride);
  if (protocol === 'http') {
    return serverUrl(server.connectionUri, '/video/:/transcode/universal/start', params, server);
  }
  return serverUrl(server.connectionUri, '/video/:/transcode/universal/start.m3u8', params, server);
}

function buildDecisionParams(server, partKey, session, protocol) {
  return buildDecisionRequestParams(server, partKey, session, protocol);
}

function buildDecisionHeaders(server, session) {
  var clientSessionId = session &&
    (session.playbackSessionId || session.sessionId) || null;
  var headers = plexHeaders({ Accept: 'application/xml' });
  var token = getServerToken(server);
  if (token) headers['X-Plex-Token'] = token;
  if (clientSessionId) headers['X-Plex-Session-Identifier'] = clientSessionId;
  return headers;
}

function decisionErrorDetails(err) {
  if (!err || !err.status) return '';
  var detail = ' HTTP ' + err.status;
  if (err.status === 400 && err.body) {
    detail += ' body="' + String(err.body).replace(/\s+/g, ' ').slice(0, 240) + '"';
  }
  return detail;
}

function buildDecisionUrl(server, partKey, session, protocol) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildDecisionParams(server, partKey, session, protocol);
  return buildUniversalDecisionUrl(server.connectionUri, params);
}

function applyPmsDeliveryFromDecision(session, partProtocol) {
  if (!session) return;
  var protocol = partProtocol || null;
  session.pmsDeliveryProtocol = protocol;
  session.commitToHlsDelivery = isSegmentedDeliveryProtocol(protocol);
}

function resolveStrategyFromDecision(parsed, session, requestProtocol) {
  if (parsed && parsed.part && parsed.part.decision) {
    var strategy = strategyFromPartDecision(parsed.part.decision);
    var partDecision = parsed.part.decision;
    var partProtocol = parsed.part.protocol;
    var quality = sessionQualityKey(session);
    if (requiresServerTranscode(quality) &&
        (partDecision === 'copy' || partDecision === 'directplay')) {
      console.info(
        '[playback] quality override: PMS said ' + partDecision +
          ', forcing transcode for ' + quality
      );
      strategy = 'transcode';
    }
    applyPmsDeliveryFromDecision(session, partProtocol);
    /* Honor explicit HTTP fallback from the screen; otherwise follow PMS protocol. */
    if (session.playbackStrategy === 'http-transcode') {
      if (strategy === 'transcode') {
        return { strategy: 'http-transcode', protocol: 'http' };
      }
    } else if (partProtocol === 'http' && strategy !== 'direct') {
      return { strategy: 'http-transcode', protocol: 'http' };
    } else if (isSegmentedDeliveryProtocol(partProtocol)) {
      return {
        strategy: strategy,
        protocol: partProtocol
      };
    }
    return {
      strategy: strategy,
      protocol: partProtocol || requestProtocol
    };
  }
  applyPmsDeliveryFromDecision(session, requestProtocol);
  session.commitToHlsDelivery = isSegmentedDeliveryProtocol(requestProtocol);
  return {
    strategy: resolvePlaybackStrategy(session),
    protocol: requestProtocol
  };
}

function buildDecisionRetryUrl(server, partKey, session, flagOverrides) {
  return buildUniversalDecisionUrl(
    server.connectionUri,
    buildMinimalDecisionRequestParams(server, partKey, session, flagOverrides)
  );
}

function buildFirstDecisionUrl(server, partKey, session, protocol) {
  return buildDecisionRetryUrl(server, partKey, session, {
    directPlay: '1',
    directStream: '1',
    directStreamAudio: '1'
  });
}

/**
 * Ask PMS how to deliver this item; adopt resourceSession + Part@decision.
 */
function requestPlaybackDecision(server, partKey, session, protocol) {
  var url = buildFirstDecisionUrl(server, partKey, session, protocol);
  if (!url) {
    return Promise.resolve(resolveStrategyFromDecision(null, session, protocol));
  }
  tvLog('session', 'decision request', { url: redactPlexUrl(url) });
  var headers = buildDecisionHeaders(server, session);

  function fetchDecision(decisionUrl) {
    return fetchText(decisionUrl, {
      headers: headers,
      timeout: 15000
    });
  }

  function handleDecisionBody(body) {
    var bodyStr = String(body || '').replace(/\s+/g, ' ');
    tvLog('session', 'decision response body', {
      body: bodyStr.slice(0, 800)
    });
    // The per-Stream decisions name exactly which track PMS refuses to direct
    // play and why (e.g. videoCodec/container/audioCodec). The container-level
    // text is generic ("Direct play is disabled"); the Stream tags carry the
    // real reason, so surface them explicitly.
    var streamTags = bodyStr.match(/<Stream\b[^>]*>/gi) || [];
    streamTags.forEach(function (tag) {
      var dt = (tag.match(/decisionText=("|')(.*?)\1/i) || [])[2];
      if (!dt) return;
      tvLog('session', 'stream decision', {
        type: (tag.match(/streamType=("|')(.*?)\1/i) || [])[2],
        codec: (tag.match(/\bcodec=("|')(.*?)\1/i) || [])[2],
        decision: (tag.match(/\bdecision=("|')(.*?)\1/i) || [])[2],
        why: dt
      });
    });
    var parsed = parseTranscodeDecision(body, session);
    if (session) {
      if (parsed.resourceSession) {
        session.transcodeSessionId = parsed.resourceSession;
        tvLog('session', 'decision resourceSession', {
          resourceSession: parsed.resourceSession
        });
      } else {
        session.transcodeSessionId = session.playbackSessionId || session.sessionId;
        tvLog('session', 'decision resourceSession missing, using client session', {
          resourceSession: session.transcodeSessionId
        });
      }
    }
    var resolved = resolveStrategyFromDecision(parsed, session, protocol);
    if (parsed.part && parsed.part.decision) {
      session.pmsPlaybackDecision = parsed.part.decision;
    }
    session.playbackStrategy = resolved.strategy;
    logPlaybackDecisionOutcome(session, parsed, resolved);
    return resolved;
  }

  function tryDecision400Retries() {
    var transcodeUrl = buildDecisionRetryUrl(server, partKey, session, {
      directPlay: '0',
      directStream: '0',
      directStreamAudio: '0'
    });
    tvLog('session', 'decision retry transcode flags', { url: redactPlexUrl(transcodeUrl) });
    return fetchDecision(transcodeUrl).then(handleDecisionBody);
  }

  function logDecisionFailure(err, decisionUrl) {
    var body = err && err.body
      ? String(err.body).replace(/\s+/g, ' ').slice(0, 300)
      : '';
    console.warn(
      '[playback] decision failed for ' + redactPlexUrl(decisionUrl) +
        decisionErrorDetails(err) + ': ' +
        (err && err.message ? err.message : String(err))
    );
    tvLog('session', 'decision failed', {
      url: redactPlexUrl(decisionUrl),
      status: err && err.status ? err.status : 0,
      error: err && err.message ? err.message : String(err),
      body: body
    });
  }

  // A failed /decision must never dead-end playback: PMS issues no transcode
  // session, so fall through to progressive HTTP transcode using the client
  // session id (mirrors the missing-resourceSession branch in handleDecisionBody).
  function fallbackToHttpTranscode(err) {
    if (session) {
      session.transcodeSessionId = session.playbackSessionId || session.sessionId;
      session.playbackStrategy = 'http-transcode';
      session.pmsDeliveryProtocol = 'http';
      session.commitToHlsDelivery = false;
    }
    tvLog('session', 'decision failed → http-transcode fallback', {
      status: err && err.status ? err.status : 0
    });
    return { strategy: 'http-transcode', protocol: 'http' };
  }

  return fetchDecision(url).then(handleDecisionBody).catch(function (err) {
    if (err && err.status === 400) {
      return tryDecision400Retries().catch(function (retryErr) {
        logDecisionFailure(retryErr || err, url);
        return fallbackToHttpTranscode(retryErr || err);
      });
    }
    logDecisionFailure(err, url);
    return fallbackToHttpTranscode(err);
  });
}

function buildDirectPlayUrl(server, partKey) {
  var path = normalizePlexPath(partKey);
  return serverUrl(server.connectionUri, path, {}, server);
}

function logPlaybackDecisionOutcome(session, parsed, resolved) {
  var quality = sessionQualityKey(session);
  var profile = getProfile(quality);
  var parts = [
    'quality=' + quality,
    'strategy=' + resolved.strategy
  ];
  if (profile.maxVideoBitrate) parts.push('maxVideoBitrate=' + profile.maxVideoBitrate);
  if (profile.videoResolution) parts.push('videoResolution=' + profile.videoResolution);
  if (parsed && parsed.part) {
    parts.push('decision=' + (parsed.part.decision || 'unknown'));
    if (parsed.part.protocol) parts.push('protocol=' + parsed.part.protocol);
  }
  if (session.commitToHlsDelivery) parts.push('delivery=hls-committed');
  console.info('[playback] ' + parts.join(' '));
  tvError('session', 'decision ' + parts.join(' '));
  var v = session.version || {};
  var dev = getState().deviceInfo || {};
  tvLog('session', 'decision why', {
    source: {
      container: v.container,
      videoCodec: v.videoCodec,
      videoProfile: v.videoProfile,
      videoResolution: v.videoResolution,
      width: v.width,
      height: v.height,
      bitrateKbps: v.bitrate,
      audioCodec: v.audioCodec
    },
    device: { uhd: dev.uhd, hdr10: dev.hdr10, dolbyVision: dev.dolbyVision, model: dev.model }
  });
}

function createSession(item, version, options) {
  options = options || {};
  var server = getState().activeServer;
  var partKey = (version && version.partKey) || item.key;
  var offset = options.offset != null ? options.offset : (item.viewOffset || 0);
  var session = {
    item: item,
    version: version,
    server: server,
    offset: offset,
    sessionId: 'xplay-' + Date.now(),
    playbackSessionId: options.playbackSessionId || generateClientPlaybackSessionId(),
    mediaIndex: options.mediaIndex != null ? options.mediaIndex : 0,
    partIndex: options.partIndex != null ? options.partIndex : 0,
    audioStreamId: options.audioStreamId,
    subtitleStreamId: options.subtitleStreamId,
    subtitleOffset: options.subtitleOffset || 0,
    subtitleBurnIn: options.subtitleBurnIn === true,
    subtitleAdvancedBurn: options.subtitleAdvancedBurn === true,
    quality: options.quality,
    forceTranscode: options.forceTranscode,
    playbackStrategy: options.playbackStrategy,
    transcodeProtocol: options.transcodeProtocol || 'hls'
  };
  tvLog('session', 'created', {
    ratingKey: item && item.ratingKey,
    offsetMs: offset,
    quality: session.quality,
    strategy: session.playbackStrategy,
    protocol: session.transcodeProtocol
  });
  return session;
}

function resolveStreamMode(strategy, protocol) {
  if (strategy === 'direct') return 'direct';
  if (strategy === 'direct-stream') return 'direct-stream';
  if (strategy === 'http-transcode' || protocol === 'http') return 'transcode-http';
  return 'transcode-hls';
}

function shouldSelectPartSubtitleBeforePlay(session) {
  return session.subtitleStreamId != null;
}

function probeHlsPlaylistOrReject(server, url, session) {
  if (!isHlsUrl(url)) return Promise.resolve();
  var headers = plexHeaders({});
  var token = getServerToken(server);
  if (token) headers['X-Plex-Token'] = token;
  if (session && (session.playbackSessionId || session.sessionId)) {
    headers['X-Plex-Session-Identifier'] = session.playbackSessionId || session.sessionId;
  }
  return fetchText(url, { headers: headers, timeout: 10000 }).then(function (body) {
    var diag = extractHlsManifestDiagnostics(body);
    if (!diag.isM3u8) {
      var invalid = new Error('Plex start.m3u8 did not return a valid HLS playlist.');
      invalid.status = 502;
      throw invalid;
    }
    tvLog('session', 'start.m3u8 probe ok', {
      status: 200,
      isM3u8: true,
      streamInfs: diag.streamInfs.slice(0, 2),
      snippet: diag.snippet.slice(0, 240),
      url: redactPlexUrl(url)
    });
  }).catch(function (err) {
    var status = err && err.status;
    var message = status === 400
      ? 'Plex rejected start.m3u8 (HTTP 400). Transcode session may not match /decision.'
      : 'Plex start.m3u8 probe failed' + (status ? ' (HTTP ' + status + ')' : '');
    tvError('session', 'start.m3u8 probe failed', {
      status: status,
      error: err && err.message ? err.message : String(err),
      body: err && err.body ? String(err.body).replace(/\s+/g, ' ').slice(0, 300) : '',
      url: redactPlexUrl(url)
    });
    var out = new Error(message);
    out.status = status;
    throw out;
  });
}

function resolveStreamUrl(session) {
  if (!session || !session.server) {
    var noServerErr = new Error('No Plex server connected. Return to library and try again.');
    tvError('session', 'resolveStreamUrl failed', noServerErr.message);
    return Promise.reject(noServerErr);
  }
  if (!session.server.connectionUri) {
    var noUriErr = new Error('Plex server has no connection URL. Check network in Settings.');
    tvError('session', 'resolveStreamUrl failed', noUriErr.message);
    return Promise.reject(noUriErr);
  }
  var server = session.server;
  var partKey = resolveSessionPartPath(session);
  if (!partKey) {
    var noPartErr = new Error('Could not resolve media file path for playback.');
    tvError('session', 'resolveStreamUrl failed', noPartErr.message);
    return Promise.reject(noPartErr);
  }
  /* Ask /decision for HLS unless the user explicitly requested HTTP fallback. */
  var requestProtocol = session.playbackStrategy === 'http-transcode'
    ? 'http'
    : 'hls';

  var pre = shouldSelectPartSubtitleBeforePlay(session)
    ? selectPartSubtitleStream(server, session)
    : Promise.resolve();

  return Promise.all([
    pre,
    requestPlaybackDecision(server, partKey, session, requestProtocol)
  ]).then(function (results) {
    var resolved = results[1];
    try {
      var strategy = resolved.strategy;
      var protocol = resolved.protocol || requestProtocol;
      if (strategy === 'direct') {
        var directUrl = buildDirectPlayUrl(server, partKey);
        tvLog('session', 'url direct play', { url: redactPlexUrl(directUrl) });
        return {
          url: directUrl,
          mode: 'direct'
        };
      }
      var startProtocol = strategy === 'http-transcode' ? 'http' : protocol;
      // webOS 4: the fMP4 HLS path is broken — for HEVC/DV content PMS emits an
      // #EXT-X-MAP init segment (/base/header) that 404s during startup and
      // hangs playback forever (plain .ts segments and progressive HTTP both
      // work). Deliver any segmented transcode/copy strategy as progressive
      // HTTP instead: copy→progressive MP4 preserves DV, transcode→progressive
      // MP4 still plays. True direct play (strategy 'direct') is already
      // progressive and left untouched.
      if (isWebOs4Tv() && isSegmentedDeliveryProtocol(startProtocol) &&
          (strategy === 'direct-stream' || strategy === 'transcode')) {
        startProtocol = 'http';
        tvError('session', 'webOS4: HLS → progressive HTTP', { strategy: strategy });
      } else if (strategy === 'direct-stream' && prefersMp4RemuxForDv(session)) {
        startProtocol = 'http';
        tvLog('session', 'DV MKV remux → progressive MP4', {
          container: session.version && session.version.container
        });
      }
      var playbackUrl = buildPlaybackUrl(server, partKey, session, startProtocol, strategy);
      var mode = resolveStreamMode(strategy, startProtocol);
      tvLog('session', 'url ' + mode, {
        strategy: strategy,
        protocol: startProtocol,
        url: redactPlexUrl(playbackUrl)
      });
      if (startProtocol === 'http') {
        return {
          url: playbackUrl,
          mode: mode
        };
      }
      if (isWebOs4Tv()) {
        // Do NOT pre-probe with XHR on webOS 4. The XHR probe (Accept: application/json
        // + duplicated X-Plex-* headers) draws a spurious HTTP 400 from PMS that the
        // native HLS player never hits — the official Plex app just points <video> at
        // start.m3u8 and lets the TV fetch it. Hand the playlist straight to the native
        // player; a genuine failure surfaces via the video-error fallback chain.
        tvLog('session', 'webOS4 HLS: skip XHR probe, native player loads playlist', {
          url: redactPlexUrl(playbackUrl)
        });
        return {
          url: playbackUrl,
          mode: mode
        };
      }
      return probeHlsPlaylistOrReject(server, playbackUrl, session).then(function () {
        return {
          url: playbackUrl,
          mode: mode
        };
      }).catch(function (probeErr) {
        // Native HLS start rejected (non-webOS-4) — fall through to progressive HTTP
        // transcode rather than dead-ending.
        tvLog('session', 'start.m3u8 failed → http-transcode fallback', {
          status: probeErr && probeErr.status ? probeErr.status : 0
        });
        session.playbackStrategy = 'http-transcode';
        session.pmsDeliveryProtocol = 'http';
        session.commitToHlsDelivery = false;
        session.transcodeSessionId = session.playbackSessionId || session.sessionId;
        var httpUrl = buildPlaybackUrl(server, partKey, session, 'http', 'http-transcode');
        tvLog('session', 'url transcode-http (hls fallback)', {
          url: redactPlexUrl(httpUrl)
        });
        return { url: httpUrl, mode: 'transcode-http' };
      });
    } catch (buildErr) {
      tvError('session', 'build playback URL failed', buildErr && buildErr.message ? buildErr.message : buildErr);
      throw buildErr;
    }
  });
}

export {
  buildPlaybackUrl,
  buildDirectPlayUrl,
  buildDecisionRequestParams,
  applyPmsDeliveryFromDecision,
  createSession,
  resolveStreamUrl,
  resolvePlaybackStrategy,
  requestPlaybackDecision,
  buildFirstDecisionUrl,
  assignStartUrlSessionParams,
  requirePmsTranscodeSession
};
