# Plax

Ultra-lightweight Plex client for **LG webOS TV 4.0+** Smart TVs (including 2018 OLED B8). Playback-first design aligned with [LG platform specifications](https://webostv.developer.lge.com/develop/specifications).

## Platform requirements

- **Minimum: webOS TV 4.0** (2018 LG OLED B8 and newer)
- **Primary test target: webOS TV 5.0+** (2020, Chromium 68)
- webOS TV 6.0+ and current models fully supported
- webOS TV 3.x and earlier are **not** supported (blocked at launch)

## Features

- Plex account sign-in via QR / PIN (`plex.tv/link`)
- Movies and TV show libraries with side navigation
- **Direct play** (original Plex file, progressive URL, zero server transcode) when the TV supports container/codecs/bitrate
- **Auto** quality: direct play → HLS direct stream (remux) → transcode fallbacks (per LG streaming spec)
- **Direct play only** / **Original** quality: never auto-fallback to remux or transcode
- Transcode presets (4K / 1080p / 720p / 480p) for capped server transcode
- Custom quality profiles and version selection
- Audio / SRT subtitle track selection with subtitle timing offset
- Plex Home user switching (Plex Pass)
- Shared and remote Plex Media Server support
- Secure / insecure connection policy for LAN 4K
- Home screen: dynamic rows from Plex promoted hubs (`/hubs/promoted`, per-hub `key` fetch); related rows on detail via `/hubs/metadata/{id}/related`
- Search: multi-type Plex search via `/hubs/search` (Movies, Shows, Episodes) with a section-scoped fallback when a library is active; opens from the top nav or the Magic Remote Search key (84); debounced input (~350 ms) with brief in-memory result cache
- Watch status: timeline sync during playback, scrobble near completion, mark watched / unwatched on detail; badges and progress on cards
- Library refresh: **Scan for new media** in the library sidebar triggers a server-side section scan (`GET /library/sections/{id}/refresh`); detail-screen **Refresh metadata** triggers `PUT /library/metadata/{ratingKey}/refresh` and re-fetches metadata after a short delay. Permission errors (e.g. restricted Plex Home users) are surfaced inline.
- Skip intro / skip credits: Plex-detected `Marker` tags (`type=intro` or `type=credit`, `startTimeOffset`/`endTimeOffset` ms) from `GET /library/metadata/{id}`; standalone on-screen prompt during each segment (OK to confirm, Channel Up / Yellow); per-marker skip state; no client PUT to PMS
- All artwork and metadata from Plex Media Server (no external TMDB lookups)
- Native HTML5 video (LG media engine) — single video element per platform rules
- [webOSTV.js](https://webostv.developer.lge.com/develop/references/webostvjs-introduction) integration (back key, deviceInfo, Luna services)

## Requirements

- Node.js 18+
- [webOS TV SDK](https://webostv.developer.lge.com/develop/sdk/installation/) for device deploy (`ares-package`, `ares-install`)

## Build

```bash
cd "Plax"
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

Based on LG's [Simulator Developer Guide](https://webostv.developer.lge.com/develop/tools/simulator-dev-guide).

### One-time setup

Download a webOS TV Simulator (one `.dmg`/`.exe` per webOS version) from:
[Simulator installation](https://webostv.developer.lge.com/develop/tools/simulator-installation)

On macOS, install the simulator from LG’s `.dmg` (often creates a folder under `/Applications`, e.g. `webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app`). `npm run sim` auto-detects either layout.

(Optional — only needed to install on a real TV, not for simulator testing: install LG's actively maintained CLI [`@webos-tools/cli`](https://github.com/webos-tools/cli):
```bash
# If you previously installed the deprecated package, remove it first:
npm uninstall -g @webosose/ares-cli
npm install -g @webos-tools/cli
```
)

### Launching

| Command | What it does |
|--------|----------------|
| `npm run sim` | `npm run build` then launch (recommended) |
| `npm run sim:launch` | Launch only — run `npm run build` first |
| `npm run sim:26` (etc.) | Build + launch a specific webOS TV version |

There is no `npm sim-launch` script; use `npm run sim:launch`.

```bash
npm run sim        # build + auto-detect newest installed simulator
```

Pin to a specific webOS version (must be installed):

```bash
npm run sim:5
npm run sim:6
npm run sim:22
npm run sim:23
npm run sim:24
npm run sim:26
```

Point at a simulator `.app` or its install folder (both work):

```bash
WEBOS_SIM_PATH="/Applications/webOS_TV_26_Simulator_1.5.0" npm run sim
# or the .app inside that folder:
WEBOS_SIM_PATH="/Applications/webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app" npm run sim
```

You can also open the Simulator manually and use **File → Launch App** on the `dist/` folder (the directory that contains `appinfo.json`) after `npm run build`.

Tips:
- Each `npm run build` writes `dist/.plax-build-stamp.json` with a **change summary** (files/areas touched since the last build). `npm run sim` / `npm run sim:launch` print that summary once before launch (not duplicated during `npm run build`).
- **Verify you are on the latest bundle:** open devtools and check `window.__PLAX_BUILD__` (also logged at boot as `[Plax] build …`). `builtAt` / `gitCommit` should match the stamp printed by `npm run sim`. If `build-info missing` appears, the simulator is serving an old folder — remove the home-screen icon, reset the simulator DB, and run `npm run sim` again.
- `npm run sim:watch` only rebuilds `dist/`; the simulator does **not** pick up changes until you re-run `npm run sim` or use **File → Launch App** on `dist/` again. Saving files may auto-reload only if that exact folder is already the launched app.
- If you still see the old **Who’s watching?** screen, remove the Plax icon from the simulator home screen (right-click → Remove), then **Action → Database Reset**, and run `npm run sim` again. Do not launch from an old home-screen icon after renaming the project folder.
- `npm run sim:launch` skips the rebuild step — run `npm run build` first so `dist/` is current.

**HLS / remux in the simulator:** Plax uses the same native `<video>` + Plex `start.m3u8` path as on a TV (no hls.js). If playback fails, open devtools **Network** and check the `start.m3u8` request first — **HTTP 400/502 from Plex is a server/URL issue**, not “simulator lacks HLS.” A `MediaError` “Stream not supported (check HLS playlist CODECS)” often appears when the manifest never loaded. After a successful manifest, the simulator’s Chromium stack can still differ from a real LG TV’s native HLS decoder — confirm remux/HLS on hardware when in doubt.

## Install on TV

```bash
./tvpush.sh          # build → package → install → force-quit → relaunch on Alec-TV
./tvpush.sh -n       # install only (skip relaunch)
./tvpush.sh -s       # skip build/package, install existing IPK
./tvpush.sh -d <device>  # target a different ares device
```

`npm run build` alone never reaches the TV — the script runs the full pipeline.
App ID is `com.plax`. See memory `xplay-deploy-to-b8` for device setup and IP
troubleshooting (`ares-setup-device --list` / `--modify Alec-TV`).

For browser dev, serve `dist/` over HTTP (version gate skipped outside TV runtime).

## Documentation

- [webOS TV spec compliance](docs/webos-tv-spec-compliance.md) — mapping to LG specification pages
- [Compatibility matrix](docs/compatibility-matrix.md)
- [TV design system](docs/design-system.md) — core principles, component specs, and real UX examples for consistent screens
- [Screen review playbook](docs/screen-review-playbook.md) — route-by-route simulator checklist to visually QA every screen
- [Performance budgets](docs/perf-budgets.md)
- [Caching and buffering rules](docs/caching-and-buffering.md) — namespace TTLs and re-buffer fallback policy
- [Resource monitor playbook](docs/resource-monitor-playbook.md) — repeatable CPU/memory profiling workflow for simulator/device

## Project layout

Each module below has an `AGENTS.md` with deeper, agent-oriented context; the
repo-root [AGENTS.md](AGENTS.md) is the index and lists the platform constraints.

- `src/core/` — app bootstrap, router (screen-retention stack), store, caching, Chrome53 polyfills
- `src/platform/` — webOSTV.js wrappers, version gate, motion cursor, display metrics
- `src/plex/` — Plex API (client, auth, servers, library, hubs, search); metadata and images from PMS only
- `src/playback/` — player adapter, sessions, quality/transcode decision, HLS, capabilities, audio/subtitle tracks
- `src/ui/` — D-pad focus engine, poster images, modals; `screens/` (per route) and `components/`
- `src/styles/` — single `app.css` (Material 3 blue token system)
- `src/settings/` — playback/network preference stores (localStorage)
- `src/utils/` — fetch wrapper, remote logging (`tvDebug`), XML/QR/DOM helpers
- `src/perf/`, `src/security/`, `src/watchlists/` — resource monitor, Plex Home access control, watchlist store

## Known limitations

- No automated unit/integration test harness yet; quality checks are currently static validation plus simulator/device smoke testing.
- webOS 4 TVs (e.g. B8) use an older Chromium than webOS 5; prefer **Auto** quality for DTS or borderline codecs (see [compatibility matrix](docs/compatibility-matrix.md)).
- Some subtitle formats and playback edge cases depend on LG media engine constraints.
- Full details: [docs/compatibility-matrix.md](docs/compatibility-matrix.md).
