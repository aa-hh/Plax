/**
 * Translate a Jellyfin BaseItemDto into the app's normalized (Plex-shaped) item —
 * the shape produced by src/plex/library.js `mapLibraryItem`, which every screen,
 * the player, and the caches already speak. Field mapping validated against a live
 * 10.11 server; see docs/jellyfin/integration-research.md Part B §8.
 */
import { primaryUrl, backdropUrl } from './images.js';

var TYPE_MAP = {
  Movie: 'movie',
  Series: 'show',
  Season: 'season',
  Episode: 'episode',
  BoxSet: 'collection'
};

function ticksToMs(t) {
  var n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n / 10000) : 0;
}

function firstStreamByType(streams, type) {
  for (var i = 0; i < streams.length; i++) {
    if (streams[i].streamType === type) return streams[i];
  }
  return null;
}

/** ProviderIds → a Plex-ish guid (imdb/tmdb/tvdb), else fall back to the item id. */
function pickGuid(ids, fallback) {
  if (!ids) return fallback;
  if (ids.Imdb) return 'imdb://' + ids.Imdb;
  if (ids.Tmdb) return 'tmdb://' + ids.Tmdb;
  if (ids.Tvdb) return 'tvdb://' + ids.Tvdb;
  return fallback;
}

function mapStreams(mediaStreams) {
  return (mediaStreams || []).map(function (s) {
    var st = s.Type === 'Video' ? 1 : s.Type === 'Audio' ? 2 : s.Type === 'Subtitle' ? 3 : 0;
    return {
      streamType: st,
      codec: s.Codec || '',
      language: s.Language || '',
      languageTag: s.Language || '',
      channels: s.Channels != null ? s.Channels : undefined,
      // Jellyfin BitRate is bits/s; the app's normalized shape (Plex convention)
      // expects Kbps.
      bitrate: s.BitRate != null ? Math.round(s.BitRate / 1000) : undefined,
      width: s.Width != null ? s.Width : undefined,
      height: s.Height != null ? s.Height : undefined,
      profile: s.Profile || '',
      level: s.Level != null ? s.Level : undefined,
      title: s.DisplayTitle || '',
      default: !!s.IsDefault,
      forced: !!s.IsForced,
      external: !!s.IsExternal,
      index: s.Index,
      _tag: 'Stream'
    };
  });
}

/** MediaSources[] → Plex-shaped media[] (Media→Part→Stream). Raw kept for Phase 4. */
function mapMediaSources(sources) {
  return (sources || []).map(function (ms) {
    var streams = mapStreams(ms.MediaStreams);
    var v = firstStreamByType(streams, 1);
    var a = firstStreamByType(streams, 2);
    return {
      id: ms.Id,
      container: ms.Container || '',
      duration: ticksToMs(ms.RunTimeTicks),
      // bits/s → Kbps (Plex-shaped convention the UI + quality logic expect)
      bitrate: ms.Bitrate != null ? Math.round(ms.Bitrate / 1000) : undefined,
      size: ms.Size != null ? ms.Size : undefined,
      protocol: ms.Protocol || '',
      videoCodec: v ? v.codec : undefined,
      audioCodec: a ? a.codec : undefined,
      width: v ? v.width : undefined,
      height: v ? v.height : undefined,
      _tag: 'Media',
      _children: [{
        id: ms.Id,
        file: ms.Path || '',
        key: ms.Id,
        duration: ticksToMs(ms.RunTimeTicks),
        size: ms.Size,
        _tag: 'Part',
        _children: streams
      }],
      // Raw Jellyfin source retained for the Phase 4 PlaybackInfo / stream builder.
      _jellyfin: ms
    };
  });
}

function mapPeople(people, server, type) {
  return (people || []).filter(function (p) { return p.Type === type; }).map(function (p) {
    var out = { id: p.Id, tag: p.Name };
    if (type === 'Actor') {
      out.role = p.Role || '';
      out.thumb = p.PrimaryImageTag ? primaryUrl(server, p.Id, p.PrimaryImageTag, 200) : '';
    }
    return out;
  });
}

/**
 * @param {Object} raw  Jellyfin BaseItemDto
 * @param {Object} server  active server { url, ... }
 * @returns {Object} normalized item
 */
function mapItem(raw, server) {
  if (!raw) return null;
  var ud = raw.UserData || {};

  // Image source resolution with parent fallback (episodes/seasons borrow series art).
  var primaryId = raw.Id;
  var primaryTag = raw.ImageTags && raw.ImageTags.Primary;
  if (!primaryTag && raw.SeriesId && raw.SeriesPrimaryImageTag) {
    primaryId = raw.SeriesId;
    primaryTag = raw.SeriesPrimaryImageTag;
  }
  var backdropId = raw.Id;
  var backdropTag = raw.BackdropImageTags && raw.BackdropImageTags[0];
  if (!backdropTag && raw.ParentBackdropItemId && raw.ParentBackdropImageTags) {
    backdropId = raw.ParentBackdropItemId;
    backdropTag = raw.ParentBackdropImageTags[0];
  }

  var thumb = primaryTag ? primaryUrl(server, primaryId, primaryTag) : '';
  var art = backdropTag ? backdropUrl(server, backdropId, backdropTag) : '';

  var leafCount = raw.RecursiveItemCount != null ? raw.RecursiveItemCount
    : (raw.ChildCount != null ? raw.ChildCount : 0);
  var viewedLeaf = 0;
  if (ud.UnplayedItemCount != null && raw.RecursiveItemCount != null) {
    viewedLeaf = Math.max(0, raw.RecursiveItemCount - ud.UnplayedItemCount);
  } else if (ud.Played) {
    viewedLeaf = leafCount;
  }

  return {
    ratingKey: raw.Id,
    key: '/items/' + raw.Id,
    guid: pickGuid(raw.ProviderIds, raw.Id),
    title: raw.Name || '',
    type: TYPE_MAP[raw.Type] || (raw.Type ? String(raw.Type).toLowerCase() : ''),
    year: raw.ProductionYear || null,
    originallyAvailableAt: raw.PremiereDate ? String(raw.PremiereDate).slice(0, 10) : '',
    contentRating: raw.OfficialRating || '',
    rating: Number(raw.CommunityRating) || 0,
    ratingImage: '',
    audienceRating: Number(raw.CommunityRating) || 0,
    audienceRatingImage: '',
    studio: (raw.Studios && raw.Studios[0] && raw.Studios[0].Name) || '',
    summary: raw.Overview || '',
    // thumb/art are full sized URLs (mediaCard's sizedPosterUrl just appends ignored
    // width=/height= for Jellyfin; getArtUrl passes full URLs through).
    thumb: thumb,
    art: art,
    thumbPath: thumb,
    artPath: art,
    viewOffset: ticksToMs(ud.PlaybackPositionTicks),
    duration: ticksToMs(raw.RunTimeTicks),
    viewCount: ud.PlayCount || 0,
    leafCount: leafCount,
    viewedLeafCount: viewedLeaf,
    librarySectionID: raw.ParentId != null ? String(raw.ParentId) : '',
    parentRatingKey: raw.SeasonId || raw.ParentId || '',
    grandparentRatingKey: raw.SeriesId || '',
    grandparentTitle: raw.SeriesName || '',
    parentTitle: raw.SeasonName || '',
    parentIndex: raw.ParentIndexNumber != null ? raw.ParentIndexNumber : null,
    index: raw.IndexNumber != null ? raw.IndexNumber : null,
    genres: (raw.Genres || []).map(function (g) { return { tag: g }; }),
    roles: mapPeople(raw.People, server, 'Actor'),
    directors: mapPeople(raw.People, server, 'Director'),
    writers: mapPeople(raw.People, server, 'Writer'),
    collections: [],
    media: mapMediaSources(raw.MediaSources),
    markers: [],
    introMarkers: [],
    introMarker: null,
    creditMarkers: [],
    _jellyfin: { played: !!ud.Played, type: raw.Type }
  };
}

export { mapItem, ticksToMs, TYPE_MAP };
