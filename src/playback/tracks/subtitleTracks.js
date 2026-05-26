import { isGraphicalSubtitle } from '../capabilityProbe.js';
import { serverUrl } from '../../plex/client.js';
import { collectStreamsFromMedia } from './streamUtils.js';

function parseSubtitleStreams(media, options) {
  options = options || {};
  return collectStreamsFromMedia(media, 3).map(function (s, i) {
    var codec = (s.codec || '').toLowerCase();
    var graphical = isGraphicalSubtitle(codec);
    return {
      id: s.id,
      index: s.index,
      language: s.language || s.languageCode,
      codec: s.codec,
      title: s.title || s.language || ('Subtitle ' + (i + 1)),
      format: codec.indexOf('srt') >= 0 ? 'srt' : codec,
      graphical: graphical,
      requiresTranscode: graphical,
      selected: s.selected === '1'
    };
  }).filter(function (s) {
    if (options.includeGraphical) return true;
    return !s.graphical;
  });
}

function findSubtitleTrack(tracks, streamId) {
  if (streamId == null) return null;
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i].id === streamId) return tracks[i];
  }
  return null;
}

function canUseClientSubtitles(playbackMode, track) {
  if (!track || track.graphical) return false;
  return playbackMode === 'direct';
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

function buildSubtitleTranscodeParams(streamId, offsetMs) {
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
  buildClientSubtitleUrl
};
