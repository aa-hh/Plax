import { isGraphicalSubtitle } from '../capabilityProbe.js';
import { serverUrl } from '../../plex/client.js';
import { collectStreamsFromMedia } from './streamUtils.js';

function parseSubtitleStreams(media, options) {
  options = options || {};
  return collectStreamsFromMedia(media, 3).map(function (s, i) {
    var codec = (s.codec || '').toLowerCase();
    var graphical = isGraphicalSubtitle(codec);
    var forced = s.forced === '1' || s.forced === true || s.forced === 1;
    var hearingImpaired = s.hearingImpaired === '1' || s.hearingImpaired === true ||
      s.hearingImpaired === 1;
    return {
      id: s.id,
      index: s.index,
      language: s.language || s.languageCode,
      codec: s.codec,
      title: s.title || s.language || ('Subtitle ' + (i + 1)),
      format: codec.indexOf('srt') >= 0 ? 'srt' : codec,
      graphical: graphical,
      requiresTranscode: graphical,
      forced: forced,
      hearingImpaired: hearingImpaired,
      selected: s.selected === '1'
    };
  }).filter(function (s) {
    if (options.includeGraphical) return true;
    return !s.graphical;
  });
}

function subtitleDisplayTitle(track) {
  if (!track) return '';
  var title = track.title || 'Subtitle';
  if (track.forced) return title + ' (Forced)';
  if (track.hearingImpaired) return title + ' (SDH)';
  return title;
}

/** Plex-selected track, else single forced track, else first non-SDH, else first. */
function pickDefaultSubtitleTrack(tracks) {
  if (!tracks || !tracks.length) return null;
  var selected = null;
  var i;
  for (i = 0; i < tracks.length; i++) {
    if (tracks[i].selected) {
      selected = tracks[i];
      break;
    }
  }
  if (selected) return selected;
  var forced = tracks.filter(function (t) { return t.forced; });
  if (forced.length === 1) return forced[0];
  for (i = 0; i < tracks.length; i++) {
    if (!tracks[i].hearingImpaired) return tracks[i];
  }
  return tracks[0];
}

function findSubtitleTrack(tracks, streamId) {
  if (streamId == null) return null;
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i].id === streamId) return tracks[i];
  }
  return null;
}

/** Playback modes that can load Plex SRT via TextTrack without burn-in. */
var CLIENT_SUBTITLE_MODES = {
  direct: true,
  'direct-stream': true,
  'transcode-hls': true,
  'transcode-http': true
};

function isClientSubtitlePlaybackMode(playbackMode) {
  return !!CLIENT_SUBTITLE_MODES[playbackMode];
}

function shouldBurnInSubtitle(track) {
  return !!(track && track.graphical);
}

function canUseClientSubtitles(playbackMode, track) {
  if (!track || track.graphical) return false;
  return isClientSubtitlePlaybackMode(playbackMode);
}

function buildClientSubtitleUrl(server, session) {
  if (!server || !session || session.subtitleStreamId == null) return null;
  var itemKey = session.item && session.item.key;
  var path = itemKey
    ? (itemKey.indexOf('/') === 0 ? itemKey : '/' + itemKey)
    : null;
  if (!path && session.version && session.version.partKey) {
    path = session.version.partKey.indexOf('/') === 0
      ? session.version.partKey
      : '/' + session.version.partKey;
  }
  if (!path) return null;
  var params = {
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    format: 'srt',
    'X-Plex-Subtitle-Stream': String(session.subtitleStreamId)
  };
  if (session.subtitleOffset) {
    params['X-Plex-Subtitle-Offset'] = String(session.subtitleOffset);
  }
  return serverUrl(
    server.connectionUri,
    '/video/:/transcode/universal/subtitles',
    params,
    server
  );
}

function buildSubtitleTranscodeParams(streamId, offsetMs, options) {
  options = options || {};
  if (options.burnIn === false) return {};
  var p = {};
  if (streamId != null) {
    p['X-Plex-Subtitle-Stream'] = String(streamId);
    p['subtitleFormat'] = 'srt';
  }
  if (offsetMs) {
    p['X-Plex-Subtitle-Offset'] = String(offsetMs);
  }
  return p;
}

export {
  parseSubtitleStreams,
  buildSubtitleTranscodeParams,
  findSubtitleTrack,
  canUseClientSubtitles,
  isClientSubtitlePlaybackMode,
  shouldBurnInSubtitle,
  buildClientSubtitleUrl,
  subtitleDisplayTitle,
  pickDefaultSubtitleTrack
};
