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
import { webos4DeviceProfile } from './deviceProfile.js';
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
// it (single concurrent stream on a TV).
var active = { playSessionId: null, mediaSourceId: null, itemId: null };

function getPlaybackInfo(server, itemId, opts) {
  opts = opts || {};
  var maxBitrate = Number(opts.maxBitrate) > 0
    ? Number(opts.maxBitrate)
    : webos4DeviceProfile.MaxStreamingBitrate;
  // Cap the profile's ceiling to the selected quality so the server-side transcode
  // stays within what the B8 can stream + buffer.
  var profile = Object.assign({}, webos4DeviceProfile, { MaxStreamingBitrate: maxBitrate });
  var body = {
    UserId: server.userId,
    DeviceProfile: profile,
    MaxStreamingBitrate: maxBitrate
  };
  if (opts.startTimeTicks) body.StartTimeTicks = opts.startTimeTicks;
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

/** Turn a PlaybackInfo response into { url, mode }. */
function buildStreamFromInfo(server, itemId, info) {
  var ms = pickSource(info);
  if (!ms) throw new Error('No playable media source');
  var playSessionId = info && info.PlaySessionId;
  active = { playSessionId: playSessionId || null, mediaSourceId: ms.Id, itemId: itemId };

  if (ms.SupportsDirectPlay) {
    // Static file → native <video src> (token via query since headers can't be sent).
    var directUrl = jfUrl(server.url, '/Videos/' + itemId + '/stream', {
      static: true,
      mediaSourceId: ms.Id,
      api_key: server.accessToken,
      playSessionId: playSessionId,
      tag: ms.ETag
    });
    return { url: directUrl, mode: 'direct' };
  }

  // Remux or transcode — Jellyfin delivers both via the transcoding pipeline. On
  // webOS4 this must ride hls.js (no native HLS), so mode is always transcode-hls.
  if (ms.TranscodingUrl) {
    return { url: absolutize(server, ms.TranscodingUrl), mode: 'transcode-hls' };
  }

  // Last resort: a direct-stream remux URL if the server provided one.
  if (ms.SupportsDirectStream) {
    var dsUrl = jfUrl(server.url, '/Videos/' + itemId + '/stream', {
      static: false, mediaSourceId: ms.Id, api_key: server.accessToken, playSessionId: playSessionId
    });
    return { url: dsUrl, mode: 'direct' };
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
  return getPlaybackInfo(server, itemId, {
    startTimeTicks: startTicks,
    maxBitrate: maxBitrate
  }).then(function (info) {
    var res = buildStreamFromInfo(server, itemId, info);
    reportStart(server, itemId, startTicks, res.mode);
    return { url: res.url, mode: res.mode };
  });
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
  getPlaybackInfo,
  buildStreamFromInfo,
  updateProgress,
  reportTimeline,
  markWatched,
  markUnwatched
};
