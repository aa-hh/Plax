import { getState } from '../core/store.js';
import { serverUrl, getClientId, PRODUCT, VERSION } from '../plex/client.js';
import {
  applyProfileToParams,
  isDirectPlayOnlyQuality
} from './qualityProfiles.js';
import { buildAudioTranscodeParam } from './tracks/audioTracks.js';
import {
  buildSubtitleTranscodeParams,
  resolveSessionPartPath,
  offsetSecondsForPlex,
  getActiveTranscodeSession
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
  return 'direct';
}

function buildTranscodeParams(server, partKey, session, protocol) {
  var prefs = getState().playbackPrefs || {};
  var path = partKey.indexOf('/') === 0 ? partKey : '/' + partKey;
  var strategy = resolvePlaybackStrategy(session);
  var fullTranscode = strategy === 'transcode' || strategy === 'http-transcode';
  var directStream = strategy === 'direct-stream';
  var params = {
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    fastSeek: '1',
    directPlay: fullTranscode ? '0' : (directStream ? '0' : '1'),
    directStream: fullTranscode ? '0' : '1',
    session: getActiveTranscodeSession(session) || session.sessionId || 'xplay-' + Date.now(),
    'X-Plex-Client-Identifier': getClientId(),
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Platform': 'LG webOS',
    'X-Plex-Device': 'TV'
  };
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  Object.assign(params, buildSubtitleTranscodeParams(
    session.subtitleStreamId,
    session.subtitleOffset,
    { burnIn: session.subtitleBurnIn === true }
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

function buildDirectPlayUrl(server, partKey) {
  var path = partKey.indexOf('/') === 0 ? partKey : '/' + partKey;
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

function resolveStreamUrl(session) {
  var server = session.server;
  var partKey = resolveSessionPartPath(session);

  var strategy = resolvePlaybackStrategy(session);
  if (strategy === 'direct') {
    return Promise.resolve({
      url: buildDirectPlayUrl(server, partKey),
      mode: 'direct'
    });
  }
  var protocol = strategy === 'http-transcode' ? 'http' : (session.transcodeProtocol || 'hls');
  return Promise.resolve({
    url: buildPlaybackUrl(server, partKey, session, protocol),
    mode: resolveStreamMode(strategy, protocol)
  });
}

export {
  buildPlaybackUrl,
  buildDirectPlayUrl,
  createSession,
  resolveStreamUrl,
  resolvePlaybackStrategy
};
