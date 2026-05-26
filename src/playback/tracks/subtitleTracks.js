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
      key: s.key || null,
      language: s.language || s.languageCode,
      codec: s.codec,
      title: s.title || s.language || ('Subtitle ' + (i + 1)),
      format: codec.indexOf('srt') >= 0 ? 'srt' : (s.format || codec),
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

/** Human-readable subtitle container/codec label (SRT, ASS, PGS, …). */
function subtitleFormatLabel(track) {
  if (!track) return '';
  var codec = String(track.codec || '').toLowerCase();
  var fmt = String(track.format || '').toLowerCase();

  if (codec.indexOf('pgs') >= 0 || fmt.indexOf('pgs') >= 0) return 'PGS';
  if (codec.indexOf('vobsub') >= 0 || codec.indexOf('dvd_subtitle') >= 0 ||
      fmt.indexOf('vobsub') >= 0) return 'VOBSUB';
  if (codec.indexOf('subrip') >= 0 || codec.indexOf('srt') >= 0 || fmt === 'srt') return 'SRT';
  if (codec.indexOf('ass') >= 0 || codec.indexOf('ssa') >= 0 || fmt === 'ass') return 'ASS';
  if (codec.indexOf('webvtt') >= 0 || codec.indexOf('vtt') >= 0 || fmt === 'vtt') return 'VTT';
  if (codec.indexOf('mov_text') >= 0) return 'TX3G';
  if (codec.indexOf('microdvd') >= 0) return 'SUB';
  if (codec.indexOf('sami') >= 0) return 'SAMI';
  if (codec.indexOf('ttml') >= 0) return 'TTML';

  var token = (fmt || codec).split('_').pop();
  if (token && token.length <= 10) return token.toUpperCase();
  return '';
}

function subtitleMenuOptionLabel(track) {
  if (!track) return '';
  var title = subtitleDisplayTitle(track);
  var type = subtitleFormatLabel(track);
  return type ? title + ' · ' + type : title;
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
  var want = String(streamId);
  for (var i = 0; i < tracks.length; i++) {
    if (String(tracks[i].id) === want) return tracks[i];
  }
  return null;
}

function normalizePlexPath(path) {
  if (!path) return null;
  return path.indexOf('/') === 0 ? path : '/' + path;
}

/** Metadata path for transcode/subtitle APIs (/library/metadata/{id}). */
function resolveSessionMetadataPath(session) {
  if (!session || !session.item) return null;
  var itemKey = session.item.key;
  if (itemKey) return normalizePlexPath(itemKey);
  if (session.item.ratingKey) {
    return '/library/metadata/' + session.item.ratingKey;
  }
  return null;
}

/** Part path for direct play / transcode start (/library/parts/...). */
function resolveSessionPartPath(session) {
  if (!session) return null;
  var partKey = session.version && session.version.partKey;
  if (!partKey && session.item && session.item.media && session.item.media[0]) {
    var media = session.item.media[session.mediaIndex || 0] || session.item.media[0];
    var parts = media._children || media._nested || [];
    var part = parts[session.partIndex || 0] || parts[0];
    if (part) partKey = part.key;
  }
  if (!partKey) return resolveSessionMetadataPath(session);
  return normalizePlexPath(partKey);
}

function subtitleOutputFormat(track) {
  if (!track) return 'srt';
  if (track.format) return track.format;
  var codec = (track.codec || '').toLowerCase();
  if (codec.indexOf('srt') >= 0 || codec.indexOf('subrip') >= 0) return 'srt';
  if (codec.indexOf('ass') >= 0 || codec.indexOf('ssa') >= 0) return 'ass';
  if (codec.indexOf('vtt') >= 0 || codec.indexOf('webvtt') >= 0) return 'vtt';
  return 'srt';
}

function resolveStreamKeyPath(track) {
  if (!track) return null;
  if (track.key) return normalizePlexPath(track.key);
  if (track.id != null) return '/library/streams/' + track.id;
  return null;
}

/** directPlay flags for universal/subtitle transcode — match active playback mode. */
function subtitleDirectFlagsForMode(playbackMode) {
  if (playbackMode === 'transcode-hls' || playbackMode === 'transcode-http') {
    return { directPlay: '0', directStream: '0', directStreamAudio: '1' };
  }
  if (playbackMode === 'direct-stream') {
    return { directPlay: '0', directStream: '1', directStreamAudio: '1' };
  }
  return { directPlay: '1', directStream: '1', directStreamAudio: '1' };
}

/** Direct stream fetch — same approach as Plex clients (stream.key + encoding/format). */
function buildStreamKeySubtitleUrl(server, track) {
  if (!server || !track) return null;
  var path = resolveStreamKeyPath(track);
  if (!path) return null;
  var params = {
    encoding: 'utf-8',
    format: subtitleOutputFormat(track)
  };
  return serverUrl(server.connectionUri, path, params, server);
}

function buildUniversalSubtitleUrl(server, session, mediaPath, track, playbackMode) {
  if (!server || !session || session.subtitleStreamId == null || !mediaPath) return null;
  var directFlags = subtitleDirectFlagsForMode(playbackMode);
  var params = Object.assign({
    path: mediaPath,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    encoding: 'utf-8',
    subtitleFormat: subtitleOutputFormat(track),
    'X-Plex-Subtitle-Stream': String(session.subtitleStreamId)
  }, directFlags);
  if (session.sessionId && directFlags.directPlay === '0') {
    params.session = session.sessionId;
  }
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

function pushUniqueUrl(list, url) {
  if (!url || list.indexOf(url) >= 0) return;
  list.push(url);
}

/** Ordered subtitle URL candidates — try stream key first, then metadata/part transcode paths. */
function buildClientSubtitleUrlCandidates(server, session, track, options) {
  options = options || {};
  var urls = [];
  if (!server || !session || session.subtitleStreamId == null) return urls;

  var resolvedTrack = track || null;
  var playbackMode = options.playbackMode || 'direct';

  pushUniqueUrl(urls, buildStreamKeySubtitleUrl(server, resolvedTrack));

  var metadataPath = resolveSessionMetadataPath(session);
  pushUniqueUrl(urls, buildUniversalSubtitleUrl(
    server, session, metadataPath, resolvedTrack, playbackMode
  ));

  var partPath = resolveSessionPartPath(session);
  if (partPath && partPath !== metadataPath) {
    pushUniqueUrl(urls, buildUniversalSubtitleUrl(
      server, session, partPath, resolvedTrack, playbackMode
    ));
  }

  return urls;
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

function buildClientSubtitleUrl(server, session, track) {
  var urls = buildClientSubtitleUrlCandidates(server, session, track);
  return urls.length ? urls[0] : null;
}

function buildSubtitleTranscodeParams(streamId, offsetMs, options) {
  options = options || {};
  if (options.burnIn === false) return {};
  var p = {};
  if (streamId != null) {
    p['X-Plex-Subtitle-Stream'] = String(streamId);
    p.subtitleFormat = 'srt';
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
  resolveStreamKeyPath,
  resolveSessionMetadataPath,
  resolveSessionPartPath,
  subtitleDirectFlagsForMode,
  buildClientSubtitleUrlCandidates,
  canUseClientSubtitles,
  isClientSubtitlePlaybackMode,
  shouldBurnInSubtitle,
  buildClientSubtitleUrl,
  subtitleDisplayTitle,
  subtitleFormatLabel,
  subtitleMenuOptionLabel,
  pickDefaultSubtitleTrack
};
