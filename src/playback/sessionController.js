import { getState } from '../core/store.js';
import {
  serverUrl,
  fetchText,
  plexHeaders,
  getServerToken,
  redactPlexUrl
} from '../plex/client.js';
import { applyPlexClientFields } from '../plex/clientIdentity.js';
import { buildQuery } from '../utils/fetch.js';
import {
  applyProfileToParams,
  isDirectPlayOnlyQuality
} from './qualityProfiles.js';
import { buildAudioTranscodeParam } from './tracks/audioTracks.js';
import { normalizePlexPath } from './plexPaths.js';
import {
  buildSubtitleTranscodeParams,
  resolveSessionPartPath,
  resolveSessionMetadataPath,
  offsetSecondsForPlex,
  getActiveTranscodeSession,
  upgradeStrategyForTextSubtitles,
  plexLocationForServer,
  selectPartSubtitleStream
} from './tracks/subtitleTracks.js';
import {
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams
} from './hlsPolicy.js';

function resolvePlaybackStrategy(session) {
  var prefs = getState().playbackPrefs || {};
  var quality = session.quality || prefs.quality || 'auto';
  if (session.playbackStrategy) return session.playbackStrategy;
  if (isDirectPlayOnlyQuality(quality) && !session.forceTranscode) {
    return 'direct';
  }
  if (session.forceTranscode || prefs.directPlay === false) {
    return session.transcodeProtocol === 'http' ? 'http-transcode' : 'transcode';
  }
  return upgradeStrategyForTextSubtitles('direct', session);
}

function buildTranscodeParams(server, partKey, session, protocol) {
  var prefs = getState().playbackPrefs || {};
  var strategy = resolvePlaybackStrategy(session);
  var path = resolveSessionMetadataPath(session) || normalizePlexPath(partKey);
  var fullTranscode = strategy === 'transcode' || strategy === 'http-transcode';
  var directStream = strategy === 'direct-stream';
  var transcodeSession = getActiveTranscodeSession(session) ||
    session.sessionId || 'xplay-' + Date.now();
  /* Plex transcoder API (https://developer.plex.tv/pms/#tag/Transcoder/operation/transcodeStart):
   *   - directStreamAudio=1 lets PMS keep the audio track unchanged when remuxing
   *   - hasMDE=1 lets PMS skip its built-in profile gating; required pair with directPlay
   *   - mediaBufferSize advertises the client buffer so PMS doesn't assume bandwidth-constrained
   *   - autoAdjustQuality=0 disables server-driven ABR; we control quality from the menu
   *   - X-Plex-Session-Identifier identifies the playback session (separate from `session=` UUID
   *     which is the transcode session ID). Real Plex Web sends both. */
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
    session: transcodeSession,
    transcodeSessionId: transcodeSession,
    'X-Plex-Session-Identifier': transcodeSession,
    location: plexLocationForServer(server)
  });
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  var softTextSubs = directStream && session.subtitleStreamId != null &&
    session.subtitleBurnIn !== true;
  Object.assign(params, buildSubtitleTranscodeParams(
    session.subtitleStreamId,
    session.subtitleOffset,
    {
      burnIn: session.subtitleBurnIn === true,
      clientSubtitles: false,
      remux: softTextSubs,
      segmented: softTextSubs
    }
  ));

  if (protocol === 'http') {
    buildHttpTranscodeFallbackParams(params);
  } else {
    applyWebOsHlsTranscodeParams(params);
  }

  return params;
}

function buildPlaybackUrl(server, partKey, session, protocol) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildTranscodeParams(server, partKey, session, protocol);
  if (protocol === 'http') {
    return serverUrl(server.connectionUri, '/video/:/transcode/universal/start', params, server);
  }
  return serverUrl(server.connectionUri, '/video/:/transcode/universal/start.m3u8', params, server);
}

function endpointUrl(base, path, params) {
  var q = buildQuery(params || {});
  return base.replace(/\/$/, '') + path + (q ? '?' + q : '');
}

function buildDecisionParams(server, partKey, session, protocol) {
  var full = buildTranscodeParams(server, partKey, session, protocol);
  var params = {};
  [
    'path',
    'mediaIndex',
    'partIndex',
    'fastSeek',
    'hasMDE',
    'directPlay',
    'directStream',
    'directStreamAudio',
    'autoAdjustQuality',
    'mediaBufferSize',
    'session',
    'transcodeSessionId',
    'location',
    'offset',
    'maxVideoBitrate',
    'videoResolution',
    'protocol'
  ].forEach(function (key) {
    if (full[key] != null) params[key] = full[key];
  });
  params.path = resolveSessionMetadataPath(session) || full.path;
  return params;
}

function buildDecisionHeaders(server, session) {
  var transcodeSession = getActiveTranscodeSession(session) ||
    session.sessionId || null;
  var headers = plexHeaders({ Accept: 'application/xml' });
  var token = getServerToken(server);
  if (token) headers['X-Plex-Token'] = token;
  if (transcodeSession) headers['X-Plex-Session-Identifier'] = transcodeSession;
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

function extractDecisionResourceSession(xmlText) {
  if (!xmlText) return null;
  var match = String(xmlText).match(/\bresourceSession=(["'])(.*?)\1/);
  return match && match[2] ? match[2] : null;
}

/**
 * Prime the playback session with PMS by calling `/decision` before requesting
 * the actual stream. Plex Web and PMP do this on every play and the transcoder
 * relies on the session being registered first; skipping it can cause PMS to
 * fail when it tries to materialise the session during the start request
 * (the proxy then surfaces this as an HTTP 400 on `start.m3u8`).
 */
function buildDecisionUrl(server, partKey, session, protocol) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildDecisionParams(server, partKey, session, protocol);
  return endpointUrl(server.connectionUri, '/video/:/transcode/universal/decision', params);
}

function primePlaybackSession(server, partKey, session, protocol) {
  var url = buildDecisionUrl(server, partKey, session, protocol);
  if (!url) return Promise.resolve();
  return fetchText(url, {
    headers: buildDecisionHeaders(server, session),
    timeout: 15000
  }).then(function (body) {
    var resourceSession = extractDecisionResourceSession(body);
    if (resourceSession && session) session.transcodeSessionId = resourceSession;
    /* PMS uses 200 OK with a MediaContainer describing the chosen
     * delivery; we don't need the body, only the side effect of
     * registering the session. */
  }).catch(function (err) {
    console.warn(
      '[playback] decision prime failed for ' + redactPlexUrl(url) +
        decisionErrorDetails(err) + ': ' +
        (err && err.message ? err.message : String(err))
    );
  });
}

function buildDirectPlayUrl(server, partKey) {
  var path = normalizePlexPath(partKey);
  return serverUrl(server.connectionUri, path, {}, server);
}

function createSession(item, version, options) {
  options = options || {};
  var server = getState().activeServer;
  var partKey = (version && version.partKey) || item.key;
  var offset = options.offset != null ? options.offset : (item.viewOffset || 0);
  return {
    item: item,
    version: version,
    server: server,
    offset: offset,
    sessionId: 'xplay-' + Date.now(),
    mediaIndex: options.mediaIndex != null ? options.mediaIndex : 0,
    partIndex: options.partIndex != null ? options.partIndex : 0,
    audioStreamId: options.audioStreamId,
    subtitleStreamId: options.subtitleStreamId,
    subtitleOffset: options.subtitleOffset || 0,
    subtitleBurnIn: options.subtitleBurnIn === true,
    quality: options.quality,
    forceTranscode: options.forceTranscode,
    playbackStrategy: options.playbackStrategy,
    transcodeProtocol: options.transcodeProtocol || 'hls'
  };
}

function resolveStreamMode(strategy, protocol) {
  if (strategy === 'direct') return 'direct';
  if (strategy === 'direct-stream') return 'direct-stream';
  if (strategy === 'http-transcode' || protocol === 'http') return 'transcode-http';
  return 'transcode-hls';
}

function shouldSelectPartSubtitleBeforePlay(session, strategy) {
  return session.subtitleStreamId != null && (
    strategy === 'direct' || strategy === 'direct-stream'
  );
}

function resolveStreamUrl(session) {
  var server = session.server;
  var partKey = resolveSessionPartPath(session);

  var strategy = resolvePlaybackStrategy(session);
  var transcodeProtocol = strategy === 'http-transcode'
    ? 'http'
    : (session.transcodeProtocol || 'hls');

  function buildResult() {
    if (strategy === 'direct') {
      return {
        url: buildDirectPlayUrl(server, partKey),
        mode: 'direct'
      };
    }
    return {
      url: buildPlaybackUrl(server, partKey, session, transcodeProtocol),
      mode: resolveStreamMode(strategy, transcodeProtocol)
    };
  }
  function primeIfTranscode() {
    /* Direct play hits the raw part URL — PMS doesn't need a session
     * registered. Direct-stream and transcode go through the universal
     * transcoder and must be primed via `/decision` first. */
    if (strategy === 'direct') return Promise.resolve();
    return primePlaybackSession(server, partKey, session, transcodeProtocol);
  }
  var pre = shouldSelectPartSubtitleBeforePlay(session, strategy)
    ? selectPartSubtitleStream(server, session)
    : Promise.resolve();
  return pre.then(primeIfTranscode).then(buildResult);
}

export {
  buildPlaybackUrl,
  buildDirectPlayUrl,
  createSession,
  resolveStreamUrl,
  resolvePlaybackStrategy
};
