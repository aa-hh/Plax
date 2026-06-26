import { getState } from '../core/store.js';
import { getBackend } from '../backends/index.js';
import { tvLog } from '../utils/tvDebug.js';

/** Plex Web-style client playback id (distinct from PMS transcode session query param). */
function generateClientPlaybackSessionId() {
  var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var i = 0; i < 24; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
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
    sessionId: 'plax-' + Date.now(),
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
    protocol: session.transcodeProtocol,
    mediaIndex: session.mediaIndex,
    versionContainer: version && version.container,
    versionAudioCodec: version && version.audioCodec
  });
  return session;
}

/**
 * Provider-agnostic delegator. Both backends implement the playback contract
 * (resolveStreamUrl / buildSubtitlePlan); the active backend owns the actual
 * decision + URL build. Plex's lives in src/backends/plex/playback.js, Jellyfin's
 * in src/backends/jellyfin/playback.js.
 */
function resolveStreamUrl(session) {
  return getBackend().resolveStreamUrl(session);
}

export {
  createSession,
  resolveStreamUrl
};
