/**
 * Two-tier cache with namespaces: in-memory LRU+TTL (fresh) on top of
 * an IndexedDB-backed persistent layer (warm across app restarts).
 *
 * Designed for webOS TV memory budget: small, bounded, predictable in
 * memory. The persistent layer (see core/persistentCache.js) lets us
 * survive cold boots and give Back navigation the Kodi-style "the data
 * is already on the device" feel.
 *
 * Default policy (per namespace, see DEFAULT_NAMESPACES below):
 *   libraries  — TTL 15 min, max 8   entries  (servers list * libs)
 *   hubs       — TTL 60 sec, max 32  entries  (home + section + related)
 *   browse     — TTL 2  min, max 16  entries  (library section grids)
 *   metadata   — TTL 5  min, max 64  entries  (movie / show / episode pages)
 *   children   — TTL 5  min, max 32  entries  (seasons & episodes lists)
 *   search     — TTL 30 sec, max 16  entries  (hubs/search by query)
 *   ultrablur  — TTL 30 min, max 32  entries  (detail backdrop URLs)
 *   storyboard — TTL 30 min, max 16  entries  (parsed sprite metadata per title)
 *
 * Each namespace also declares `persist` (boolean) and `persistTtlMs`
 * (longer disk TTL, since stale-but-present beats nothing on a cold boot).
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

var MIN = 60 * 1000;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;

var DEFAULT_NAMESPACES = {
  libraries:  { ttlMs: 15 * MIN, max: 8,  persist: true,  persistTtlMs: DAY },
  hubs:       { ttlMs:      MIN, max: 32, persist: true,  persistTtlMs: 6 * HOUR },
  browse:     { ttlMs:  2 * MIN, max: 16, persist: true,  persistTtlMs: 6 * HOUR },
  metadata:   { ttlMs:  5 * MIN, max: 64, persist: true,  persistTtlMs: 7 * DAY },
  children:   { ttlMs:  5 * MIN, max: 32, persist: true,  persistTtlMs: 7 * DAY },
  search:     { ttlMs:      30 * 1000, max: 16, persist: false },
  ultrablur:  { ttlMs: 30 * MIN, max: 32, persist: true,  persistTtlMs: 30 * DAY },
  storyboard: { ttlMs: 30 * MIN, max: 16, persist: true,  persistTtlMs: 30 * DAY }
};

var stores = {};
var inflight = Object.create(null);
var swrInflight = Object.create(null);
var persistentImpl = null; // injected; falls back to require if not set
var hydratedKeys = Object.create(null); // ns+key for which we've checked disk this session

function ensureStore(ns) {
  if (!stores[ns]) {
    var cfg = DEFAULT_NAMESPACES[ns] || { ttlMs: 60 * 1000, max: 32, persist: false };
    stores[ns] = {
      ttlMs: cfg.ttlMs,
      max: cfg.max,
      persist: !!cfg.persist,
      persistTtlMs: cfg.persistTtlMs || 0,
      entries: Object.create(null),
      order: [],
      hits: 0,
      misses: 0
    };
  }
  return stores[ns];
}

/**
 * Inject a persistent-cache implementation. Tests use this to swap in a
 * fake; production wires the real IndexedDB-backed module at startup.
 */
function setPersistentImpl(impl) {
  persistentImpl = impl || null;
}

function persistGet(ns, key) {
  if (!persistentImpl) return Promise.resolve(undefined);
  try { return persistentImpl.get(ns, key); }
  catch (e) { return Promise.resolve(undefined); }
}

function persistSet(ns, key, value, ttlMs) {
  if (!persistentImpl) return;
  try { persistentImpl.set(ns, key, value, ttlMs); }
  catch (e) { /* ignore */ }
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
  var store = ensureStore(ns);
  var memTtl = ttlMs != null ? ttlMs : store.ttlMs;
  var diskTtl = store.persistTtlMs || memTtl;

  function fetchFresh() {
    return Promise.resolve()
      .then(loader)
      .then(function (value) {
        if (value !== undefined && value !== null) {
          set(ns, key, value, ttlMs);
          if (store.persist) persistSet(ns, key, value, diskTtl);
        }
        return value;
      });
  }

  if (!store.persist || hydratedKeys[ik]) {
    inflight[ik] = fetchFresh().finally(function () { delete inflight[ik]; });
    return inflight[ik];
  }
  // First time we've seen this key this session — peek disk before going
  // to the network. persistGet is timeout-bounded in persistentCache, so a
  // wedged IDB resolves to undefined and we fall through to fetchFresh.
  hydratedKeys[ik] = true;
  inflight[ik] = persistGet(ns, key).then(function (disk) {
    if (disk !== undefined && disk !== null) {
      set(ns, key, disk, ttlMs);
      revalidateSWR(ns, key, loader, { ttlMs: memTtl, persistTtlMs: diskTtl, persist: true });
      return disk;
    }
    return fetchFresh();
  }).finally(function () { delete inflight[ik]; });
  return inflight[ik];
}

/**
 * Stale-while-revalidate: return cached value immediately (even past TTL),
 * then refresh in the background. Fresh loads still singleflight via remember.
 */
function revalidateSWR(ns, key, loader, opts) {
  var ik = inflightKey(ns, key);
  if (swrInflight[ik]) return swrInflight[ik];
  var store = ensureStore(ns);
  var persist = opts.persist != null ? opts.persist : !!store.persist;
  var diskTtl = opts.persistTtlMs || store.persistTtlMs || opts.ttlMs;
  swrInflight[ik] = Promise.resolve()
    .then(loader)
    .then(function (fresh) {
      if (fresh !== undefined && fresh !== null) {
        set(ns, key, fresh, opts.ttlMs);
        if (persist) persistSet(ns, key, fresh, diskTtl);
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
  // Memory miss. If we haven't checked disk yet this session and the
  // namespace persists, try disk — that's the cold-boot fast-path.
  var ik = inflightKey(ns, key);
  if (store.persist && !hydratedKeys[ik]) {
    hydratedKeys[ik] = true;
    return persistGet(ns, key).then(function (disk) {
      if (disk !== undefined && disk !== null) {
        set(ns, key, disk, opts.ttlMs);
        revalidateSWR(ns, key, loader, opts);
        return disk;
      }
      return remember(ns, key, loader, opts.ttlMs);
    });
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
  hydratedKeys = Object.create(null);
  if (persistentImpl && typeof persistentImpl.clearAll === 'function') {
    try { persistentImpl.clearAll(); } catch (e) { /* ignore */ }
  }
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
  // Drop disk hydration markers for the affected scope so the next
  // remember() call re-checks (and on a wipe, gets nothing).
  if (serverId == null) {
    hydratedKeys = Object.create(null);
    if (persistentImpl && typeof persistentImpl.clearAll === 'function') {
      try { persistentImpl.clearAll(); } catch (e) { /* ignore */ }
    }
  } else {
    var pref = String(serverId) + ':';
    Object.keys(hydratedKeys).forEach(function (ik) {
      var sep = ik.indexOf('\0');
      var keyPart = sep >= 0 ? ik.substring(sep + 1) : ik;
      if (keyPart.indexOf(pref) === 0) delete hydratedKeys[ik];
    });
  }
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
  configure,
  setPersistentImpl
};
