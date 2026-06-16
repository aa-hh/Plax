import { addOnceEventListener } from '../utils/domUtils.js';

/** Poster sizing aligned with CSS (--row-poster-*, --grid-poster-*) plus modest overscan. */
var POSTER_WIDTH_ROW = 180;
var POSTER_WIDTH_GRID = 180;
var POSTER_WIDTH_EPISODE = 300;
var POSTER_HEIGHT_EPISODE = 168;

/** Cap parallel Plex /photo transcodes — webOS 4 saturates above ~6. */
var MAX_CONCURRENT_POSTER_LOADS = 6;

var MAX_POSTER_URL_ENTRIES = 384;
var activePosterLoads = 0;
var posterLoadQueue = [];
var loadedUrls = Object.create(null);
var inflightUrls = Object.create(null);
var urlMapOrder = [];

function touchUrlKey(url) {
  var idx = urlMapOrder.indexOf(url);
  if (idx >= 0) urlMapOrder.splice(idx, 1);
  urlMapOrder.push(url);
}

function evictPosterUrlMapsIfNeeded() {
  while (urlMapOrder.length > MAX_POSTER_URL_ENTRIES) {
    var url = urlMapOrder.shift();
    delete loadedUrls[url];
    delete inflightUrls[url];
  }
}

function clearPosterUrlMaps() {
  loadedUrls = Object.create(null);
  inflightUrls = Object.create(null);
  urlMapOrder = [];
  posterLoadQueue = [];
  activePosterLoads = 0;
}

function sizedPosterUrl(url, width, height) {
  if (!url || !width) return url || '';
  if (!height) height = Math.round(width * 1.5);
  var next = url.replace(/([?&])width=\d+/gi, '$1width=' + width);
  if (next.indexOf('width=') < 0) {
    next += (url.indexOf('?') >= 0 ? '&' : '?') + 'width=' + width;
  }
  next = next.replace(/([?&])height=\d+/gi, '$1height=' + height);
  if (next.indexOf('height=') < 0) {
    next += (next.indexOf('?') >= 0 ? '&' : '?') + 'height=' + height;
  }
  return next;
}

function posterAlreadyBound(img, url) {
  if (!img || !url) return false;
  return img.getAttribute('src') === url;
}

function clearPosterReveal(img) {
  if (!img) return;
  img.classList.remove('poster--loaded');
}

function revealPosterImage(img) {
  if (!img || !(img.naturalWidth > 0)) return;
  img.classList.add('poster--loaded');
}

/** Fade-in when decode finishes; safe alongside other load handlers (uses addEventListener). */
function watchPosterReveal(img) {
  if (!img) return;
  clearPosterReveal(img);
  if (img.complete && img.naturalWidth > 0) {
    revealPosterImage(img);
    return;
  }
  addOnceEventListener(img, 'load', function () { revealPosterImage(img); });
}

function markPosterLoaded(url) {
  if (url) {
    loadedUrls[url] = true;
    delete inflightUrls[url];
    touchUrlKey(url);
    evictPosterUrlMapsIfNeeded();
  }
}

function releasePosterLoadSlot() {
  activePosterLoads = Math.max(0, activePosterLoads - 1);
  drainPosterLoadQueue();
}

function drainPosterLoadQueue() {
  while (posterLoadQueue.length && activePosterLoads < MAX_CONCURRENT_POSTER_LOADS) {
    var job = posterLoadQueue.shift();
    if (!job || !job.img) continue;
    startPosterImageLoad(job.img, job.url, job.opts);
  }
}

function startPosterImageLoad(img, url, opts) {
  opts = opts || {};
  activePosterLoads += 1;
  watchPosterReveal(img);

  img.decoding = 'async';
  img.loading = opts.priority ? 'eager' : 'lazy';
  img.dataset.posterSrc = url;

  function finishLoad() {
    img.onload = null;
    img.onerror = null;
    markPosterLoaded(url);
    releasePosterLoadSlot();
    if (img.naturalWidth > 0) revealPosterImage(img);
    else if (opts.onError) opts.onError();
  }

  if (img.getAttribute('src') !== url) {
    img.src = url;
  }
  if (img.complete && img.naturalWidth > 0) {
    markPosterLoaded(url);
    revealPosterImage(img);
    releasePosterLoadSlot();
    return;
  }
  img.onload = img.onerror = finishLoad;
}

function bindPosterImage(img, url, opts) {
  opts = opts || {};
  if (!img) return;
  if (!url) {
    img.removeAttribute('src');
    delete img.dataset.posterSrc;
    clearPosterReveal(img);
    return;
  }
  if (posterAlreadyBound(img, url) && img.complete && img.naturalWidth > 0) {
    markPosterLoaded(url);
    revealPosterImage(img);
    return;
  }
  if (activePosterLoads >= MAX_CONCURRENT_POSTER_LOADS) {
    posterLoadQueue.push({ img: img, url: url, opts: opts });
    return;
  }
  startPosterImageLoad(img, url, opts);
}

function hydrateCardPoster(card, opts) {
  if (!card) return;
  var img = card.querySelector('img.poster');
  if (!img) return;
  var url = card.getAttribute('data-thumb') || img.dataset.posterSrc || '';
  bindPosterImage(img, url, opts);
}

function hydrateRowWindow(rowEl, opts) {
  if (!rowEl) return;
  opts = opts || {};
  var cards = rowEl.querySelectorAll('.media-card');
  var start = opts.start || 0;
  var count = opts.count != null ? opts.count : 12;
  var end = Math.min(cards.length, start + count);
  var i;
  for (i = start; i < end; i++) {
    hydrateCardPoster(cards[i], { priority: true });
  }
}

function hydrateGridWindow(gridEl, opts) {
  if (!gridEl) return;
  opts = opts || {};
  var cards = gridEl.querySelectorAll('.media-card');
  var limit = opts.count != null ? opts.count : 24;
  var i;
  for (i = 0; i < cards.length && i < limit; i++) {
    hydrateCardPoster(cards[i], { priority: i < (opts.priorityCount || 12) });
  }
}

function collectNeighborhoodThumbs(card, before, after) {
  if (!card) return [];
  var row = card.closest('.row-scroll, .media-grid');
  var cards = row
    ? Array.prototype.slice.call(row.querySelectorAll('.media-card[data-thumb]'))
    : [card];
  var idx = cards.indexOf(card);
  if (idx < 0) return card.getAttribute('data-thumb') ? [card.getAttribute('data-thumb')] : [];
  var start = Math.max(0, idx - (before != null ? before : 2));
  var end = Math.min(cards.length - 1, idx + (after != null ? after : 4));
  var urls = [];
  var seen = Object.create(null);
  var i;
  for (i = start; i <= end; i++) {
    var url = cards[i].getAttribute('data-thumb');
    if (!url || seen[url]) continue;
    seen[url] = true;
    urls.push(url);
  }
  return urls;
}

function hydrateFocusedNeighborhood(card, opts) {
  if (!card) return;
  opts = opts || {};
  var row = card.closest('.row-scroll, .media-grid');
  if (!row) {
    hydrateCardPoster(card, { priority: true });
    return;
  }
  var cards = row.querySelectorAll('.media-card');
  var idx = Array.prototype.indexOf.call(cards, card);
  if (idx < 0) {
    hydrateCardPoster(card, { priority: true });
    return;
  }
  var isGrid = row.classList && row.classList.contains('media-grid');
  var before = opts.before != null ? opts.before : 2;
  var after = opts.after != null ? opts.after : (isGrid ? 20 : 4);
  var start = Math.max(0, idx - before);
  var end = Math.min(cards.length - 1, idx + after);
  if (!neighborhoodNeedsHydrate(cards, start, end)) return;
  var i;
  for (i = start; i <= end; i++) {
    hydrateCardPoster(cards[i], { priority: true });
  }
}

function prefetchPosterUrls(urls) {
  if (!urls || !urls.length) return;
  var i;
  for (i = 0; i < urls.length; i++) {
    var url = urls[i];
    if (!url || loadedUrls[url] || inflightUrls[url]) continue;
    inflightUrls[url] = true;
    touchUrlKey(url);
    evictPosterUrlMapsIfNeeded();
    bindPosterImage(new Image(), url, { priority: true });
  }
}

function resolveItemPosterUrl(item) {
  if (!item) return '';
  var thumb = item.thumb || item.grandparentThumbUrl || '';
  if (!thumb) return '';
  if (item.type === 'episode') {
    return sizedPosterUrl(thumb, POSTER_WIDTH_EPISODE, POSTER_HEIGHT_EPISODE);
  }
  return sizedPosterUrl(thumb, POSTER_WIDTH_ROW);
}

/**
 * Poster URLs for the first visible home hub window (matches hubRow deferPoster + primeVisiblePosters).
 */
function collectHubPrefetchPosterUrls(hubPrefetchResult, opts) {
  opts = opts || {};
  var maxUrls = opts.maxUrls != null ? opts.maxUrls : 24;
  var perRow = opts.perRow != null ? opts.perRow : 12;
  var maxRows = opts.maxRows != null ? opts.maxRows : 2;
  var rows = (hubPrefetchResult && hubPrefetchResult.rows) || [];
  var urls = [];
  var seen = Object.create(null);
  var r;
  var i;
  for (r = 0; r < rows.length && urls.length < maxUrls; r++) {
    if (r >= maxRows) break;
    var items = rows[r].items || [];
    var take = Math.min(perRow, maxUrls - urls.length, items.length);
    for (i = 0; i < take; i++) {
      var url = resolveItemPosterUrl(items[i]);
      if (!url || seen[url]) continue;
      seen[url] = true;
      urls.push(url);
    }
  }
  return urls;
}

function countLoadedPosterUrls(urls) {
  var n = 0;
  var i;
  for (i = 0; i < urls.length; i++) {
    if (loadedUrls[urls[i]]) n += 1;
  }
  return n;
}

/**
 * Resolve when targeted poster URLs have loaded/errored.
 * requireAll (default true): wait for every URL; failOnTimeout rejects instead of navigating partial.
 */
function waitForPosterUrls(urls, opts) {
  opts = opts || {};
  var total = urls ? urls.length : 0;
  var requireAll = opts.requireAll !== false;
  var minReady = opts.minReady;
  if (minReady == null) minReady = requireAll ? total : 8;
  var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 60000;
  var failOnTimeout = opts.failOnTimeout === true;
  var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
  if (!urls || !total) return Promise.resolve({ loaded: 0, total: 0, complete: true });

  return new Promise(function (resolve, reject) {
    var settled = false;
    var pollTimer = null;
    var timeoutTimer = null;

    function reportProgress() {
      if (onProgress) onProgress(countLoadedPosterUrls(urls), total);
    }

    function finishSuccess() {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      var loaded = countLoadedPosterUrls(urls);
      resolve({ loaded: loaded, total: total, complete: loaded >= minReady });
    }

    function finishTimeout() {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      var loaded = countLoadedPosterUrls(urls);
      if (failOnTimeout && loaded < minReady) {
        reject(new Error(
          'Artwork load timed out (' + loaded + '/' + total + '). Check network and Plex server, then try again.'
        ));
        return;
      }
      resolve({ loaded: loaded, total: total, complete: loaded >= minReady, timedOut: true });
    }

    function checkReady() {
      var ready = countLoadedPosterUrls(urls);
      reportProgress();
      if (ready >= minReady || ready >= total) finishSuccess();
    }

    checkReady();
    if (settled) return;

    pollTimer = setInterval(checkReady, 120);
    timeoutTimer = setTimeout(finishTimeout, timeoutMs);
  });
}

/**
 * Warm Plex poster transcodes for prefetched hub rows (HTTP cache + loadedUrls).
 * Waits until all collected URLs settle unless opts.requireAll is false.
 */
function warmHubPrefetchPosters(hubPrefetchResult, opts) {
  opts = opts || {};
  var urls = collectHubPrefetchPosterUrls(hubPrefetchResult, opts);
  if (!urls.length) return Promise.resolve({ urls: [], warmed: 0, total: 0, complete: true });
  prefetchPosterUrls(urls);
  var waitOpts = Object.assign({}, opts);
  if (waitOpts.requireAll !== false && waitOpts.minReady == null) {
    waitOpts.minReady = urls.length;
  }
  return waitForPosterUrls(urls, waitOpts).then(function (result) {
    var warmed = countLoadedPosterUrls(urls);
    return {
      urls: urls,
      warmed: warmed,
      total: urls.length,
      complete: result.complete === true && warmed >= urls.length
    };
  });
}

function cardPosterNeedsHydrate(card) {
  if (!card) return false;
  var url = card.getAttribute('data-thumb') || '';
  if (!url) return false;
  var img = card.querySelector('img.poster');
  return !img || img.getAttribute('src') !== url || !(img.complete && img.naturalWidth > 0);
}

function neighborhoodNeedsHydrate(cards, start, end) {
  var i;
  for (i = start; i <= end; i++) {
    if (cardPosterNeedsHydrate(cards[i])) return true;
  }
  return false;
}

/** Hydrate posters for cards visible in a horizontal row (scroll without focus change). */
function hydrateRowViewport(rowEl, opts) {
  if (!rowEl || !rowEl.getBoundingClientRect) return;
  opts = opts || {};
  var pad = opts.padding != null ? opts.padding : 240;
  var cards = rowEl.querySelectorAll('.media-card');
  if (!cards.length) return;
  var rowRect = rowEl.getBoundingClientRect();
  var leftBound = rowRect.left - pad;
  var rightBound = rowRect.right + pad;
  var i;
  var start = 0;
  var end = cards.length - 1;

  while (start < cards.length && cards[start].getBoundingClientRect().right < leftBound) {
    start += 1;
  }
  while (end >= start && cards[end].getBoundingClientRect().left > rightBound) {
    end -= 1;
  }
  if (start > end) return;

  for (i = start; i <= end; i++) {
    var card = cards[i];
    if (!cardPosterNeedsHydrate(card)) continue;
    var rect = card.getBoundingClientRect();
    if (rect.right < leftBound || rect.left > rightBound) continue;
    hydrateCardPoster(card, { priority: false });
  }
}

/** Hydrate posters for cards near the grid viewport (scroll without focus change). */
function hydrateGridViewport(gridEl, opts) {
  if (!gridEl || !gridEl.getBoundingClientRect) return;
  opts = opts || {};
  var pad = opts.padding != null ? opts.padding : 320;
  var cards = gridEl.querySelectorAll('.media-card');
  if (!cards.length) return;
  var gridRect = gridEl.getBoundingClientRect();
  var topBound = gridRect.top - pad;
  var bottomBound = gridRect.bottom + pad;
  var i;
  var start = 0;
  var end = cards.length - 1;

  // Narrow scan to rows intersecting the padded viewport (avoid O(n) on huge grids).
  while (start < cards.length && cards[start].getBoundingClientRect().bottom < topBound) {
    start += 1;
  }
  while (end >= start && cards[end].getBoundingClientRect().top > bottomBound) {
    end -= 1;
  }
  if (start > end) return;

  for (i = start; i <= end; i++) {
    var card = cards[i];
    if (!cardPosterNeedsHydrate(card)) continue;
    var rect = card.getBoundingClientRect();
    if (rect.bottom < topBound || rect.top > bottomBound) continue;
    hydrateCardPoster(card, { priority: false });
  }
}

function primeVisiblePosters(rootEl) {
  if (!rootEl) return;
  var rows = rootEl.querySelectorAll('.row-scroll');
  var r;
  for (r = 0; r < rows.length; r++) {
    hydrateRowWindow(rows[r], { start: 0, count: 12 });
  }
  var grid = rootEl.querySelector('.media-grid');
  if (grid) hydrateGridWindow(grid, { count: 24, priorityCount: 12 });
}

/** Cards in the first visible window (grid or top home rows). */
function collectPosterBatchCards(rootEl, opts) {
  if (!rootEl) return [];
  opts = opts || {};
  var maxCards = opts.count != null ? opts.count : 30;
  if (rootEl.classList && rootEl.classList.contains('media-grid')) {
    return Array.prototype.slice.call(rootEl.querySelectorAll('.media-card'), 0, maxCards);
  }
  var cards = [];
  var rows = rootEl.querySelectorAll('.row-scroll');
  var perRow = opts.perRow != null ? opts.perRow : 12;
  var maxRows = opts.maxRows != null ? opts.maxRows : 3;
  var r;
  for (r = 0; r < rows.length && cards.length < maxCards; r++) {
    if (r >= maxRows) break;
    var rowCards = rows[r].querySelectorAll('.media-card');
    var take = Math.min(perRow, maxCards - cards.length, rowCards.length);
    var i;
    for (i = 0; i < take; i++) cards.push(rowCards[i]);
  }
  return cards;
}

function hydratePosterBatch(rootEl, opts) {
  if (!rootEl) return;
  opts = opts || {};
  if (rootEl.classList && rootEl.classList.contains('media-grid')) {
    var gridCards = rootEl.querySelectorAll('.media-card');
    var gridLimit = opts.count != null ? opts.count : 30;
    var gi;
    for (gi = 0; gi < gridCards.length && gi < gridLimit; gi++) {
      hydrateCardPoster(gridCards[gi], { priority: true });
    }
    return;
  }
  var cards = collectPosterBatchCards(rootEl, opts);
  var i;
  for (i = 0; i < cards.length; i++) {
    hydrateCardPoster(cards[i], { priority: true });
  }
}

/**
 * Resolve when minReady posters in the initial batch have loaded/errored, or timeout.
 * Pair with hydratePosterBatch (or hydrateGridWindow) so img elements are bound first.
 */
function waitForPosterBatch(rootEl, opts) {
  opts = opts || {};
  var cards = opts.cards || collectPosterBatchCards(rootEl, opts);
  var minReady = opts.minReady != null ? opts.minReady : (opts.priorityCount || 18);
  var timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : 9000;
  var isCancelled = opts.isCancelled || function () { return false; };

  if (!cards.length) return Promise.resolve();

  return new Promise(function (resolve) {
    var settled = false;
    var readyCount = 0;
    var timer = null;
    var handlers = [];

    function finish() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      var h;
      for (h = 0; h < handlers.length; h++) {
        var entry = handlers[h];
        if (entry.img) {
          entry.img.onload = null;
          entry.img.onerror = null;
        }
      }
      resolve();
    }

    function markReady() {
      if (settled || isCancelled()) {
        finish();
        return;
      }
      readyCount += 1;
      if (readyCount >= minReady || readyCount >= cards.length) finish();
    }

    function considerCard(card) {
      var url = card.getAttribute('data-thumb') || '';
      if (!url) {
        markReady();
        return;
      }
      if (loadedUrls[url]) {
        markReady();
        return;
      }
      var img = card.querySelector('img.poster');
      if (!img) {
        markReady();
        return;
      }
      if (img.getAttribute('src') === url && img.complete && img.naturalWidth > 0) {
        markPosterLoaded(url);
        markReady();
        return;
      }
      if (!img.getAttribute('src')) {
        hydrateCardPoster(card, { priority: true });
      } else if (img.getAttribute('src') !== url) {
        bindPosterImage(img, url, { priority: true });
      }
      var handler = function () {
        img.onload = null;
        img.onerror = null;
        markPosterLoaded(url);
        markReady();
      };
      img.onload = handler;
      img.onerror = handler;
      handlers.push({ img: img });
    }

    var i;
    for (i = 0; i < cards.length; i++) considerCard(cards[i]);

    timer = setTimeout(finish, timeoutMs);
  });
}

function hydrateAndWaitForPosters(rootEl, opts) {
  opts = opts || {};
  if (!opts.cards || !opts.cards.length) {
    hydratePosterBatch(rootEl, opts);
  }
  return waitForPosterBatch(rootEl, opts);
}

export {
  POSTER_WIDTH_ROW,
  POSTER_WIDTH_GRID,
  POSTER_WIDTH_EPISODE,
  POSTER_HEIGHT_EPISODE,
  sizedPosterUrl,
  clearPosterReveal,
  revealPosterImage,
  watchPosterReveal,
  bindPosterImage,
  hydrateCardPoster,
  hydrateRowWindow,
  hydrateGridWindow,
  hydrateFocusedNeighborhood,
  prefetchPosterUrls,
  resolveItemPosterUrl,
  collectHubPrefetchPosterUrls,
  waitForPosterUrls,
  warmHubPrefetchPosters,
  collectNeighborhoodThumbs,
  primeVisiblePosters,
  collectPosterBatchCards,
  hydratePosterBatch,
  waitForPosterBatch,
  hydrateAndWaitForPosters,
  hydrateGridViewport,
  hydrateRowViewport,
  clearPosterUrlMaps
};
