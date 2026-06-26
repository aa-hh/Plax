/**
 * Jellyfin playback: PlaybackInfo-driven stream URL + progress/watch-state.
 *
 * Unlike Plex (where we parse a /decision response ourselves), Jellyfin's server
 * decides from our DeviceProfile and hands back per-MediaSource booleans + a ready
 * TranscodingUrl. We honor that verdict. Validated against a live 10.11 server:
 * an MKV/DTS movie → SupportsDirectPlay=false → HLS TranscodingUrl (mode transcode-hls).
 *
 * Returns the { url, mode } shape sessionController.resolveStreamUrl produces, with
 * mode ∈ { 'direct' (native <video>), 'transcode-hls' (hls.js) }.
 */
import { fetchJellyfinJson, jfUrl } from './client.js';
import { webos4DeviceProfile, buildJellyfinDeviceProfile } from './deviceProfile.js';
import { getProfile } from '../../playback/qualityProfiles.js';

function msToTicks(ms) {
  var n = Number(ms);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10000) : 0;
}

// Source file bitrate (bits/s) from the normalized item's first media version.
// media.bitrate is Kbps (Plex convention) → ×1000 for the Jellyfin bits/s field.
function sourceBitrateBits(session) {
  var item = session && session.item;
  var media = item && item.media && item.media[0];
  var kbps = media && Number(media.bitrate);
  return kbps > 0 ? kbps * 1000 : 0;
}

/**
 * MaxStreamingBitrate (bits/s) follows the selected quality, mirroring Plex:
 *  - a transcode tier (e.g. '720p-4') → that tier's bitrate;
 *  - 'original' → the source file's own bitrate (+10% headroom) so the server
 *    direct-plays / remuxes instead of re-encoding, and a *forced* transcode
 *    targets the source rather than a 120 Mbps runaway (the bufferFull cause).
 * qualityProfiles.maxVideoBitrate is in Kbps; ×1000 → bits/s.
 */
function bitrateForSession(session) {
  var profile = getProfile((session && session.quality) || 'original');
  if (profile && profile.maxVideoBitrate > 0) return profile.maxVideoBitrate * 1000;
  var src = sourceBitrateBits(session);
  if (src > 0) return Math.ceil(src * 1.1);
  return webos4DeviceProfile.MaxStreamingBitrate; // no source info → profile ceiling
}

// Active play session, captured at resolve time so progress reports can reference
// it (single concurrent stream on a TV). mediaStreams is the chosen source's
// MediaStreams[], retained so resolveStreamUrl can read a selected text subtitle's
// External DeliveryUrl.
var active = { playSessionId: null, mediaSourceId: null, itemId: null, mediaStreams: null };

function getPlaybackInfo(server, itemId, opts) {
  opts = opts || {};
  var maxBitrate = Number(opts.maxBitrate) > 0
    ? Number(opts.maxBitrate)
    : webos4DeviceProfile.MaxStreamingBitrate;
  // Per-device profile: webOS 4 → frozen mpegts baseline; newer webOS → fMP4 HLS
  // (HEVC/AV1 remux) + VP9/AV1 direct play. Cap the ceiling to the selected
  // quality so the server-side transcode stays within what the TV can stream.
  var profile = buildJellyfinDeviceProfile();
  profile.MaxStreamingBitrate = maxBitrate;
  var body = {
    UserId: server.userId,
    DeviceProfile: profile,
    MaxStreamingBitrate: maxBitrate
  };
  if (opts.startTimeTicks) body.StartTimeTicks = opts.startTimeTicks;
  // Track selection: the server bakes the chosen audio/subtitle indices into the
  // returned TranscodingUrl and DeliveryUrls. Only include each when set so an
  // unselected default still lets the server auto-pick.
  if (opts.mediaSourceId != null) body.MediaSourceId = String(opts.mediaSourceId);
  if (opts.audioStreamIndex != null) body.AudioStreamIndex = Number(opts.audioStreamIndex);
  if (opts.subtitleStreamIndex != null) body.SubtitleStreamIndex = Number(opts.subtitleStreamIndex);
  return fetchJellyfinJson('/Items/' + itemId + '/PlaybackInfo', {
    base: server.url,
    token: server.accessToken,
    method: 'POST',
    params: { userId: server.userId, maxStreamingBitrate: maxBitrate },
    body: body
  });
}

function absolutize(server, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return String(server.url).replace(/\/+$/, '') + url;
}

function pickSource(info, preferredId) {
  var sources = (info && info.MediaSources) || [];
  if (preferredId) {
    for (var i = 0; i < sources.length; i++) {
      if (sources[i].Id === preferredId) return sources[i];
    }
  }
  return sources[0] || null;
}

// Subrip when the codec is a text format Jellyfin serves as .subrip (srt/subrip/
// ass/ssa); otherwise vtt. Drives the Stream.{format} extension and the returned
// subtitle.format.
function subtitleStreamFormat(codec) {
  var c = String(codec || '').toLowerCase();
  if (c.indexOf('subrip') >= 0 || c.indexOf('srt') >= 0 ||
      c.indexOf('ass') >= 0 || c.indexOf('ssa') >= 0) return 'subrip';
  return 'vtt';
}

/**
 * For a selected subtitle index, find the chosen source's matching MediaStream and,
 * when it's an External text subtitle, return { url, format }. Graphical subs
 * (PGS/VOBSUB) have no client-renderable stream — the server burns them in — so
 * this returns null for them.
 */
function externalSubtitleFor(server, mediaStreams, subtitleStreamIndex) {
  if (subtitleStreamIndex == null || !mediaStreams) return null;
  var want = Number(subtitleStreamIndex);
  for (var i = 0; i < mediaStreams.length; i++) {
    var s = mediaStreams[i];
    if (s && s.Type === 'Subtitle' && Number(s.Index) === want) {
      if (s.DeliveryMethod === 'External' && s.DeliveryUrl) {
        return {
          url: absolutize(server, s.DeliveryUrl),
          format: subtitleStreamFormat(s.Codec)
        };
      }
      return null;
    }
  }
  return null;
}

/** Turn a PlaybackInfo response into { url, mode } (plus optional subtitle). */
function buildStreamFromInfo(server, itemId, info, subtitleStreamIndex) {
  var ms = pickSource(info);
  if (!ms) throw new Error('No playable media source');
  var playSessionId = info && info.PlaySessionId;
  active = {
    playSessionId: playSessionId || null,
    mediaSourceId: ms.Id,
    itemId: itemId,
    mediaStreams: ms.MediaStreams || null
  };

  // A selected text subtitle is delivered out-of-band (sidecar) — surface its URL.
  // Graphical subs are burned into the transcode and produce no subtitle field.
  var subtitle = externalSubtitleFor(server, ms.MediaStreams, subtitleStreamIndex);
  function withSubtitle(res) {
    if (subtitle) res.subtitle = subtitle;
    return res;
  }

  if (ms.SupportsDirectPlay) {
    // Static file → native <video src> (token via query since headers can't be sent).
    var directUrl = jfUrl(server.url, '/Videos/' + itemId + '/stream', {
      static: true,
      mediaSourceId: ms.Id,
      api_key: server.accessToken,
      playSessionId: playSessionId,
      tag: ms.ETag
    });
    return withSubtitle({ url: directUrl, mode: 'direct' });
  }

  // Remux or transcode — Jellyfin delivers both via the transcoding pipeline. On
  // webOS4 this must ride hls.js (no native HLS), so mode is always transcode-hls.
  if (ms.TranscodingUrl) {
    return withSubtitle({ url: absolutize(server, ms.TranscodingUrl), mode: 'transcode-hls' });
  }

  // Last resort: a direct-stream remux URL if the server provided one.
  if (ms.SupportsDirectStream) {
    var dsUrl = jfUrl(server.url, '/Videos/' + itemId + '/stream', {
      static: false, mediaSourceId: ms.Id, api_key: server.accessToken, playSessionId: playSessionId
    });
    return withSubtitle({ url: dsUrl, mode: 'direct' });
  }
  throw new Error('Jellyfin returned no playable stream for this item');
}

/**
 * sessionController seam: resolve a Jellyfin session to { url, mode }. Fires a
 * playback-start ping so the server registers the session for progress/Resume.
 */
function resolveStreamUrl(session) {
  var server = session && session.server;
  var item = session && session.item;
  if (!server || !item) return Promise.reject(new Error('No Jellyfin session'));
  var itemId = item.ratingKey;
  var startTicks = msToTicks(session.offset);
  var maxBitrate = bitrateForSession(session);
  // session.audioStreamId / subtitleStreamId carry the chosen MediaStream Index
  // (mapStreams sets id === index). The active MediaSource id comes from the picked
  // version node (mapMediaSources sets version.id === MediaSource.Id).
  var subtitleStreamIndex = session.subtitleStreamId != null ? session.subtitleStreamId : null;
  var mediaSourceId = (session.version && session.version.id) || null;
  return getPlaybackInfo(server, itemId, {
    startTimeTicks: startTicks,
    maxBitrate: maxBitrate,
    mediaSourceId: mediaSourceId,
    audioStreamIndex: session.audioStreamId != null ? session.audioStreamId : null,
    subtitleStreamIndex: subtitleStreamIndex
  }).then(function (info) {
    var res = buildStreamFromInfo(server, itemId, info, subtitleStreamIndex);
    reportStart(server, itemId, startTicks, res.mode);
    var out = { url: res.url, mode: res.mode };
    if (res.subtitle) out.subtitle = res.subtitle;
    return out;
  });
}

/**
 * Build the external-subtitle fetch plan for a selected TEXT track. Jellyfin serves
 * a sidecar/extracted text subtitle at
 *   /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/0/Stream.{format}
 * with format `subrip` for srt/subrip/ass/ssa, else `vtt`. Graphical tracks
 * (PGS/VOBSUB) can't be client-rendered — they burn in via resolveStreamUrl — so we
 * return no attempts for them. No `prepare` step is needed for Jellyfin.
 *
 * @returns {{ prepare?: Function, attempts: Array<{label:string, url:string}> }}
 */
function buildSubtitlePlan(server, session, track) {
  // attempts is a thunk for contract parity with Plex (whose attempts must be
  // built AFTER prepare()). Jellyfin needs no prepare, but keeps the same shape.
  var empty = { attempts: function () { return []; } };
  if (!server || !session || !track || track.graphical) return empty;
  var item = session.item || {};
  var itemId = item.ratingKey;
  var mediaSourceId = active.mediaSourceId ||
    (session.version && session.version.id) || itemId;
  if (itemId == null || track.index == null) return empty;
  var format = subtitleStreamFormat(track.codec || track.format);
  var url = jfUrl(
    server.url,
    '/Videos/' + itemId + '/' + mediaSourceId + '/Subtitles/' + track.index + '/0/Stream.' + format,
    { api_key: server.accessToken }
  );
  return { attempts: function () { return [{ label: 'jellyfin-external', url: url }]; } };
}

// ---- progress / watch-state ----

function postSession(server, path, payload) {
  return fetchJellyfinJson(path, {
    base: server.url, token: server.accessToken, method: 'POST', body: payload
  }).catch(function (err) {
    console.warn('Jellyfin session report:', err && err.message);
  });
}

function reportStart(server, itemId, positionTicks, mode) {
  return postSession(server, '/Sessions/Playing', {
    ItemId: itemId,
    MediaSourceId: active.mediaSourceId || itemId,
    PlaySessionId: active.playSessionId,
    PositionTicks: positionTicks || 0,
    PlayMethod: mode === 'direct' ? 'DirectPlay' : 'Transcode',
    CanSeek: true,
    IsPaused: false
  });
}

/**
 * Matches the backend updateProgress(server, ratingKey, offsetMs, state, durationMs, extra)
 * contract that playerAdapter calls. state ∈ 'playing' | 'paused' | 'stopped'.
 */
function updateProgress(server, ratingKey, offsetMs, state, durationMs, extra) {
  var positionTicks = msToTicks(offsetMs);
  if (state === 'stopped') {
    return postSession(server, '/Sessions/Playing/Stopped', {
      ItemId: ratingKey,
      MediaSourceId: active.mediaSourceId || ratingKey,
      PlaySessionId: active.playSessionId,
      PositionTicks: positionTicks
    });
  }
  return postSession(server, '/Sessions/Playing/Progress', {
    ItemId: ratingKey,
    MediaSourceId: active.mediaSourceId || ratingKey,
    PlaySessionId: active.playSessionId,
    PositionTicks: positionTicks,
    IsPaused: state === 'paused',
    EventName: 'timeupdate'
  });
}

/** reportTimeline(server, ratingKey, { state, time, duration }) — facade parity. */
function reportTimeline(server, ratingKey, opts) {
  opts = opts || {};
  return updateProgress(server, ratingKey, opts.time, opts.state, opts.duration, opts);
}

function markWatched(server, ratingKey) {
  return fetchJellyfinJson('/Users/' + server.userId + '/PlayedItems/' + ratingKey, {
    base: server.url, token: server.accessToken, method: 'POST'
  });
}

function markUnwatched(server, ratingKey) {
  return fetchJellyfinJson('/Users/' + server.userId + '/PlayedItems/' + ratingKey, {
    base: server.url, token: server.accessToken, method: 'DELETE'
  });
}

export {
  resolveStreamUrl,
  buildSubtitlePlan,
  getPlaybackInfo,
  buildStreamFromInfo,
  updateProgress,
  reportTimeline,
  markWatched,
  markUnwatched
};
