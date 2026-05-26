import { isGraphicalSubtitle } from '../capabilityProbe.js';
import { serverUrl, plexHeaders } from '../../plex/client.js';
import { fetchText } from '../../utils/fetch.js';
import { buildAudioTranscodeParam } from './audioTracks.js';
import { collectStreamsFromMedia } from './streamUtils.js';

/** @typedef {'graphical'|'embedded'|'sidecar'|'onDemand'} SubtitleDelivery */

function classifySubtitleDelivery(stream, graphical) {
  if (graphical) return 'graphical';
  if (stream.transient === '1' || stream.transient === true || stream.providerTitle) {
    return 'onDemand';
  }
  var loc = String(stream.location || '').toLowerCase();
  if (loc === 'embedded' || loc === 'internal') return 'embedded';
  if (loc === 'external' || loc === 'sidecar' || loc === 'downloaded') return 'sidecar';
  return 'embedded';
}

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
      delivery: classifySubtitleDelivery(s, graphical),
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

function isSidecarSubtitleTrack(track) {
  return !!(track && (track.delivery === 'sidecar' || track.delivery === 'onDemand'));
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

/** Plex transcode offset query param is in seconds; viewOffset is ms. */
function offsetSecondsForPlex(session) {
  if (!session) return 0;
  var raw = session.playbackOffsetMs != null ? session.playbackOffsetMs : (session.offset || 0);
  if (!raw) return 0;
  if (raw > 10000) return raw / 1000;
  return raw;
}

function parseTranscodeSessionFromUrl(url) {
  if (!url) return null;
  var m = String(url).match(/[?&]session=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function getActiveTranscodeSession(session) {
  if (!session) return null;
  return session.transcodeSessionId || null;
}

function protocolForPlaybackMode(playbackMode) {
  if (playbackMode === 'transcode-http') return 'http';
  if (playbackMode === 'direct-stream' || playbackMode === 'transcode-hls') return 'hls';
  return 'http';
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

function isDirectPlaybackMode(playbackMode) {
  return playbackMode === 'direct' || playbackMode === 'direct-stream';
}

/** Plex `location` query param — must match how the client reaches PMS. */
function plexLocationForServer(server) {
  if (server && server.activeConnection && server.activeConnection.local) return 'lan';
  return 'wan';
}

/**
 * PMS only accepts a `path=` whose host it recognises as itself. PMP runs on the
 * same machine as the server, so it can send `http://127.0.0.1:32400/...`; a
 * remote web/TV client cannot, and PMS rejects a public-facing URL with 400.
 * Web-style clients send a server-relative path (`/library/metadata/...`),
 * which PMS resolves against itself regardless of playback mode.
 */
function resolveTranscodeMediaPath(server, relativePath /* , playbackMode */) {
  return normalizePlexPath(relativePath);
}

function isClientGeneratedSessionId(sessionId) {
  return !!(sessionId && /^xplay-/i.test(String(sessionId)));
}

function extractPartIdFromPath(partPath) {
  if (!partPath) return null;
  var m = String(partPath).match(/^\/library\/parts\/(\d+)/);
  return m ? m[1] : null;
}

/** Tell PMS which subtitle stream is active on this part (PMP does this before universal fetch). */
function selectPartSubtitleStream(server, session) {
  if (!server || !session || session.subtitleStreamId == null) {
    return Promise.resolve();
  }
  var partId = extractPartIdFromPath(resolveSessionPartPath(session));
  if (!partId) return Promise.resolve();
  var url = serverUrl(server.connectionUri, '/library/parts/' + partId, {
    subtitleStreamID: String(session.subtitleStreamId),
    allParts: '1'
  }, server);
  return fetch(url, { method: 'PUT', headers: plexHeaders() }).then(function (res) {
    if (!res.ok) {
      console.warn('[subtitles] PUT /library/parts/' + partId + ' HTTP ' + res.status);
    }
  }).catch(function (err) {
    console.warn('[subtitles] stream selection failed:', err.message);
  });
}

/** Path for GET /library/streams/{streamId}.{ext} per PMS API. */
function resolveStreamKeyPathWithExt(track) {
  if (!track) return null;
  var fmt = subtitleOutputFormat(track);
  if (track.key) {
    var key = normalizePlexPath(track.key);
    if (/\.[a-z0-9]{2,5}$/i.test(key)) return key;
    return key + '.' + fmt;
  }
  if (track.id != null) return '/library/streams/' + track.id + '.' + fmt;
  return null;
}

function resolveStreamKeyPath(track) {
  var path = resolveStreamKeyPathWithExt(track);
  if (!path) return null;
  return path.replace(/\.[a-z0-9]{2,5}$/i, '');
}

/** Sidecar stream fetch — PMS GET /library/streams/{id}.{ext}. */
function buildStreamKeySubtitleUrl(server, track) {
  if (!server || !track) return null;
  var path = resolveStreamKeyPathWithExt(track);
  if (!path) return null;
  var params = {
    encoding: 'utf-8',
    format: subtitleOutputFormat(track)
  };
  return serverUrl(server.connectionUri, path, params, server);
}

function isAdvancedSubtitleCodec(track) {
  var codec = (track && track.codec || '').toLowerCase();
  return codec.indexOf('ass') >= 0 || codec.indexOf('ssa') >= 0;
}

function resolveSubtitleSessionId(session) {
  if (!session) return null;
  return getActiveTranscodeSession(session) || session.sessionId || null;
}

function buildUniversalTranscodeQuery(server, session, mediaPath, track, playbackMode, options) {
  options = options || {};
  if (!server || !session || session.subtitleStreamId == null || !mediaPath) return null;
  var directFlags = subtitleDirectFlagsForMode(playbackMode);
  var directPlayback = isDirectPlaybackMode(playbackMode);
  var offsetSec = offsetSecondsForPlex(session);
  var pathParam = resolveTranscodeMediaPath(server, mediaPath, playbackMode) || mediaPath;
  var params = Object.assign({
    path: pathParam,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    subtitles: options.subtitles || 'sidecar',
    hasMDE: '1',
    location: plexLocationForServer(server),
    protocol: directPlayback ? 'http' : protocolForPlaybackMode(playbackMode),
    fastSeek: '1'
  }, directFlags);
  if (options.omitSubtitleStreamId !== true) {
    params.subtitleStreamID = String(session.subtitleStreamId);
  }
  if (!directPlayback) {
    params.encoding = 'utf-8';
    params.directStreamAudio = directFlags.directStreamAudio;
    params['X-Plex-Subtitle-Stream'] = String(session.subtitleStreamId);
  }
  if (directPlayback) {
    params.copyts = '1';
    params.subtitleSize = '100';
    params.audioBoost = '100';
    delete params.directStreamAudio;
    if (session.audioStreamId != null) {
      Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
    }
  }
  if (offsetSec > 0) params.offset = String(offsetSec);
  var playbackSessionId = resolveSubtitleSessionId(session);
  if (playbackSessionId) {
    params.session = playbackSessionId;
  }
  if (session.subtitleOffset) {
    params['X-Plex-Subtitle-Offset'] = String(session.subtitleOffset);
  }
  if (isAdvancedSubtitleCodec(track) && options.advancedSubtitles) {
    params.advancedSubtitles = options.advancedSubtitles;
  }
  return params;
}

function buildUniversalTranscodeUrl(server, session, mediaPath, track, playbackMode, endpoint, options) {
  var params = buildUniversalTranscodeQuery(
    server, session, mediaPath, track, playbackMode, options
  );
  if (!params) return null;
  return serverUrl(
    server.connectionUri,
    '/video/:/transcode/universal/' + endpoint,
    params,
    server
  );
}

function buildUniversalSubtitleUrl(server, session, mediaPath, track, playbackMode, options) {
  return buildUniversalTranscodeUrl(
    server, session, mediaPath, track, playbackMode, 'subtitles', options
  );
}

/** Register the playback session with PMS before subtitle extract (matches Plex Media Player). */
function primeDirectPlaySubtitleSession(server, session, track, playbackMode) {
  if (!isDirectPlaybackMode(playbackMode) || !resolveSubtitleSessionId(session)) {
    return Promise.resolve();
  }
  var mediaPath = resolveSessionPartPath(session) || resolveSessionMetadataPath(session);
  var url = buildUniversalTranscodeUrl(
    server, session, mediaPath, track, playbackMode, 'decision',
    { subtitles: 'auto', omitSubtitleStreamId: true }
  );
  if (!url) return Promise.resolve();
  return fetchText(url, { timeout: 15000 }).catch(function (err) {
    console.warn('[subtitles] decision prime failed:', err.message);
  });
}

function prepareClientSubtitlePlayback(server, session, track, playbackMode) {
  return selectPartSubtitleStream(server, session).then(function () {
    return primeDirectPlaySubtitleSession(server, session, track, playbackMode);
  });
}

function pushSubtitleAttempt(list, label, url) {
  if (!url) return;
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].url === url) return;
  }
  list.push({ label: label, url: url });
}

/** @typedef {{ label: string, url: string }} SubtitleFetchAttempt */

/** Mode-aware ordered subtitle fetch attempts (embedded → universal; sidecar → stream then universal). */
function buildSubtitleFetchPlan(server, session, track, options) {
  options = options || {};
  /** @type {SubtitleFetchAttempt[]} */
  var attempts = [];
  if (!server || !session || session.subtitleStreamId == null) return attempts;

  var resolvedTrack = track || null;
  var playbackMode = options.playbackMode || 'direct';

  if (isSidecarSubtitleTrack(resolvedTrack)) {
    pushSubtitleAttempt(
      attempts,
      'stream-sidecar',
      buildStreamKeySubtitleUrl(server, resolvedTrack)
    );
  }

  var metadataPath = resolveSessionMetadataPath(session);
  var partPath = resolveSessionPartPath(session);
  var advanced = isAdvancedSubtitleCodec(resolvedTrack) ? 'convert' : null;
  var universalOpts = { advancedSubtitles: advanced };
  var embedded = resolvedTrack && !isSidecarSubtitleTrack(resolvedTrack);

  if (embedded && partPath) {
    pushSubtitleAttempt(attempts, 'universal-part-embedded', buildUniversalSubtitleUrl(
      server, session, partPath, resolvedTrack, playbackMode,
      Object.assign({}, universalOpts, { subtitles: 'embedded' })
    ));
    pushSubtitleAttempt(attempts, 'universal-part-embedded-session', buildUniversalSubtitleUrl(
      server, session, partPath, resolvedTrack, playbackMode,
      Object.assign({}, universalOpts, { subtitles: 'embedded', omitSubtitleStreamId: true })
    ));
  }

  pushSubtitleAttempt(attempts, 'universal-metadata-auto', buildUniversalSubtitleUrl(
    server, session, metadataPath, resolvedTrack, playbackMode,
    Object.assign({}, universalOpts, { subtitles: 'auto' })
  ));

  if (embedded) {
    pushSubtitleAttempt(attempts, 'universal-metadata-embedded', buildUniversalSubtitleUrl(
      server, session, metadataPath, resolvedTrack, playbackMode,
      Object.assign({}, universalOpts, { subtitles: 'embedded' })
    ));
  }

  pushSubtitleAttempt(attempts, 'universal-metadata-sidecar', buildUniversalSubtitleUrl(
    server, session, metadataPath, resolvedTrack, playbackMode,
    Object.assign({}, universalOpts, { subtitles: 'sidecar' })
  ));

  if (partPath && partPath !== metadataPath) {
    pushSubtitleAttempt(attempts, 'universal-part-sidecar', buildUniversalSubtitleUrl(
      server, session, partPath, resolvedTrack, playbackMode,
      Object.assign({}, universalOpts, { subtitles: 'sidecar' })
    ));
  }

  return attempts;
}

function subtitleFetchUrls(plan) {
  if (!plan || !plan.length) return [];
  return plan.map(function (attempt) {
    return typeof attempt === 'string' ? attempt : attempt.url;
  }).filter(Boolean);
}

/** @deprecated Use buildSubtitleFetchPlan */
function buildClientSubtitleUrlCandidates(server, session, track, options) {
  return buildSubtitleFetchPlan(server, session, track, options);
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

function buildClientSubtitleUrl(server, session, track, options) {
  var attempts = buildSubtitleFetchPlan(server, session, track, options);
  return attempts.length ? attempts[0].url : null;
}

/** True when another subtitle URL candidate may succeed (e.g. stream 501 → universal). */
function shouldRetrySubtitleFetch(err) {
  var status = err && err.status;
  if (!status || status === 401 || status === 403) return false;
  return status >= 400;
}

function hasTextSubtitleStream(session) {
  return !!(session && session.subtitleStreamId != null && session.subtitleBurnIn !== true);
}

/** Prefer HLS remux over progressive direct play when soft text subs are active. */
function preferRemuxForTextSubtitles(session) {
  if (!hasTextSubtitleStream(session)) return false;
  if (session.forceTranscode) return false;
  return true;
}

function upgradeStrategyForTextSubtitles(strategy, session) {
  if (strategy !== 'direct') return strategy;
  if (!preferRemuxForTextSubtitles(session)) return strategy;
  return 'direct-stream';
}

function buildSubtitleTranscodeParams(streamId, offsetMs, options) {
  options = options || {};
  if (streamId == null) return {};
  if (options.burnIn === true) {
    var burned = {
      'X-Plex-Subtitle-Stream': String(streamId),
      subtitleFormat: 'srt',
      subtitles: 'burn'
    };
    if (offsetMs) {
      burned['X-Plex-Subtitle-Offset'] = String(offsetMs);
    }
    return burned;
  }
  if (options.remux === true) {
    var remux = {
      subtitleStreamID: String(streamId),
      subtitles: 'auto',
      'X-Plex-Subtitle-Stream': String(streamId)
    };
    if (offsetMs) {
      remux['X-Plex-Subtitle-Offset'] = String(offsetMs);
    }
    return remux;
  }
  return {};
}

export {
  parseSubtitleStreams,
  classifySubtitleDelivery,
  isSidecarSubtitleTrack,
  buildSubtitleTranscodeParams,
  hasTextSubtitleStream,
  preferRemuxForTextSubtitles,
  upgradeStrategyForTextSubtitles,
  findSubtitleTrack,
  resolveStreamKeyPath,
  resolveStreamKeyPathWithExt,
  resolveSessionMetadataPath,
  resolveSessionPartPath,
  subtitleDirectFlagsForMode,
  isDirectPlaybackMode,
  plexLocationForServer,
  resolveTranscodeMediaPath,
  buildSubtitleFetchPlan,
  prepareClientSubtitlePlayback,
  selectPartSubtitleStream,
  resolveSubtitleSessionId,
  subtitleFetchUrls,
  buildClientSubtitleUrlCandidates,
  canUseClientSubtitles,
  isClientSubtitlePlaybackMode,
  shouldBurnInSubtitle,
  buildClientSubtitleUrl,
  shouldRetrySubtitleFetch,
  parseTranscodeSessionFromUrl,
  getActiveTranscodeSession,
  offsetSecondsForPlex,
  protocolForPlaybackMode,
  subtitleDisplayTitle,
  subtitleFormatLabel,
  subtitleMenuOptionLabel,
  pickDefaultSubtitleTrack
};
