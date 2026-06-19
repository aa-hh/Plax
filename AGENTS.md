# AGENTS.md — Plax (XPlay 2)

## Purpose

Plax is an ultra-lightweight **Plex client for LG webOS TVs** (4.0+, B8 2018 and
newer). This file is the entry point for agents working anywhere in the repo: it
covers the platform constraints, build/deploy flow, and points to per-module
`AGENTS.md` files and the `docs/` deep-dives. User-facing feature list lives in
[README.md](README.md) — read that for behaviour, this for orientation.

*Keep this file up to date when:* the build/deploy commands change, a new top-level
`src/` module appears, or a platform constraint (target Chromium / polyfills)
shifts.

## ⚠️ Platform constraints (read before writing any code)

- **Vanilla ES6 + Rollup, no framework.** Source is plain JS modules bundled to a
  single IIFE `dist/app.js` (`build/rollup.config.js`).
- **Target is Chromium 53 (webOS 4 / B8).** Babel transpiles, but **do not use**
  ES2020+ runtime APIs. `async/await` and `class` are transpiled, but prefer the
  surrounding code's `var` + function style. No optional chaining at runtime
  assumptions, no `Promise.finally`, `AbortController`, or modern `String`
  methods without the polyfills in [src/core/](src/core/AGENTS.md).
- **Primary test target is webOS 5+** (Chromium 68). Many UX niceties (focus
  motion) are gated to webOS 5+ — see [src/platform/](src/platform/AGENTS.md).
- **Single `<video>` element per LG spec.** Defined in `index.html`.
- Known platform gotchas (IndexedDB hangs on webOS4, no CSS `:focus-within` on
  Chrome53, deploy staleness on the B8) are captured in agent memory — search
  themes `webos4-indexeddb-wedged`, `webos4-focus-within-dropped`,
  `xplay-deploy-to-b8` before debugging those areas.

## Build & deploy

| Command | Does |
|---|---|
| `npm run build` | Rollup bundle → `dist/` (+ assets, `webOSTV.js`, `appinfo.json`) |
| `npm run validate` | Static spec/packaging checks (`scripts/validate-*`) |
| `npm run sim` / `sim:5` … | Build + launch a webOS simulator (see README) |
| `npm run package` | Build + create IPK in `build/` (needs `ares-package`) |
| `ares-install --device my-tv build/*.ipk` | Deploy to a real TV |

Deploying to the B8 needs package + `ares-install` — a build alone does not reach
the TV. See memory `xplay-deploy-to-b8` and `tvpush.sh`.

## Top-level layout

| Path | What |
|---|---|
| `src/` | Application source (see module table below) |
| `build/` | Rollup config + IPK packaging output |
| `scripts/` | Deploy, validation, log-receiver, transcode-probe tooling |
| `docs/` | Architecture & design deep-dives (linked from modules) |
| `dist/` | Build output (generated — do not edit) |
| `assets/` | Source icons / static media |

## Module map (per-folder AGENTS.md)

| Module | Owns | Doc |
|---|---|---|
| `src/core/` | Bootstrap, router (screen-retention stack), store, caching, polyfills | [AGENTS](src/core/AGENTS.md) |
| `src/playback/` | Player adapter, quality/transcode decision, HLS, capabilities, tracks | [AGENTS](src/playback/AGENTS.md) |
| `src/plex/` | Plex API: client, library/hubs, search, auth, server discovery | [AGENTS](src/plex/AGENTS.md) |
| `src/ui/` | D-pad focus engine, poster images, modals, components | [AGENTS](src/ui/AGENTS.md) |
| `src/ui/screens/` | Per-route screens (player, detail, home, library, settings…) | [AGENTS](src/ui/screens/AGENTS.md) |
| `src/platform/` | webOSTV.js wrappers, version gates, motion cursor | [AGENTS](src/platform/AGENTS.md) |
| `src/styles/` | Single `app.css`, Material 3 blue token system | [AGENTS](src/styles/AGENTS.md) |
| `src/settings/` | Playback/network preference stores | [AGENTS](src/settings/AGENTS.md) |
| `src/utils/` | Fetch wrapper, remote logging, XML/QR/DOM helpers | [AGENTS](src/utils/AGENTS.md) |

Smaller folders without their own AGENTS.md: `src/perf/` (resource monitor + perf
HUD), `src/security/` (Plex Home child-user library access), `src/watchlists/`
(bookmark store/resolve).

## Key docs

- [docs/compatibility-matrix.md](docs/compatibility-matrix.md) — codec/bitrate by webOS major
- [docs/webos-tv-spec-compliance.md](docs/webos-tv-spec-compliance.md) — LG spec mapping
- [docs/design-system.md](docs/design-system.md) — 10-foot UX + component specs
- [docs/caching-and-buffering.md](docs/caching-and-buffering.md) — cache TTLs + rebuffer policy
- [docs/screen-review-playbook.md](docs/screen-review-playbook.md) — route-by-route QA checklist
- [docs/perf-budgets.md](docs/perf-budgets.md) — bundle/frame/memory budgets
