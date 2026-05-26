import { getWatchStatus, getWatchProgressPercent } from '../../plex/library.js';
import { formatDuration } from '../format.js';
import {
  POSTER_WIDTH_GRID,
  POSTER_WIDTH_ROW,
  POSTER_WIDTH_EPISODE,
  POSTER_HEIGHT_EPISODE,
  sizedPosterUrl
} from '../posterImages.js';

/**
 * Plex-style card copy: primary title, subtitle, meta line.
 */
function formatEpisodeMeta(item) {
  var hasSeason = item.parentIndex != null && item.parentIndex !== '';
  var hasEpisode = item.index != null && item.index !== '';
  if (hasSeason && hasEpisode) return 'S' + item.parentIndex + ' · E' + item.index;
  if (hasSeason) return 'S' + item.parentIndex;
  if (hasEpisode) return 'E' + item.index;
  return '';
}

function formatCardLines(item, options) {
  options = options || {};
  var type = item.type || '';
  var title = item.title || '';
  var subtitle = '';
  var meta = '';

  if (type === 'episode' && options.layout === 'episode') {
    title = (item.index != null && item.index !== '' ? item.index + '. ' : '') + (item.title || '');
    if (item.duration) meta = formatDuration(item.duration);
    else meta = formatEpisodeMeta(item);
  } else if (type === 'episode') {
    title = item.grandparentTitle || item.parentTitle || title;
    subtitle = item.title || '';
    meta = formatEpisodeMeta(item);
  } else if (type === 'season') {
    subtitle = item.parentTitle || '';
    if (item.index != null && item.index !== '') {
      meta = 'Season ' + item.index;
    } else if (item.parentIndex != null && item.parentIndex !== '') {
      meta = 'Season ' + item.parentIndex;
    }
    if (item.leafCount) {
      meta = meta
        ? meta + ' · ' + item.leafCount + ' eps'
        : item.leafCount + ' episodes';
    }
  } else if (type === 'show') {
    if (item.year) meta = String(item.year);
    if (item.leafCount) {
      meta = meta ? meta + ' · ' + item.leafCount + ' eps' : item.leafCount + ' episodes';
    }
  } else {
    if (item.parentTitle && item.parentTitle !== title) subtitle = item.parentTitle;
    if (item.year) meta = String(item.year);
    if (item.contentRating) {
      meta = meta ? meta + ' · ' + item.contentRating : item.contentRating;
    }
  }

  return {
    title: title,
    subtitle: subtitle,
    meta: meta
  };
}

function resolveDetailRoute(item) {
  if (!item || !item.ratingKey) return { ratingKey: '' };
  var route = { ratingKey: item.ratingKey };
  if (item.type === 'show') {
    route.libraryType = 'show';
    return route;
  }
  if (item.type === 'season') {
    route.libraryType = 'show';
    if (item.parentRatingKey) {
      route.showKey = item.parentRatingKey;
      route.parentDetail = { ratingKey: item.parentRatingKey, libraryType: 'show' };
    }
    return route;
  }
  if (item.type === 'episode') {
    if (item.parentRatingKey) {
      route.seasonKey = item.parentRatingKey;
      route.parentDetail = {
        ratingKey: item.parentRatingKey,
        showKey: item.grandparentRatingKey || '',
        libraryType: 'show'
      };
      if (item.grandparentRatingKey) {
        route.parentDetail.parentDetail = { ratingKey: item.grandparentRatingKey, libraryType: 'show' };
      }
    }
    return route;
  }
  return route;
}

function createTextRow(className, textContent) {
  if (!textContent) return null;
  var row = document.createElement('div');
  row.className = className;
  row.textContent = textContent;
  return row;
}

function resolveCardThumb(item, options) {
  options = options || {};
  if (
    item &&
    item.type === 'episode' &&
    options.preferSeriesPoster &&
    item.grandparentThumbUrl
  ) {
    return item.grandparentThumbUrl;
  }
  return item && item.thumb ? item.thumb : '';
}

function createMediaCard(item, onSelect, options) {
  options = options || {};
  var lines = formatCardLines(item, options);
  var primaryTarget = resolveDetailRoute(item);
  var thumb = resolveCardThumb(item, options);
  var thumbWidth = POSTER_WIDTH_ROW;
  var thumbHeight;
  if (options.layout === 'grid') {
    thumbWidth = POSTER_WIDTH_GRID;
  } else if (options.layout === 'episode') {
    thumbWidth = POSTER_WIDTH_EPISODE;
    thumbHeight = POSTER_HEIGHT_EPISODE;
  }
  var sizedThumb = sizedPosterUrl(thumb, thumbWidth, thumbHeight);

  var card = document.createElement('div');
  card.className = 'media-card card row-item' + (options.layout === 'episode' ? ' media-card--episode' : '');
  card.setAttribute('data-rating-key', item.ratingKey || '');
  card.setAttribute('data-thumb', sizedThumb);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', [lines.title, lines.subtitle, lines.meta].filter(Boolean).join(', '));

  var status = getWatchStatus(item);
  var badgeText = status === 'watched' ? '✓' : '';
  var badgeClass = 'badge-watched';

  var posterWrap = document.createElement('div');
  posterWrap.className = 'card-poster-wrap';

  var img = document.createElement('img');
  img.className = 'poster';
  img.alt = lines.title;
  img.decoding = 'async';
  img.loading = 'lazy';
  if (options.layout === 'episode') {
    img.width = POSTER_WIDTH_EPISODE;
    img.height = POSTER_HEIGHT_EPISODE;
  } else if (options.layout === 'grid') {
    img.width = 176;
    img.height = 264;
  } else {
    img.width = 156;
    img.height = 234;
  }
  if (sizedThumb) {
    img.dataset.posterSrc = sizedThumb;
    if (!options.deferPoster) {
      img.loading = 'eager';
      img.src = sizedThumb;
    }
  }
  img.onerror = function () { img.style.display = 'none'; };

  posterWrap.appendChild(img);

  if (status === 'progress' && item.duration) {
    var pct = getWatchProgressPercent(item);
    var bar = document.createElement('div');
    bar.className = 'card-progress';
    bar.setAttribute('aria-hidden', 'true');
    var fill = document.createElement('div');
    fill.className = 'card-progress-fill';
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    posterWrap.appendChild(bar);
  }

  if (badgeText) {
    var badge = document.createElement('span');
    badge.className = 'badge ' + badgeClass;
    badge.setAttribute('aria-label', 'Seen');
    badge.textContent = badgeText;
    posterWrap.appendChild(badge);
  }

  var text = document.createElement('div');
  text.className = 'card-text';

  var titleEl = createTextRow('card-title', lines.title);
  if (titleEl) text.appendChild(titleEl);

  if (lines.subtitle) {
    var subEl = createTextRow('card-subtitle', lines.subtitle);
    text.appendChild(subEl);
  }

  if (lines.meta) {
    var metaEl = createTextRow('card-meta', lines.meta);
    text.appendChild(metaEl);
  }

  card.appendChild(posterWrap);
  card.appendChild(text);

  function activate() {
    if (onSelect) onSelect(item, primaryTarget);
  }
  card.addEventListener('click', activate);
  card.addEventListener('keydown', function (e) {
    if (e.target !== card) return;
    if (e.keyCode === 13) { e.preventDefault(); activate(); }
  });

  return card;
}

export { createMediaCard, formatCardLines, resolveDetailRoute };
