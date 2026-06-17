/**
 * Idle-time prefetch: warm the cache for the screens the user is most likely
 * to open next, so the next screen renders without a network round-trip —
 * the Kodi "the data is already there" feel.
 *
 * What we warm:
 *   - getMetadata for the top items of the first hub rows (detail page body)
 *   - getChildren + getMetadataRelatedHubList for those same items, i.e. the
 *     first network calls a detail screen makes (seasons / related rails)
 *   - the first library's browse listing (browseByType) so entering it is warm
 *   - metadata for items inside a detail screen's related rows / next episode
 *
 * Every fetch goes through cache.remember()/rememberSWR(), so a real user
 * navigation singleflight-joins the in-flight prefetch instead of duplicating
 * the request.
 *
 * Throttling contract:
 *   - at most ONE in-flight request at a time (a shared queue of tasks)
 *   - a short idle delay before the queue starts pumping, so first-paint and
 *     the user's first input both win the frame budget
 *   - abortPrefetch() drops the queue AND bumps a generation token so any
 *     in-flight task that resolves later cannot pump the stale queue
 *   - all tasks are best-effort: errors are swallowed and never surface
 */
import {
  getMetadata,
  getChildren,
  getMetadataRelatedHubList,
  browseByType
} from '../plex/library.js';

// The queue holds task thunks: function () -> Promise. Each thunk performs at
// most one network round-trip (singleflighted via the cache) and resolves
// regardless of success/failure.
var queue = [];
var inFlight = false;
var cancelled = false;
var startTimer = null;
// Bumped on every abort. A task captures the generation it was pumped under;
// if it resolves after an abort, it won't pump the (new) queue.
var generation = 0;
// De-dup across calls so we never enqueue the same work twice while it's
// still pending. Reset on abort.
var enqueued = Object.create(null);

function clear() {
  queue = [];
  enqueued = Object.create(null);
  cancelled = true;
  generation += 1;
  inFlight = false;
  if (startTimer) { clearTimeout(startTimer); startTimer = null; }
}

function pump() {
  if (cancelled || !queue.length || inFlight) return;
  var task = queue.shift();
  if (!task) return pump();
  inFlight = true;
  var gen = generation;
  Promise.resolve()
    .then(task)
    ['catch'](function () { /* best-effort: swallow */ })
    .then(function () {
      // If we were aborted mid-flight, a new schedule may have started its
      // own pump under a newer generation — don't double-pump.
      if (gen !== generation) return;
      inFlight = false;
      pump();
    });
}

// Enqueue a thunk under a stable de-dup id. No-ops if already pending.
function enqueueTask(id, thunk) {
  if (!id || enqueued[id]) return;
  enqueued[id] = true;
  queue.push(thunk);
}

function scheduleStart(idleDelayMs) {
  if (startTimer) clearTimeout(startTimer);
  startTimer = setTimeout(function () {
    startTimer = null;
    pump();
  }, idleDelayMs);
}

// Best-effort warmers for the calls a detail screen makes first. Each is a
// thunk that resolves regardless of outcome so the queue keeps draining.
function warmMetadata(server, ratingKey) {
  return getMetadata(server, ratingKey)['catch'](function () {});
}

function warmChildren(server, ratingKey) {
  return getChildren(server, ratingKey)['catch'](function () {});
}

function warmRelatedHubs(server, ratingKey) {
  // Match detailScreen's size (12) so the cache key collides with the real load.
  return getMetadataRelatedHubList(server, ratingKey, 12)['catch'](function () {});
}

function warmBrowse(server, lib) {
  // Match libraryScreen's call so the browse cache key collides on real entry.
  return browseByType(server, lib.id, lib.type, { progressive: true })['catch'](function () {});
}

/**
 * Enqueue the top items from the supplied hub rows for background prefetch.
 * Warms each item's metadata and — for the very top items — the detail
 * screen's first follow-up calls (children + related hubs), so opening detail
 * needs no network.
 *
 * Safe to call repeatedly — duplicate work is ignored.
 *
 * Starts after a short idle delay so first-paint and the user's first input
 * both win the frame budget.
 *
 * opts:
 *   perRow      — items per row to warm metadata for (default 6)
 *   maxRows     — rows to consider (default 2)
 *   deepCount   — of the warmed items, how many also get children + related
 *                 hubs prefetched (default 3, set 0 to disable)
 *   idleDelayMs — idle gate before pumping (default 2500)
 */
function schedulePrefetch(server, rows, opts) {
  if (!server || !rows || !rows.length) return;
  opts = opts || {};
  var perRow = opts.perRow != null ? opts.perRow : 6;
  var maxRows = opts.maxRows != null ? opts.maxRows : 2;
  var deepCount = opts.deepCount != null ? opts.deepCount : 3;
  var idleDelayMs = opts.idleDelayMs != null ? opts.idleDelayMs : 2500;

  cancelled = false;
  var scope = serverScopeId(server);
  var deepBudget = deepCount;

  for (var r = 0; r < rows.length && r < maxRows; r++) {
    var items = (rows[r] && rows[r].items) || [];
    for (var i = 0; i < items.length && i < perRow; i++) {
      var item = items[i];
      var key = item && item.ratingKey;
      if (!key) continue;
      (function (ratingKey, item) {
        enqueueTask('meta:' + scope + ':' + ratingKey, function () {
          return warmMetadata(server, ratingKey);
        });
        // Warm detail follow-ups for the first few, top-of-list items only —
        // these are the most likely opens and the most expensive screens.
        if (deepBudget > 0) {
          deepBudget -= 1;
          enqueueDetailFollowups(server, scope, ratingKey, item);
        }
      })(key, item);
    }
  }

  scheduleStart(idleDelayMs);
}

// Enqueue the calls a detail screen fires after its metadata resolves:
// shows/seasons -> getChildren, movies/shows -> related hubs. Type may be
// absent for hub items (they carry it in practice), so we warm both safely.
function enqueueDetailFollowups(server, scope, ratingKey, item) {
  var type = item && item.type;
  // Related hubs: detailScreen loads them for movies and shows.
  if (!type || type === 'movie' || type === 'show') {
    enqueueTask('related:' + scope + ':' + ratingKey, function () {
      return warmRelatedHubs(server, ratingKey);
    });
  }
  // Children: shows (seasons) and seasons (episodes) load these first.
  if (!type || type === 'show' || type === 'season') {
    enqueueTask('children:' + scope + ':' + ratingKey, function () {
      return warmChildren(server, ratingKey);
    });
  }
}

/**
 * Prefetch the metadata for items in a detail screen's related rows / next
 * episode, so drilling further from a detail page is instant. Best-effort and
 * throttled like everything else.
 *
 * opts:
 *   max         — cap on how many items to warm (default 8)
 *   idleDelayMs — idle gate (default 2500)
 */
function prefetchDetailItems(server, items, opts) {
  if (!server || !items || !items.length) return;
  opts = opts || {};
  var max = opts.max != null ? opts.max : 8;
  var idleDelayMs = opts.idleDelayMs != null ? opts.idleDelayMs : 2500;

  cancelled = false;
  var scope = serverScopeId(server);
  var warmed = 0;
  for (var i = 0; i < items.length && warmed < max; i++) {
    var item = items[i];
    var key = item && item.ratingKey;
    if (!key) continue;
    warmed += 1;
    (function (ratingKey) {
      enqueueTask('meta:' + scope + ':' + ratingKey, function () {
        return warmMetadata(server, ratingKey);
      });
    })(key);
  }

  scheduleStart(idleDelayMs);
}

/**
 * Prefetch the first library's first page (browseByType) so entering the
 * library from Home is warm. Best-effort and throttled.
 *
 * opts:
 *   idleDelayMs — idle gate (default 2500)
 */
function prefetchLibraryBrowse(server, lib, opts) {
  if (!server || !lib || !lib.id) return;
  opts = opts || {};
  var idleDelayMs = opts.idleDelayMs != null ? opts.idleDelayMs : 2500;

  cancelled = false;
  var scope = serverScopeId(server);
  enqueueTask('browse:' + scope + ':' + lib.id + ':' + (lib.type || ''), function () {
    return warmBrowse(server, lib);
  });

  scheduleStart(idleDelayMs);
}

function serverScopeId(server) {
  if (!server) return 'noserver';
  return server.clientIdentifier || server.connectionUri || 'unknown';
}

/**
 * Abort the running prefetch and drop the queue. Call on real navigation /
 * user input so we never share a Plex connection with the foreground.
 */
function abortPrefetch() {
  clear();
}

function __isIdleForTests() {
  return !inFlight && !queue.length;
}

export {
  schedulePrefetch,
  prefetchDetailItems,
  prefetchLibraryBrowse,
  abortPrefetch,
  __isIdleForTests
};
