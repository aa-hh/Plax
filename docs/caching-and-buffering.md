# Caching and Buffering

Rules for in-app data caching and video buffer behaviour on **webOS TV 4.0+**.
Scoped to the LG performance budget (`docs/perf-budgets.md`) and platform
constraints (`docs/webos-tv-spec-compliance.md`).

> **No Service Worker.** webOS Service Worker support is inconsistent across
> firmwares (especially 5.x and 6.x). For persistence we use IndexedDB
> (`src/core/persistentCache.js`) wrapped by `src/core/cache.js` as the warm
> tier under the in-memory LRU; `localStorage` is reserved for the small
> auth/identity blob.

## Two-tier cache (Kodi-shaped)

Reads consult the in-memory LRU first, then IndexedDB, then the network.
Writes are write-through: a successful network response populates both tiers.
On a cold boot the disk tier returns the previous session's data
synchronously while a background SWR refresh runs.

Per namespace TTLs:

| Namespace   | Memory TTL | Disk TTL | Persist |
| ----------- | ---------- | -------- | ------- |
| libraries   | 15 min     | 24 h     | yes     |
| hubs        | 60 sec     | 6 h      | yes     |
| browse      | 2 min      | 6 h      | yes     |
| metadata    | 5 min      | 7 d      | yes     |
| children    | 5 min      | 7 d      | yes     |
| search      | 30 sec     | —        | no      |
| ultrablur   | 30 min     | 30 d     | yes     |
| storyboard  | 30 min     | 30 d     | yes     |

Disk writes are batched and flushed off the input path via `setTimeout(0)`,
so a high keypress rate does not block on IDB. Poster bytes (and avatars)
are persisted in a separate `blobs` store with an 80 MB LRU budget.

---

## Plex media URL auth (images / video)

Plex Media Server expects `X-Plex-Token` on `/photo/:/transcode` and playback URLs.
The TV app uses **header auth** for `fetch` / XML (`plexHeaders`) and **query-string
auth** for `<img src>` and `<video src>` via `serverUrl` / `plexClientQuery`
(`src/plex/client.js`). webOS does not send custom headers on image elements, and
there is no supported Plex path for thumb URLs without a token in the query on
LAN clients. **Deferral:** token-in-query for posters remains an accepted Plex TV
tradeoff; avoid logging full image URLs in error paths (`tokenFromServerUrl` helps
strip tokens from some diagnostics).

---

## 1. Caching (app data)

### 1.1 Implementation

`src/core/cache.js` — single in-memory LRU + TTL cache with namespaces. No
external deps, ~150 LOC, drop-in. No localStorage spill — TV storage is slow
and per-relaunch cache is the right durability bound.

```js
import * as cache from '../core/cache.js';

// Get-or-fetch:
cache.remember('metadata', cache.buildKey(serverId, ratingKey), function () {
  return fetchPlexXml(url).then(map);
});

cache.invalidate('metadata', key);     // single entry
cache.invalidate('hubs');              // whole namespace
cache.invalidateServerScoped(serverId); // everything under a Plex server
cache.invalidateAll();                  // sign out
```

### 1.2 Namespaces and policy

| Namespace  | TTL    | Max entries | Bound by                                | Source                                  |
|------------|--------|-------------|-----------------------------------------|-----------------------------------------|
| `libraries` | 15 min | 8           | Servers × sections list                 | `getLibraries` in `src/plex/servers/discovery.js` |
| `hubs`      | 60 sec | 32          | Home + section + related hub lists/items | `getPromotedHubList`, `getSectionHubList`, `getMetadataRelatedHubList`, `getHubItems` in `src/plex/library.js` |
| `browse`    | 2 min  | 16          | Library section grids (`browseByType`)  | `browseByType` in `src/plex/library.js` |
| `metadata`  | 5 min  | 64          | `/library/metadata/{ratingKey}` results | `getMetadata` in `src/plex/library.js`  |
| `children`  | 5 min  | 32          | `/library/metadata/{ratingKey}/children` (seasons, episodes) | `getChildren` in `src/plex/library.js` |
| `search`    | 30 sec | 16          | `/hubs/search` result rows per query    | `searchHubs` in `src/plex/search.js`    |

Why these numbers:

- **`hubs` short TTL (60 s)** — Continue Watching / Recently Added / On Deck
  must stay responsive after the user finishes an episode. Avoids stale rows
  but still removes the 5-row hub spinner storm when the user bounces
  Home ⇄ Library.
- **`metadata` / `children` 5 min** — a single PMS round trip is the bulk of
  the wait when entering a detail screen; a brief cache covers back-and-forth
  navigation without hiding fresh watch state for long.
- **`libraries` 15 min** — section list rarely changes during a TV session.
- **`browse` 2 min** — full section listings from `browseByType`; revisiting a
  library tab within TTL skips PMS pagination. Progressive first paint still
  fetches live; remaining pages load in parallel (concurrency 2) and populate
  the cache when complete.
- **`search` 30 sec** — debounced queries; bypassed when `searchHubs` streams
  rows (`stagger: true` + `onRow`).
- **Bounds** — 64 metadata + 32 children + 16 browse entries × ≤10 KB per entry
  ≈ ~1 MB upper bound, well inside the LG TV per-app heap budget. LRU evicts the
  oldest entry on every `set` past the cap.

### 1.2.1 Stale-while-revalidate (hubs)

Hub list and hub-item loaders use `cache.rememberSWR` (30–45 s soft stale window
inside the 60 s hard TTL):

- **Hit (fresh)** — same as `remember` (singleflight, no network).
- **Hit (stale)** — return cached rows immediately; refresh in the background.
- **Miss** — `remember` + singleflight.

Keys unchanged: `{serverScope}:promoted:{size}`, `{serverScope}:items:{hubPath}:{size}`, etc.

`cache.remember` coalesces concurrent loaders for the same namespace/key (in-flight map).

### 1.2.2 Bootstrap overlap

`bootstrapScreen` runs `getLibraries` and `prefetchHomeHubs` in parallel after the
first server is selected. `prefetchHomeHubs` loads the promoted hub list plus the
first two hub rows so Home’s first paint is often warm-cache.

All cache keys are server-scoped via `cache.buildKey(serverScope, ...)` so a
shared TV (Plex Home) can switch users without leaking another account's data.

### 1.3 Invalidation hooks

| Trigger                                  | Action                                  | Wired in                                  |
|------------------------------------------|-----------------------------------------|-------------------------------------------|
| Sign out                                 | `cache.invalidateAll()`                 | `src/ui/screens/settingsScreen.js` (Sign out button) |
| Plex Home user switch                    | `cache.invalidateAll()`                 | `src/ui/screens/settingsScreen.js` (user chips)      |
| Server switch (future UI)                | `cache.invalidateServerScoped(oldId)` or `invalidateAll()` | Call from the switch handler |
| `markWatched` / `markUnwatched`          | Invalidate metadata + children for the key; **scoped** hub item keys for Continue Watching / On Deck / Recently Added (not the whole `hubs` namespace) | `src/plex/library.js` |
| `updateProgress` with `state=stopped` or `paused` | Same scoped hub invalidation (viewOffset changed)                                   | `src/plex/library.js` |
| Section scan (`refreshSection`)          | `invalidateMatching` on `browse` for that section + section/watch-sensitive hub keys | `src/plex/library.js` |
| Detail screen "Refresh metadata"         | `getMetadata(..., { fresh: true })` bypasses cache for one call                                              | `src/ui/screens/detailScreen.js`         |

The `{ fresh: true }` opt is the documented escape hatch for any caller that
needs to force a refetch.

### 1.4 What is **not** cached here

- **Plex token / clientId** — already in `localStorage` via
  `src/core/storage.js`. That stays. `cache.invalidateAll()` does **not**
  touch persisted auth. Sign-out clears auth separately via `clearAuth()`.
- **Poster bytes** — HTTP cache only (see §1.5).
- **Plex Home user switch state** — `activeHomeUser` is persisted in
  `localStorage` and lives in `core/store.js`.

### 1.5 Image caching

Posters and art are loaded via `<img src>` with stable, tokenised URLs from
`getThumbUrl` / `getArtUrl`. The browser HTTP cache handles them — no
application-layer image cache is needed.

Constraints from `docs/perf-budgets.md`:

- Posters request **max 300 px wide** on browse grids (`getThumbUrl` default).
- Backdrops/art request **≤ 1920 × 1080** (`getArtUrl` default).
- Browse grid keeps **< 40 visible poster nodes** (row recycling).

Same-URL = same HTTP cache entry. Mutations (e.g. art change on the server)
flow through naturally on the next fetch because Plex updates the URL.

### 1.6 In-memory vs `localStorage` — when to use which

| Use case                                       | Store                          |
|------------------------------------------------|--------------------------------|
| Plex API responses (metadata, children, hubs)  | In-memory (`core/cache.js`)    |
| Auth token, clientId, Plex Home selection      | `localStorage` (`core/storage.js`) |
| User preferences (network, playback)           | `localStorage`                 |
| Anything bigger than ~10 KB or tied to a session | In-memory only — never spill blob data into `localStorage` (TV storage is slow and per-app quota is small) |

---

## 2. Buffering (playback)

### 2.1 Player element

Single `<video id="native-player">` per the LG single-video rule. Element
attributes in `index.html` and re-enforced in `playerAdapter.init()`:

```html
<video id="native-player"
       class="native-player hidden"
       playsinline
       webkit-playsinline
       preload="metadata"></video>
```

- `playsinline` / `webkit-playsinline` — keep inline; never trigger a
  fullscreen-fallback flow (no PiP on TV).
- `preload="metadata"` — fetch manifest + first segment only. **Do not use
  `preload="auto"`** on webOS 5; it grows decoder memory before the user
  presses Play.
- **No `crossorigin` attribute.** Plex tokenises requests via query string
  and CORS preflights have caused HLS init failures on some LG firmwares.
- **No `muted`/`autoplay`** — we drive `play()` explicitly; TV browsers do
  not enforce autoplay-with-sound restrictions, so no benefit from muting.

### 2.2 Buffer-ahead target

The Plex transcode and progressive HTTP paths both rely on the **native LG
media engine** to manage buffer-ahead. We do not run a JS-side HLS engine
(hls.js is too heavy for webOS 5 and the LG decoder consumes `.m3u8`
natively). Buffer-ahead therefore follows LG defaults:

| Mode               | Stream                                         | Expected buffer-ahead |
|--------------------|------------------------------------------------|-----------------------|
| Direct Play        | Progressive HTTP MP4/MKV part                  | LG default (~10 s ahead, ~5 s behind) |
| Direct Stream      | Progressive HTTP MP4 muxed by Plex             | LG default            |
| Transcode (HLS)    | Plex universal `start.m3u8`                    | LG ABR engine, segment-driven (segments are 6 s in Plex HLS) |
| Transcode (HTTP)   | Plex universal `start` (progressive)           | LG default            |

We tune via the upstream side instead of the player: `fastSeek=1` and bitrate
profile (`X-Plex-Client-Profile-Extra`) in
`src/playback/hlsPolicy.js` / `src/playback/sessionController.js`.

### 2.3 Buffering UI

`waiting` / `stalled` events surface the shared overlay (`showBuffering()` in
`src/ui/loadingOverlay.js`); `playing` / `canplay` / `canplaythrough` hide
it. Hooked in `playerAdapter.notifyBuffering()`.

### 2.4 Re-buffer watchdog (timeout → fallback)

Implementation: `REBUFFER_TIMEOUT_MS = 12000` in
`src/playback/playerAdapter.js`. While the player is in the buffering state,
a timer counts down; if it elapses without a `playing`/`canplay`, the adapter
calls the registered `onRebufferTimeout` handler.

Player-screen reaction (`src/ui/screens/playerScreen.js`):

1. If the session is on **HLS or Direct Play** and HTTP transcode has not yet
   been tried, switch to HTTP progressive transcode via
   `retryTranscode('http', currentTime)` (forces `directPlay=0`,
   `directStream=0`, `protocol=http` — see
   [LG HLS troubleshooting FAQ](https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting)).
2. If already on HTTP transcode, surface a "check network or lower quality
   in Settings" message and leave the player so the user can drop the
   quality profile.

The watchdog is cleared on `pause()` (intentional stop), `stop()`, and on
buffering-end. `rebufferFired` resets when buffering clears so a second
stall in the same session can trigger fallback again; each stall still
fires at most once until playback recovers.

### 2.5 Stop & cleanup (free the decoder)

`playerAdapter.stop()` runs the LG-recommended teardown order:

1. `videoEl.pause()`
2. `videoEl.removeAttribute('src')`
3. `videoEl.load()`

Doing `load()` **after** clearing `src` is required to release the native
decoder; otherwise the next `play()` may silently fail. The element is then
re-hidden (`.hidden`) but never removed — single-element rule.

### 2.6 Plex transcoder parameters

Set in `src/playback/sessionController.js`:

- `directPlay` / `directStream` — `'1'` unless `forceTranscode` (probe failed)
  or the user disabled them.
- `fastSeek=1` — enables seek-without-full-restart on transcoded streams.
- `offset` — resume offset in ms.
- `videoStartIndex` (when present on the session) — start at a given stream.
- `X-Plex-Client-Profile-Extra` — on **Plex for LG** only, augments the TV
  profile with `videoCodec=h264&audioCodec=aac` for HLS (see `hlsPolicy.js`).
  Omitted for Plex Web / simulator so PMS uses the built-in Chrome profile.

### 2.7 Next-episode pre-buffer policy

**No pre-buffer of the next episode.** Reason: webOS 5 memory budget is tight,
the LG single-video rule disallows a second decoder instance, and pre-warming
a second HLS manifest still costs allocations even if no decoder is bound.
Autoplay (when implemented) resolves the next stream URL **after `ended`**,
calls `stop()` to free the decoder, then `play(nextUrl, ...)`. The "Next up"
chip in `playbackQueue.js` is metadata-only.

---

## 3. References

- LG HLS troubleshooting FAQ — <https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting>
- webOS TV streaming spec — <https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm>
- Performance budgets — `docs/perf-budgets.md`
- Spec compliance — `docs/webos-tv-spec-compliance.md`
