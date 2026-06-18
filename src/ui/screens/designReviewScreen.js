import { createMediaCard } from '../components/mediaCard.js';
import { bindPosterImage } from '../posterImages.js';
import { renderHubRow } from '../components/hubRow.js';
import { createLoadingIndicator } from '../components/loadingIndicator.js';
import { focusFirst, attachFocusNav } from '../focus.js';

function placeholderPoster(label, bg, fg) {
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="352" height="528" viewBox="0 0 352 528">' +
    '<rect width="352" height="528" rx="18" fill="' + bg + '"/>' +
    '<text x="176" y="260" text-anchor="middle" font-size="36" fill="' + fg + '" font-family="Arial, sans-serif">' +
    label +
    '</text>' +
    '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function mockItem(overrides) {
  return Object.assign({
    ratingKey: 'mock-' + Math.random().toString(36).slice(2),
    title: 'Signal',
    type: 'movie',
    year: 2025,
    duration: 7200000,
    viewOffset: 0,
    viewCount: 0,
    thumb: placeholderPoster('Plax', '#2a3348', '#f3f6ff')
  }, overrides || {});
}

function buildMockItems(count, prefix) {
  var items = [];
  var i;
  for (i = 0; i < count; i++) {
    items.push(mockItem({
      ratingKey: (prefix || 'row') + '-' + i,
      title: (prefix || 'Row') + ' ' + (i + 1),
      year: 2020 + i,
      thumb: placeholderPoster(String(i + 1), '#26304a', '#f3f6ff')
    }));
  }
  return items;
}

function makeVariantCard(label, item, navigate, focused) {
  var wrap = document.createElement('div');
  wrap.className = 'design-review-variant';

  var card = createMediaCard(item, function (selected, routeParams) {
    navigate('detail', routeParams || { ratingKey: selected.ratingKey });
  });
  if (focused) card.classList.add('design-review-card-focused');

  var caption = document.createElement('p');
  caption.className = 'design-review-caption';
  caption.textContent = label;

  wrap.appendChild(card);
  wrap.appendChild(caption);
  return wrap;
}

function designReviewScreen(root, params, navigate) {
  var screen = document.createElement('div');
  screen.className = 'screen design-review-screen';
  screen.innerHTML =
    '<div class="top-nav">' +
    '<button class="nav-item" data-nav="home" tabindex="0">Home</button>' +
    '<button class="nav-item" data-nav="library" tabindex="0">Library</button>' +
    '<button class="nav-item" data-nav="search" tabindex="0">Search</button>' +
    '<button class="nav-item" data-nav="settings" tabindex="0">Settings</button>' +
    '<button class="nav-item active" data-nav="design-review" tabindex="0">Design Review</button>' +
    '</div>' +
    '<h1 class="screen-title screen-title-compact">Design Review</h1>' +
    '<div class="design-review-content">' +
    '<p class="screen-subtitle design-review-subtitle">Static visual reference surface for component states and composition language. Media cards use card-level focus only.</p>' +
    '<section class="design-review-section">' +
    '<h2 class="row-label design-review-heading">Component gallery</h2>' +
    '<h3 class="design-review-subheading">Media card states</h3>' +
    '<div class="design-review-variants row-scroll" id="review-card-variants" data-cols="4"></div>' +
    '<h3 class="design-review-subheading">Row density examples</h3>' +
    '<div id="review-row-density"></div>' +
    '<h3 class="design-review-subheading">Loading indicators</h3>' +
    '<div class="design-review-loaders" id="review-loaders"></div>' +
    '</section>' +
    '<section class="design-review-section">' +
    '<h2 class="row-label design-review-heading">Composed examples</h2>' +
    '<div id="review-composed-home"></div>' +
    '<div class="design-review-composed design-review-detail">' +
    '<p class="design-review-label">Detail visual language</p>' +
    '<div class="detail-layout design-review-detail-layout">' +
    '<img class="detail-poster" src="' + placeholderPoster('Detail', '#2b3346', '#f3f6ff') + '" alt="Detail sample poster" />' +
    '<div class="detail-info">' +
    '<h3 class="screen-title screen-title-compact">Feature Preview</h3>' +
    '<p class="detail-meta">2026 · 2h 4m · PG-13 · Drama</p>' +
    '<p class="detail-summary">Representative typography, spacing, and action hierarchy for detail metadata and synopsis content.</p>' +
    '<div class="detail-primary-actions">' +
    '<button class="btn btn-primary" tabindex="0">Play</button>' +
    '<button class="btn" tabindex="0">More actions</button>' +
    '</div>' +
    '<div class="direct-play-notice"><strong>Playback note</strong><span>Example informational surface shown on detail screens.</span></div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="design-review-composed design-review-player">' +
    '<p class="design-review-label">Player visual language</p>' +
    '<div class="design-review-player-shell">' +
    '<div class="player-bottom">' +
    '<div class="player-now-playing">' +
    '<h1 class="player-now-playing-title">Breaking Bad</h1>' +
    '<p class="player-now-playing-subtitle">S5 · E14 · Ozymandias</p>' +
    '<p class="player-next-up">Up next: S5 · E15 · Granite State</p>' +
    '</div>' +
    '<div class="player-seek-row" data-cols="3">' +
    '<span class="player-time player-time--elapsed">11:42</span>' +
    '<button class="player-seek-bar" tabindex="0" aria-label="Seek preview">' +
    '<span class="player-seek-track"><span class="player-seek-played" style="width:42%"></span>' +
    '<span class="player-seek-thumb" style="left:42%"></span></span>' +
    '</button>' +
    '<span class="player-time player-time--total">27:48</span>' +
    '</div>' +
    '<div class="player-stream-bar" data-cols="3">' +
    '<button type="button" class="player-stream-pill player-stream-pill--on" tabindex="0">' +
    '<span class="player-stream-active-mark"></span>' +
    '<span class="player-stream-label">Original | 1080p</span>' +
    '</button>' +
    '<button type="button" class="player-stream-pill" tabindex="0">' +
    '<span class="player-stream-label">English</span>' +
    '</button>' +
    '<button type="button" class="player-stream-pill player-stream-pill--on" tabindex="0">' +
    '<span class="player-stream-active-mark"></span>' +
    '<span class="player-stream-label">Dutch</span>' +
    '</button>' +
    '</div>' +
    '<div class="player-toolbar">' +
    '<div class="player-transport" data-cols="3">' +
    '<button class="btn btn-player-transport" tabindex="0">−10s</button>' +
    '<button class="btn btn-player-transport btn-player-play" tabindex="0">Pause</button>' +
    '<button class="btn btn-player-transport" tabindex="0">+30s</button>' +
    '</div>' +
    '<div class="player-toolbar-extra" data-cols="2">' +
    '<button class="btn btn-player-option" tabindex="0">Info</button>' +
    '<button class="btn btn-player-option" tabindex="0">Exit</button>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</section>' +
    '<div class="detail-actions design-review-actions">' +
    '<button class="btn" id="btn-review-back" tabindex="0">Back</button>' +
    '</div>' +
    '</div>';

  root.appendChild(screen);
  var reviewDetailPoster = screen.querySelector('.design-review-detail-layout .detail-poster');
  if (reviewDetailPoster && reviewDetailPoster.getAttribute('src')) {
    bindPosterImage(reviewDetailPoster, reviewDetailPoster.getAttribute('src'), { priority: true });
  }
  var detachFocus = attachFocusNav(screen);

  screen.querySelector('[data-nav="home"]').addEventListener('click', function () {
    navigate('home', {});
  });
  screen.querySelector('[data-nav="library"]').addEventListener('click', function () {
    navigate('library', {});
  });
  screen.querySelector('[data-nav="search"]').addEventListener('click', function () {
    navigate('search', { _from: 'design-review' });
  });
  screen.querySelector('[data-nav="settings"]').addEventListener('click', function () {
    navigate('settings', { _from: 'design-review' });
  });

  var variants = document.getElementById('review-card-variants');
  if (variants) {
    variants.appendChild(makeVariantCard('Default', mockItem({
      title: 'Default State',
      thumb: placeholderPoster('Default', '#334053', '#f3f6ff')
    }), navigate));
    variants.appendChild(makeVariantCard('Focused', mockItem({
      title: 'Focused State',
      thumb: placeholderPoster('Focused', '#36465d', '#f3f6ff')
    }), navigate, true));
    variants.appendChild(makeVariantCard('Seen', mockItem({
      title: 'Seen State',
      viewCount: 1,
      thumb: placeholderPoster('Seen', '#384b55', '#d8e2f2')
    }), navigate));
    variants.appendChild(makeVariantCard('Progress', mockItem({
      title: 'Progress State',
      viewOffset: 1860000,
      duration: 3600000,
      thumb: placeholderPoster('Progress', '#3e365f', '#f3f6ff')
    }), navigate));
  }

  var densityHost = document.getElementById('review-row-density');
  if (densityHost) {
    renderHubRow(densityHost, {
      title: 'Comfortable row density (4 items / 4 cols)',
      items: buildMockItems(4, 'comfortable')
    }, navigate, { cols: 4, visibleCount: 4 });
    renderHubRow(densityHost, {
      title: 'Compact row density (4 items / 8 cols)',
      items: buildMockItems(4, 'compact')
    }, navigate, { cols: 8, visibleCount: 4 });
  }

  var loaders = document.getElementById('review-loaders');
  if (loaders) {
    var plain = createLoadingIndicator({ size: 'medium' });
    var medium = createLoadingIndicator({ size: 'medium', label: 'Loading section' });
    var large = createLoadingIndicator({ size: 'large', label: 'Preparing playback' });
    loaders.appendChild(plain);
    loaders.appendChild(medium);
    loaders.appendChild(large);
  }

  var homeHost = document.getElementById('review-composed-home');
  if (homeHost) {
    var homeBlock = document.createElement('div');
    homeBlock.className = 'design-review-composed design-review-home';
    homeBlock.innerHTML =
      '<p class="design-review-label">Home visual language</p>' +
      '<div class="home-pivots" data-cols="4">' +
      '<button class="nav-item home-pivot active" tabindex="0">All</button>' +
      '<button class="nav-item home-pivot" tabindex="0">TV</button>' +
      '<button class="nav-item home-pivot" tabindex="0">Films</button>' +
      '<button class="nav-item home-pivot home-pivot-search" tabindex="0">Search</button>' +
      '</div>';
    homeHost.appendChild(homeBlock);
    renderHubRow(homeBlock, {
      title: 'Continue Watching',
      items: buildMockItems(6, 'home')
    }, navigate, { cols: 12, visibleCount: 6 });
  }

  screen.querySelector('#btn-review-back').addEventListener('click', function () {
    navigate(params._from || 'settings', {});
  });

  focusFirst(screen);
  return {
    destroy: function () {
      detachFocus();
    }
  };
}

export { designReviewScreen };
