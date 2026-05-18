# XPlay Lite

Ultra-lightweight Plex client for **LG webOS TV 5.0+** Smart TVs. Playback-first design aligned with [LG platform specifications](https://webostv.developer.lge.com/develop/specifications).

## Platform requirements

- **Minimum: webOS TV 5.0** (2020, Chromium 68)
- webOS TV 6.0+ and current models fully supported
- webOS TV 4.x and earlier are **not** supported (blocked at launch)

## Features

- Plex account sign-in via QR / PIN (`plex.tv/link`)
- Movies and TV show libraries with side navigation
- Direct Play and Direct Stream with HLS transcode fallback (per LG streaming spec)
- Custom quality profiles and version selection
- Audio / SRT subtitle track selection with subtitle timing offset
- Plex Home user switching (Plex Pass)
- Shared and remote Plex Media Server support
- Secure / insecure connection policy for LAN 4K
- Home screen: dynamic rows from Plex promoted hubs (`/hubs/promoted`, per-hub `key` fetch); related rows on detail via `/hubs/metadata/{id}/related`
- Search: multi-type Plex search via `/hubs/search` (Movies, Shows, Episodes) with a section-scoped fallback when a library is active; opens from the top nav or the Magic Remote Search key (84); debounced input (~350 ms) with brief in-memory result cache
- Watch status: timeline sync during playback, scrobble near completion, mark watched / unwatched on detail; badges and progress on cards
- Library refresh: **Scan for new media** in the library sidebar triggers a server-side section scan (`GET /library/sections/{id}/refresh`); detail-screen **Refresh metadata** triggers `PUT /library/metadata/{ratingKey}/refresh` and re-fetches metadata after a short delay. Permission errors (e.g. restricted Plex Home users) are surfaced inline.
- Skip intro: uses Plex-detected `Marker` tags (`type=intro`, `startTimeOffset`/`endTimeOffset` ms) from `GET /library/metadata/{id}`; on-screen button, Channel Up / Yellow remote keys, optional auto-skip after 2.5s in intro (no client PUT to PMS)
- All artwork and metadata from Plex Media Server (no external TMDB lookups)
- Native HTML5 video (LG media engine) — single video element per platform rules
- [webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-introduction) integration (back key, deviceInfo, Luna services)

## Requirements

- Node.js 18+
- [webOS TV SDK](https://webostv.developer.lge.com/develop/sdk/installation/) for device deploy (`ares-package`, `ares-install`)

## Build

```bash
cd "XPlay 2"
npm install
npm run build
npm run validate
```

Output is in `dist/` (includes `webOSTV.js`, `appinfo.json` with `resolution: 1920x1080`).

## Testing and validation

The project currently uses build-time and static validation checks (no unit test suite yet):

- `npm run build` bundles the app and copies required runtime assets to `dist/`.
- `npm run validate` runs spec and packaging sanity checks from `scripts/validate-compat.cjs`, including:
  - bundle size budget
  - required `appinfo.json` fields and TV resolution
  - webOS integration checks (`webOSTV.js`, single `<video>`, splash/loading elements)
  - Plex-specific playback/auth integration signals
  - icon presence and minimum dimensions

Quick local verification:

```bash
npm run build && npm run validate
```

## Simulator testing (webOS TV)

Based on LG's [Simulator Developer Guide](https://webostv.developer.lge.com/develop/tools/simulator-dev-guide), launch from the app root that contains `appinfo.json` (`dist/` in this project):

```bash
cd "XPlay 2"
npm run sim:23     # default simulator target
```

Other versions:

```bash
npm run sim:5
npm run sim:6
npm run sim:22
npm run sim:24
```

Manual launch command:

```bash
ares-launch -s 23 ./dist
```

Tips:
- Keep one simulator run open and use `npm run sim:watch` in another terminal to rebuild quickly.
- The simulator can auto-reload app file changes; if not, relaunch with `npm run sim:launch`.
- If `ares-launch` is missing: `npm run install:cli`.

## Install on TV

```bash
npm run package   # creates IPK in build/ (needs ares-package)
ares-install --device my-tv build/*.ipk
```

For browser dev, serve `dist/` over HTTP (version gate skipped outside TV runtime).

## Documentation

- [webOS TV spec compliance](docs/webos-tv-spec-compliance.md) — mapping to LG specification pages
- [Compatibility matrix](docs/compatibility-matrix.md)
- [Performance budgets](docs/perf-budgets.md)
- [Caching and buffering rules](docs/caching-and-buffering.md) — namespace TTLs and re-buffer fallback policy
- [Resource monitor playbook](docs/resource-monitor-playbook.md) — repeatable CPU/memory profiling workflow for simulator/device

## Project layout

- `src/core/` — app bootstrap, router, store
- `src/platform/` — webOSTV.js wrappers, version gate, display metrics
- `src/plex/` — Plex API (auth, servers, library, hubs); metadata and images from PMS only
- `src/playback/` — player adapter, sessions, quality
- `src/ui/` — TV-focused screens and components

## Known limitations

- No automated unit/integration test harness yet; quality checks are currently static validation plus simulator/device smoke testing.
- Older LG webOS TV versions below 5.0 are intentionally unsupported.
- Some subtitle formats and playback edge cases depend on LG media engine constraints.
- Full details: [docs/compatibility-matrix.md](docs/compatibility-matrix.md).
