# webOS TV Platform Specification Compliance

Minimum supported platform: **webOS TV 4.0** (2018 LG OLED B8). Co-primary engineering targets: **webOS TV 4.0** (Chromium ~53) and **webOS TV 5.0** (Chromium 68, 2020).  
Official references: [Platform specifications](https://webostv.developer.lge.com/develop/specifications)

This document maps LG requirements to Plax implementation.

## 1. App Resolution

Source: [Supported App Resolution](https://webostv.developer.lge.com/develop/specifications/app-resolution)

| Requirement | Implementation |
|-------------|----------------|
| Default graphics resolution 1920×1080 (UHD) | `appinfo.json` → `"resolution": "1920x1080"` |
| Use `window.innerWidth` / `innerHeight` for UI layout | `src/platform/deviceDisplay.js` |
| Use `deviceInfo.screenWidth` / `screenHeight` for video capability | `src/platform/webos.js` via webOSTV.js |
| FHD models may use 1280×720 graphics package | Optional second IPK (Seller Lounge); not bundled in MVP |
| Graphics vs video resolution | UI uses 1920×1080 graphics; 4K video playback uses full panel via native player (`deviceInfo.screenWidth/Height`) |
| Direct Play bitrate limits | `lgBitrateLimits.js` + detail-screen warning when file exceeds LG Mbps cap |

## 2. Web API and Web Engine

Source: [Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine)

| webOS TV | Chromium (approx.) | Plax |
|----------|-------------------|------------|
| 4.0 | ~53 | **Co-primary target** — Babel `chrome 53`; CSS and JS polyfilled for Chromium 53 |
| 5.0 | 68 | **Co-primary target** — full spec alignment |
| 6.0+ | 79+ | Supported |

- Bundle targets Chromium 53+ (Babel transpile target `chrome 53`, not `chrome 68`).
- Include [webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-introduction) for Luna Service, back key, and `deviceInfo`.
- Enforce `versionMajor >= 4` on device before app start (`src/platform/versionGate.js`).

## 2a. Chrome 53 Compatibility (webOS TV 4.0)

webOS 4 ships Chromium ~53 (released 2016). Several JS and CSS APIs available on Chrome 68 are absent and require polyfills or workarounds.

### JavaScript gaps and mitigations

| API | Chrome introduced | Mitigation |
|-----|-------------------|------------|
| `String.prototype.padEnd` / `padStart` | Chrome 57 | Polyfilled in `src/core/stringPolyfills.js` |
| `addEventListener({ once: true })` | Chrome 55 | Replaced with `addOnceEventListener` helper in `src/utils/domUtils.js` |
| `AbortController` / `AbortSignal` | Chrome 66 | Polyfilled in `src/core/abortControllerPolyfill.js` |
| `Promise.prototype.finally` | Chrome 63 | Polyfilled in `src/core/promiseFinallyPolyfill.js` |

Babel transpile target is set to `chrome 53` so class syntax, arrow functions, template literals, destructuring, spread, and `async`/`await` are all downlevelled.

### CSS gaps and mitigations

| CSS feature | Chrome introduced | Mitigation in `app.css` |
|-------------|-------------------|-------------------------|
| `flex gap:` | Chrome 84 | Replaced with `> * + *` margin rules |
| `display: grid` + `gap` | Chrome 66 (gap in grid 66) | Converted to `display: flex` equivalents |
| `grid-template-columns: repeat(var())` | Chrome 57 | Removed; profile picker now uses flex + negative-margin gutters |
| CSS `min()` / `max()` / `clamp()` | Chrome 79 | Replaced with static pixel values |
| `aspect-ratio:` | Chrome 88 | Replaced with `padding-bottom: 150%` trick for 2:3 posters; explicit `height` elsewhere |
| `inset:` shorthand | Chrome 87 | Replaced with explicit `top / right / bottom / left: 0` |
| `overscroll-behavior:` | Chrome 63 | Removed (no functional substitute on Chrome 53) |
| `scroll-padding-inline` | Chrome 69 | Replaced with `scroll-padding-left` / `scroll-padding-right` |
| `justify-self:` in flex | Chrome 57 | Removed; transport center uses explicit `margin-left: auto / margin-right: auto` |

## 3. TLS and Root Certificates

Source: [TLS and Root Certificates](https://webostv.developer.lge.com/develop/specifications/tls)

| Requirement | Implementation |
|-------------|----------------|
| HTTPS for Plex.tv and remote PMS | Default `fetch` / video over TLS |
| TLS 1.2+ | Platform-provided; webOS 5 adds TLS 1.3 |
| User LAN insecure HTTP (optional) | Settings toggle; documented trade-off for 4K LAN |

## 4. Streaming Protocol and DRM

Source: [Streaming Protocol and DRM](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)

| Protocol | Use in Plax |
|----------|-------------------|
| **HLS** | Plex server transcode / universal start (`.m3u8`) — primary adaptive path; see [HLS FAQ](https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting) |
| **Progressive HTTP** | Plex Direct Play (MP4/MKV parts) |
| **DASH** | Not used (Plex TV path is HLS-centric) |
| **Smooth Streaming** | Not used (LG discourages) |
| **Widevine / PlayReady** | Not required for Plex client streams; Plex handles DRM at server |

## 5. Video and Audio Format (webOS TV 5.0)

Source: [Audio and Video Format on webOS TV 5.0](https://webostv.developer.lge.com/develop/specifications/video-audio-50)

| Capability | Direct play expectation |
|------------|-------------------------|
| H.264 (AVC) | Yes — containers `.mp4`, `.mkv`, `.ts` |
| HEVC (H.265) | Yes on UHD models — 4K up to spec bitrates |
| AC-3 / E-AC-3 | Yes in supported containers |
| DTS | Model-dependent — probe + transcode fallback |
| SRT subtitles | Via Plex transcode / burn-in |
| PGS / VOBSUB | **Not supported** — filtered in `subtitleTracks.js` |

Pre-play probe: `src/playback/capabilityProbe.js` + `src/playback/lgBitrateLimits.js`.

### Maximum decode bitrates (webOS TV 5.0)

| Tier | Codec | Max bitrate |
|------|-------|-------------|
| FHD | H.264 / HEVC 1080p60 | 40 Mbps |
| UHD | H.264 4K30 | 50 Mbps |
| UHD | HEVC 4K60 | 60 Mbps |

Files above these limits show a **Direct Play not available** notice and play via server transcode.

## 4b. HLS troubleshooting (LG FAQ)

Source: [HTTP Live Streaming Troubleshooting](https://webostv.developer.lge.com/faq/2014-10-30-http-live-streaming-troubleshooting)

| Issue | Mitigation in Plax |
|-------|--------------------------|
| Audio-only variants in master playlist without `CODECS` | `applyWebOsHlsTranscodeParams()` in `hlsPolicy.js` |
| Multiple audio codecs in audio-only `CODECS` | Server-side Plex transcode to AAC/H.264 |
| HLS 502 errors | Surfaced as network error; check Plex server |
| Buffering on a variant | Shared loading overlay during `waiting` / `stalled` |
| HLS playback failure | Auto-fallback to HTTP transcode (`protocol=http`) |

## 6. appinfo.json

Source: [appinfo.json reference](https://webostv.developer.lge.com/develop/references/appinfo-json)

Required fields present: `id`, `version`, `vendor`, `type`, `main`, `title`, `icon`.  
TV-recommended: `largeIcon`, `resolution`, `bgColor`, `splashBackground`, `disableBackHistoryAPI`, `handlesRelaunch`.

## 7. TV Platform Behaviors

| LG guidance | Implementation |
|-------------|----------------|
| Single `<video>` element | One `#native-player`; stop before reuse |
| Magic Remote + D-pad | `src/ui/focus.js` focus rings and grid navigation |
| Back key (461) | `webOS.platformBack.onBackKey` → router `back()`; entry routes call `exitToLauncher()` (`platformBack`) |
| App relaunch | `handlesRelaunch: true` + `webOSRelaunch` → `webOSSystem.activate()` / `PalmSystem.activate()` |
| Screen keep-alive during playback | `luna://com.webos.service.tvpower` keepAlive |
| Do not rely on setting `Accept-Language` | Not used (webOS 5 limitation) |
| Splash while app loads | `#splash-screen` + `src/ui/splash.js` |
| Buffering indicator | Same `.plax-loader` in splash and `#loading-overlay` |
| In-app caching + video buffer policy | [`docs/caching-and-buffering.md`](caching-and-buffering.md) (LRU TTL cache in `src/core/cache.js`, re-buffer watchdog in `src/playback/playerAdapter.js`) |
| Skip intro (Plex markers) | `Marker` with `type=intro` from PMS metadata; seek via `video.currentTime`; Channel Up (33) / Yellow (32) |

## 8. Packaging

Source: [CLI Developer Guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide)

- Package with `ares-package` from `dist/` (contains `appinfo.json`, `index.html`, `app.js`, `app.css`, `webOSTV.js`, assets).
- Install via Developer Mode / `ares-install`.

## 9. Plex as metadata source

Plax uses **Plex Media Server and plex.tv APIs only** for libraries, hubs, artwork, and playback. There is no separate TMDB or public metadata client.

| Concern | Implementation |
|---------|----------------|
| Metadata | `GET /library/metadata/{id}` with `includeChildren` / `includeExtras`; genres, roles, collections, Media/Part/Stream parsed in `src/plex/library.js` |
| Posters / backgrounds | PMS image transcode URLs via `getThumbUrl` / `getArtUrl` (`src/plex/client.js`) with server token |
| Home rows | Hub discovery: `GET /hubs/promoted` (fallback `GET /hubs`), item load via each hub `key` (`src/plex/library.js`, `src/plex/recommendations/homeFeed.js`). Legacy fallbacks: `/hubs/continueWatching`, `/hubs/home/recentlyAdded?type=`, `/hubs/home/onDeck`. Detail related: `GET /hubs/metadata/{id}/related`. Section hubs available via `GET /hubs/sections/{sectionId}` (API ready; library grid unchanged). |
| Search | `GET /hubs/search?query=…&limit=…` returns multi-type hubs (Movies, Shows, Episodes; People skipped for MVP). Section-scoped fallback via `GET /library/sections/{id}/search?type=…&query=…` when an active library is selected. Results cached briefly (`search` namespace, 30 s TTL) and rendered as hub rows in `src/ui/screens/searchScreen.js`. Magic Remote Search key (84) opens the screen from any non-player screen (`src/core/router.js`). |
| Watch status | `POST /:/timeline` (`state`: playing / paused / stopped, `time` in ms, `duration`); `PUT /:/scrobble` and `PUT /:/unscrobble` with `identifier=com.plexapp.plugins.library` (`src/plex/library.js`, `src/playback/playerAdapter.js`, detail mark buttons). Metadata exposes `viewOffset`, `viewCount`. |
| Library refresh | Section scan via `GET /library/sections/{sectionId}/refresh` (optional `?force=1`) and per-item refresh via `PUT /library/metadata/{ratingKey}/refresh` (`refreshSection` / `refreshItem` in `src/plex/library.js`). Library screen exposes a focusable **Scan for new media** sidebar action that reloads the grid ~5s after the request; detail screen's **Refresh metadata** button triggers a server-side refresh and re-fetches metadata ~3s later. 401 / 403 (restricted Plex Home users) / 5xx surface as friendly status messages; hubs cache is invalidated so Recently Added reflects the new scan. |
| Playback | Universal transcode + Direct Play; `X-Plex-Product`, client identifier, session, offset on transcode URLs |
| Errors | `PlexApiError` for PMS 401 / 404 / 502+ on metadata and watch actions (`src/plex/client.js`) |

References: [plexapi.dev](https://plexapi.dev), [PMS developer docs](https://developer.plex.tv/pms/).

## Validation

```bash
npm run build
npm run validate
```

`validate-compat.cjs` checks bundle targets, `appinfo.json` resolution, webOSTV.js presence, and HLS playback path.
