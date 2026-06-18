import { getWatchStatus, getWatchProgressPercent } from '../../plex/library.js';
import { formatDuration } from '../format.js';
import {
  POSTER_WIDTH_GRID,
  POSTER_WIDTH_ROW,
  POSTER_WIDTH_EPISODE,
  POSTER_HEIGHT_EPISODE,
  sizedPosterUrl,
  bindPosterImage
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
    if (options.cardText === 'titleOnly') {
      subtitle = '';
      meta = '';
    } else {
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

/**
 * Precompiled card skeleton. Building thousands of cards on a B8 is dominated
 * by createElement + property assignment; cloneNode(true) on a fragment whose
 * structure was parsed once is several times faster on Chromium 53. We keep
 * the optional pieces (progress bar, badge) out of the template and append
 * them only when needed — most cards have neither.
 */
var cardTemplate = null;
function getCardTemplate() {
  if (cardTemplate) return cardTemplate;
  var card = document.createElement('div');
  card.className = 'media-card card row-item';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  var posterWrap = document.createElement('div');
  posterWrap.className = 'card-poster-wrap';
  var img = document.createElement('img');
  img.className = 'poster';
  img.decoding = 'async';
  img.loading = 'lazy';
  posterWrap.appendChild(img);

  var text = document.createElement('div');
  text.className = 'card-text';
  var titleEl = document.createElement('div');
  titleEl.className = 'card-title';
  text.appendChild(titleEl);

  card.appendChild(posterWrap);
  card.appendChild(text);
  cardTemplate = card;
  return cardTemplate;
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

  var card = getCardTemplate().cloneNode(true);
  if (options.layout === 'episode') {
    card.className = 'media-card card row-item media-card--episode';
  }
  if (item.ratingKey) card.setAttribute('data-rating-key', item.ratingKey);
  if (sizedThumb) card.setAttribute('data-thumb', sizedThumb);
  card.setAttribute('aria-label', [lines.title, lines.subtitle, lines.meta].filter(Boolean).join(', '));

  var posterWrap = card.firstChild;
  var img = posterWrap.firstChild;
  img.alt = lines.title;
  // Intrinsic-size hints only — CSS sizes the rendered poster from the
  // --row-poster/--grid-poster tokens. Keep these aligned to the standard 2:3
  // scale (180×270) so the aspect is correct during load and there is no
  // pre-CSS layout jump (was 156×234 / 176×264 from the old poster sizes).
  if (options.layout === 'episode') {
    img.width = POSTER_WIDTH_EPISODE;
    img.height = POSTER_HEIGHT_EPISODE;
  } else if (options.layout === 'grid') {
    img.width = POSTER_WIDTH_GRID;
    img.height = 270;
  } else {
    img.width = POSTER_WIDTH_ROW;
    img.height = 270;
  }
  if (sizedThumb) {
    img.dataset.posterSrc = sizedThumb;
    if (!options.deferPoster) {
      bindPosterImage(img, sizedThumb, {
        priority: true,
        onError: function () { img.style.display = 'none'; }
      });
    }
  }

  var status = getWatchStatus(item);
  if (status === 'progress' && item.duration) {
    var pct = getWatchProgressPercent(item);
    var bar = document.createElement('div');
    bar.className = 'card-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    bar.setAttribute('aria-label', 'Watch progress');
    var fill = document.createElement('div');
    fill.className = 'card-progress-fill';
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    posterWrap.appendChild(bar);
  }
  if (status === 'watched') {
    var badge = document.createElement('span');
    badge.className = 'badge badge-watched';
    badge.setAttribute('aria-label', 'Seen');
    badge.textContent = '✓';
    posterWrap.appendChild(badge);
  }

  var text = card.lastChild;
  var titleEl = text.firstChild;
  titleEl.textContent = lines.title;
  if (lines.subtitle) {
    var subEl = document.createElement('div');
    subEl.className = 'card-subtitle';
    subEl.textContent = lines.subtitle;
    text.appendChild(subEl);
  }
  if (lines.meta) {
    var metaEl = document.createElement('div');
    metaEl.className = 'card-meta';
    metaEl.textContent = lines.meta;
    text.appendChild(metaEl);
  }

  function activate() {
    if (onSelect) onSelect(item, primaryTarget);
  }
  card.addEventListener('click', activate);
  card.addEventListener('keydown', function (e) {
    if (e.target !== card) return;
    if (e.keyCode === 13) { e.preventDefault(); activate(); }
  });

  // Expose item for features that read focused-card metadata (e.g. immersive list hero).
  card._plaxItem = item;

  return card;
}

export { createMediaCard, formatCardLines, resolveDetailRoute };
