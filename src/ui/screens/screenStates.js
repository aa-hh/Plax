/**
 * Loading / empty / error state renderers shared by the browse screens
 * (library grid, search, watchlist). Dependency-free so node:test can load it
 * without the store / backend import chain the screens pull in.
 *
 * Callers own focus: after any of these re-render a container they must call
 * invalidateFocusableCache() and put focus somewhere sensible.
 */

var ROW_SKELETON_CARDS = 8;

/**
 * Plain-voice error copy that names the problem AND the recovery.
 * `what` is the thing being loaded, e.g. "this library", "search results".
 */
function describeLoadError(err, what) {
  var status = err && err.status;
  var msg = err && err.message ? String(err.message) : '';
  if (status === 401) return 'Your sign-in expired. Sign in again from Settings, then reload ' + what + '.';
  if (status === 403) return 'Your account is not allowed to see ' + what + '.';
  if (status === 404) return 'The server could not find ' + what + '. Reopen it from the sidebar.';
  if (status >= 500) return 'The server had a problem loading ' + what + '. Try again in a moment.';
  if (/timeout|timed out/i.test(msg)) return 'Loading ' + what + ' timed out. Check the connection and try again.';
  if (status === 0 || /network|failed to fetch|offline|unreachable/i.test(msg)) {
    return 'Could not reach the server to load ' + what + '. Check the connection and try again.';
  }
  return 'Could not load ' + what + (msg ? ' (' + msg + ')' : '') + '. Try again.';
}

/**
 * Replace `el`'s content with a status line and, when `opts.retry` is given, a
 * D-pad-focusable "Try again" button wired to it. Returns the button (or null).
 */
function renderStatus(el, text, opts) {
  if (!el) return null;
  opts = opts || {};
  el.innerHTML = '';
  var p = document.createElement('p');
  p.className = 'status-msg' + (opts.error ? ' status-msg--error' : '');
  p.textContent = text;
  el.appendChild(p);
  if (!opts.retry) return null;
  var btn = document.createElement('button');
  btn.className = 'btn btn-outline btn--sm status-retry';
  btn.setAttribute('tabindex', '0');
  btn.textContent = opts.retryLabel || 'Try again';
  btn.addEventListener('click', opts.retry);
  el.appendChild(btn);
  return btn;
}

/** Horizontal-rail loading placeholders (search results, watchlist feed). */
function renderRowSkeletons(el, count) {
  if (!el) return;
  el.innerHTML = '';
  for (var i = 0; i < count; i++) {
    var section = document.createElement('div');
    section.className = 'row-section row-skeleton';
    section.innerHTML =
      '<p class="row-label row-skeleton-label"></p>' +
      '<div class="row-scroll row-skeleton-scroll">' +
      new Array(ROW_SKELETON_CARDS + 1).join('<div class="row-skeleton-card"></div>') +
      '</div>';
    el.appendChild(section);
  }
}

/** Poster-sized loading placeholders laid out like grid cards. */
function renderGridSkeleton(grid, count) {
  if (!grid) return;
  grid.innerHTML = new Array(count + 1).join('<div class="row-skeleton-card media-grid-skeleton-card"></div>');
}

/**
 * Restart a one-shot CSS enter animation on `el` by re-applying `cls`. The
 * forced reflow is one per state change (never per frame). No-op off-DOM.
 */
function replayEnter(el, cls) {
  if (!el || !el.classList) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Trim a user-facing string for a dialog title; never splits a surrogate pair (emoji). */
function truncateLabel(s, max) {
  var str = s == null ? '' : String(s);
  if (str.length <= max) return str;
  var cut = str.slice(0, max - 1);
  var last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xD800 && last <= 0xDBFF) cut = cut.slice(0, -1);
  return cut.replace(/\s+$/, '') + '…';
}

export {
  describeLoadError,
  renderStatus,
  renderRowSkeletons,
  renderGridSkeleton,
  replayEnter,
  truncateLabel
};
