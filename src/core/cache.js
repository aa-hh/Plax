/**
 * In-memory LRU + TTL cache with namespaces.
 *
 * Designed for webOS TV 5+ memory budget: small, bounded, predictable.
 * No Service Worker (LG support is unreliable across firmwares).
 * No localStorage spill — TV storage is slow and ephemeral artefacts must
 * vanish on relaunch.
 *
 * Default policy (per namespace, see DEFAULT_NAMESPACES below):
 *   libraries  — TTL 15 min, max 8   entries  (servers list * libs)
 *   hubs       — TTL 60 sec, max 32  entries  (home + section + related)
 *   browse     — TTL 2  min, max 16  entries  (library section grids)
 *   metadata   — TTL 5  min, max 64  entries  (movie / show / episode pages)
 *   children   — TTL 5  min, max 32  entries  (seasons & episodes lists)
 *   search     — TTL 30 sec, max 16  entries  (hubs/search by query)
 *   ultrablur  — TTL 30 min, max 32  entries  (detail backdrop URLs)
 *
 * API:
 *   var cache = require('core/cache.js');
 *   cache.get(ns, key)
 *   cache.set(ns, key, value, ttlMs?)   // overrides TTL for one entry
 *   cache.remember(ns, key, loader, ttlMs?)  // get-or-fetch (singleflight)
 *   cache.rememberSWR(ns, key, loader, opts?) // stale-while-revalidate
 *   cache.peek(ns, key, allowStale?)    // read without LRU touch / miss count
 *   cache.invalidateMatching(ns, pred)  // drop keys where pred(key) is true
 *   cache.invalidate(ns, key?)          // key omitted → wipe whole namespace
 *   cache.invalidateAll()               // wipe every namespace (sign out)
 *   cache.invalidateServerScoped(serverId?) // wipe everything that lives
 *                                            // under a Plex server (server
 *                                            // switch); ns/key are namespaced
 *                                            // by serverId via buildKey.
 *   cache.buildKey(serverId, ...parts)  // join helper, undef-safe
 *   cache.stats()                       // { ns: { size, hits, misses } }
 */

var DEFAULT_NAMESPACES = {
  libraries: { ttlMs: 15 * 60 * 1000, max: 8 },
  hubs:      { ttlMs:      60 * 1000, max: 32 },
  browse:    { ttlMs:   2 * 60 * 1000, max: 16 },
  metadata:  { ttlMs:  5 * 60 * 1000, max: 64 },
  children:  { ttlMs:  5 * 60 * 1000, max: 32 },
  search:    { ttlMs:      30 * 1000, max: 16 },
  ultrablur: { ttlMs: 30 * 60 * 1000, max: 32 }
};

var stores = {};
var inflight = Object.create(null);
var swrInflight = Object.create(null);

function ensureStore(ns) {
  if (!stores[ns]) {
    var cfg = DEFAULT_NAMESPACES[ns] || { ttlMs: 60 * 1000, max: 32 };
    stores[ns] = {
      ttlMs: cfg.ttlMs,
      max: cfg.max,
      entries: Object.create(null),
      order: [],
      hits: 0,
      misses: 0
    };
  }
  return stores[ns];
}

function now() {
  return Date.now();
}

function touch(store, key) {
  var idx = store.order.indexOf(key);
  if (idx >= 0) store.order.splice(idx, 1);
  store.order.push(key);
}

function evictIfNeeded(store) {
  while (store.order.length > store.max) {
    var evict = store.order.shift();
    delete store.entries[evict];
  }
}

function isExpired(entry) {
  return entry.expiresAt > 0 && entry.expiresAt < now();
}

function get(ns, key) {
  var store = ensureStore(ns);
  var entry = store.entries[key];
  if (!entry) {
    store.misses += 1;
    return undefined;
  }
  if (isExpired(entry)) {
    delete store.entries[key];
    var idx = store.order.indexOf(key);
    if (idx >= 0) store.order.splice(idx, 1);
    store.misses += 1;
    return undefined;
  }
  store.hits += 1;
  touch(store, key);
  return entry.value;
}

function set(ns, key, value, ttlMs) {
  var store = ensureStore(ns);
  var ttl = ttlMs != null ? ttlMs : store.ttlMs;
  store.entries[key] = {
    value: value,
    setAt: now(),
    expiresAt: ttl > 0 ? now() + ttl : 0
  };
  touch(store, key);
  evictIfNeeded(store);
  return value;
}

function peek(ns, key, allowStale) {
  var store = ensureStore(ns);
  var entry = store.entries[key];
  if (!entry) return undefined;
  if (!allowStale && isExpired(entry)) return undefined;
  return entry.value;
}

function inflightKey(ns, key) {
  return ns + '\0' + key;
}

function remember(ns, key, loader, ttlMs) {
  var hit = get(ns, key);
  if (hit !== undefined) return Promise.resolve(hit);
  var ik = inflightKey(ns, key);
  if (inflight[ik]) return inflight[ik];
  inflight[ik] = Promise.resolve()
    .then(loader)
    .then(function (value) {
      if (value !== undefined && value !== null) set(ns, key, value, ttlMs);
      return value;
    })
    .finally(function () {
      delete inflight[ik];
    });
  return inflight[ik];
}

/**
 * Stale-while-revalidate: return cached value immediately (even past TTL),
 * then refresh in the background. Fresh loads still singleflight via remember.
 */
function revalidateSWR(ns, key, loader, opts) {
  var ik = inflightKey(ns, key);
  if (swrInflight[ik]) return swrInflight[ik];
  swrInflight[ik] = Promise.resolve()
    .then(loader)
    .then(function (fresh) {
      if (fresh !== undefined && fresh !== null) {
        set(ns, key, fresh, opts.ttlMs);
        if (typeof opts.onRevalidated === 'function') opts.onRevalidated(fresh);
      }
      return fresh;
    })
    .catch(function () {})
    .finally(function () {
      delete swrInflight[ik];
    });
  return swrInflight[ik];
}

function rememberSWR(ns, key, loader, opts) {
  opts = opts || {};
  var store = ensureStore(ns);
  var entry = store.entries[key];
  var staleMs = opts.staleMs != null ? opts.staleMs : store.ttlMs;
  if (entry) {
    var age = now() - (entry.setAt || 0);
    var stale = isExpired(entry) || age >= staleMs;
    if (!stale) return remember(ns, key, loader, opts.ttlMs);
    revalidateSWR(ns, key, loader, opts);
    return Promise.resolve(entry.value);
  }
  return remember(ns, key, loader, opts.ttlMs);
}

function invalidate(ns, key) {
  var store = stores[ns];
  if (!store) return;
  if (key == null) {
    store.entries = Object.create(null);
    store.order = [];
    return;
  }
  delete store.entries[key];
  delete inflight[inflightKey(ns, key)];
  delete swrInflight[inflightKey(ns, key)];
  var idx = store.order.indexOf(key);
  if (idx >= 0) store.order.splice(idx, 1);
}

function invalidateMatching(ns, predicate) {
  var store = stores[ns];
  if (!store || typeof predicate !== 'function') return;
  var keys = store.order.slice();
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (predicate(k)) {
      delete store.entries[k];
      delete inflight[inflightKey(ns, k)];
      delete swrInflight[inflightKey(ns, k)];
      var idx = store.order.indexOf(k);
      if (idx >= 0) store.order.splice(idx, 1);
    }
  }
}

function invalidateAll() {
  Object.keys(stores).forEach(function (ns) { invalidate(ns); });
}

function invalidateServerScoped(serverId) {
  Object.keys(stores).forEach(function (ns) {
    var store = stores[ns];
    var prefix = serverId != null ? String(serverId) + ':' : null;
    var keys = store.order.slice();
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (prefix == null || k.indexOf(prefix) === 0) {
        delete store.entries[k];
        var idx = store.order.indexOf(k);
        if (idx >= 0) store.order.splice(idx, 1);
      }
    }
  });
}

function buildKey() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var a = arguments[i];
    if (a == null || a === '') continue;
    parts.push(String(a));
  }
  return parts.join(':');
}

function stats() {
  var out = {};
  Object.keys(stores).forEach(function (ns) {
    var s = stores[ns];
    out[ns] = { size: s.order.length, max: s.max, ttlMs: s.ttlMs, hits: s.hits, misses: s.misses };
  });
  return out;
}

function configure(ns, cfg) {
  var store = ensureStore(ns);
  if (cfg.ttlMs != null) store.ttlMs = cfg.ttlMs;
  if (cfg.max != null) {
    store.max = cfg.max;
    evictIfNeeded(store);
  }
}

export {
  DEFAULT_NAMESPACES,
  get,
  peek,
  set,
  remember,
  rememberSWR,
  invalidate,
  invalidateMatching,
  invalidateAll,
  invalidateServerScoped,
  buildKey,
  stats,
  configure
};
