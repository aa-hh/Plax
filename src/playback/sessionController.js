import { getState } from '../core/store.js';
import { serverUrl } from '../plex/client.js';
import { applyPlexClientFields } from '../plex/clientIdentity.js';
import {
  applyProfileToParams,
  isDirectPlayOnlyQuality
} from './qualityProfiles.js';
import { buildAudioTranscodeParam } from './tracks/audioTracks.js';
import { normalizePlexPath } from './plexPaths.js';
import {
  buildSubtitleTranscodeParams,
  resolveSessionPartPath,
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
  var path = normalizePlexPath(partKey);
  var strategy = resolvePlaybackStrategy(session);
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
      clientSubtitles: softTextSubs,
      remux: false
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
  function buildResult() {
    if (strategy === 'direct') {
      return {
        url: buildDirectPlayUrl(server, partKey),
        mode: 'direct'
      };
    }
    var protocol = strategy === 'http-transcode' ? 'http' : (session.transcodeProtocol || 'hls');
    return {
      url: buildPlaybackUrl(server, partKey, session, protocol),
      mode: resolveStreamMode(strategy, protocol)
    };
  }
  if (!shouldSelectPartSubtitleBeforePlay(session, strategy)) {
    return Promise.resolve(buildResult());
  }
  return selectPartSubtitleStream(server, session).then(function () {
    return buildResult();
  });
}

export {
  buildPlaybackUrl,
  buildDirectPlayUrl,
  createSession,
  resolveStreamUrl,
  resolvePlaybackStrategy
};
