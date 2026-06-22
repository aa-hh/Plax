/**
 * Translate a Jellyfin BaseItemDto into the app's normalized (Plex-shaped) item —
 * the shape produced by src/plex/library.js `mapLibraryItem`, which every screen,
 * the player, and the caches already speak. Field mapping validated against a live
 * 10.11 server; see docs/jellyfin/integration-research.md Part B §8.
 */
import { primaryUrl, thumbStillUrl, backdropUrl } from './images.js';

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

/** Height → Plex-style videoResolution token ('4k'/'1080'/'720'/'480'/'sd'). */
function resolutionLabel(height) {
  var h = Number(height) || 0;
  if (h >= 2160) return '4k';
  if (h >= 1080) return '1080';
  if (h >= 720) return '720';
  if (h >= 480) return '480';
  if (h > 0) return 'sd';
  return '';
}

/** Frame rate number → Plex-style label ('24p'/'60p'). */
function frameRateLabel(fps) {
  var n = Number(fps);
  return Number.isFinite(n) && n > 0 ? Math.round(n) + 'p' : '';
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
      frameRate: s.RealFrameRate != null ? s.RealFrameRate
        : (s.AverageFrameRate != null ? s.AverageFrameRate : undefined),
      aspectRatio: s.AspectRatio || '',
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
      // Top-level wrapper fields the player/version logic reads off the Media node
      // (Plex sets these on the Media element; Jellyfin only on per-stream nodes).
      videoResolution: v ? resolutionLabel(v.height) : '',
      videoProfile: v ? (v.profile || '') : '',
      videoFrameRate: v ? frameRateLabel(v.frameRate) : '',
      aspectRatio: v ? (v.aspectRatio || '') : '',
      audioChannels: a && a.channels != null ? a.channels : undefined,
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
  var backdropId = raw.Id;
  var backdropTag = raw.BackdropImageTags && raw.BackdropImageTags[0];
  if (!backdropTag && raw.ParentBackdropItemId && raw.ParentBackdropImageTags) {
    backdropId = raw.ParentBackdropItemId;
    backdropTag = raw.ParentBackdropImageTags[0];
  }

  var thumb;
  if (raw.Type === 'Episode') {
    // Episodes: prefer the Thumb still (16:9 screenshot stored as ImageTags.Thumb);
    // fall back to Primary if present. Never inherit the series poster here — home
    // rails use grandparentThumbUrl (set below) and normalizeHomeRowItems swaps it in.
    var thumbStillTag = raw.ImageTags && raw.ImageTags.Thumb;
    if (thumbStillTag) {
      thumb = thumbStillUrl(server, raw.Id, thumbStillTag);
    } else if (primaryTag) {
      thumb = primaryUrl(server, primaryId, primaryTag);
    } else {
      thumb = '';
    }
  } else {
    // Non-episodes (Movie, Series, Season): fall back to series poster when own
    // Primary is absent (seasons commonly lack their own poster).
    if (!primaryTag && raw.SeriesId && raw.SeriesPrimaryImageTag) {
      primaryId = raw.SeriesId;
      primaryTag = raw.SeriesPrimaryImageTag;
    }
    thumb = primaryTag ? primaryUrl(server, primaryId, primaryTag) : '';
  }
  var art = backdropTag ? backdropUrl(server, backdropId, backdropTag) : '';

  // Series ("grandparent") poster, used by card fallbacks and the home-row
  // episode→series-poster swap so TV rails show the 2:3 series poster instead of
  // the 16:9 episode still. The tag is optional: minimal hub payloads
  // (HUB_FIELDS) often omit SeriesPrimaryImageTag, but /Items/{SeriesId}/Images/
  // Primary resolves fine without it — so build from SeriesId alone when present.
  // The season ("parent") primary tag isn't carried on the episode DTO, so
  // parentThumbUrl falls back to the series poster.
  var seriesThumb = raw.SeriesId
    ? primaryUrl(server, raw.SeriesId, raw.SeriesPrimaryImageTag || '')
    : '';

  // Ratings (Plex-aligned): CriticRating (Rotten Tomatoes, 0-100) → critic slot
  // with an official logo; CommunityRating → audience slot with no official logo
  // (the consumer renders a generic Material icon in the logo's place).
  var community = Number(raw.CommunityRating) || 0;
  var critic = raw.CriticRating != null ? Number(raw.CriticRating) : null;
  var criticImage = critic != null
    ? ('rottentomatoes://image.rating.' + (critic >= 60 ? 'ripe' : 'rotten')) : '';

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
    rating: critic != null ? Math.round(critic) / 10 : community,
    ratingImage: criticImage,
    audienceRating: community,
    audienceRatingImage: '',
    studio: (raw.Studios && raw.Studios[0] && raw.Studios[0].Name) || '',
    summary: raw.Overview || '',
    // thumb/art are full sized URLs (mediaCard's sizedPosterUrl just appends ignored
    // width=/height= for Jellyfin; getArtUrl passes full URLs through).
    thumb: thumb,
    art: art,
    thumbPath: thumb,
    artPath: art,
    parentThumbUrl: seriesThumb,
    grandparentThumbUrl: seriesThumb,
    grandparentThumb: seriesThumb,
    primaryImageAspectRatio: raw.PrimaryImageAspectRatio != null ? Number(raw.PrimaryImageAspectRatio) : null,
    viewOffset: ticksToMs(ud.PlaybackPositionTicks),
    duration: ticksToMs(raw.RunTimeTicks),
    viewCount: ud.PlayCount || 0,
    leafCount: leafCount,
    viewedLeafCount: viewedLeaf,
    childCount: raw.ChildCount != null ? raw.ChildCount : 0,
    // DateCreated (ISO) → epoch ms, matching the Plex addedAt normalization.
    addedAt: raw.DateCreated ? (Date.parse(raw.DateCreated) || 0) : 0,
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
