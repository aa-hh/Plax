# AGENTS.md — src/platform

## Purpose

Isolates everything LG/webOS-specific so the rest of the app stays
platform-agnostic: the webOSTV.js wrappers, version gating, Magic Remote motion
cursor, and display metrics. This is where cross-version behaviour is decided.

*Keep this file up to date when:* the minimum webOS version changes, a feature
gate is added, the motion/exit behaviour changes, or the device/runtime detection
chain changes.

## Notable Patterns

- **Version gating is centralized.** `versionGate.js` exposes
  `MIN_WEBOS_TV_MAJOR`, `checkMinimumWebOS`, `runVersionGate`, `isTvRuntime`.
  webOS 3.x and earlier are blocked at launch. Gate new version-specific behaviour
  here rather than scattering UA checks.
- **Focus motion is webOS5+/dev only.** `motionCursor.js` returns a no-op on real
  webOS4 TVs (`getWebOSVersion() === 'tv' && !isSimulatorRuntime()` short-circuit).
  Enabling motion on webOS4 caused card/pill/menu clipping and sidebar jank —
  memories `caps-motion-gate-bug` and `tv-ui-overhaul`. Don't loosen this gate.
- **App exit = long-press Back.** Quit is a 700ms long-press of Back/Exit
  (global); there is no exit-confirm modal (Google TV prohibits it). Memory
  `exit-longpress-back`.
- **Simulator vs real TV differ.** `webosRuntime.js` distinguishes them; timing
  and HLS decoder behaviour are not identical — confirm playback on hardware.
- **The `webOS` global is load-bearing and the detection FAILS SILENTLY without it.**
  `webOS` comes from `webOSTV.js` (the `webostvjs` dependency), loaded via a
  `<script>` in `index.html` and copied into `dist` by `build/rollup.config.js`.
  If it's absent (dep undeclared/pruned, or the copy skipped), `webOS` is undefined
  and `getWebOSVersion()` falls through its `PalmSystem` branch and returns
  `'simulator'` **on a real TV** → `isSimulatorRuntime()` true →
  `getPlexClientIdentity()` (src/plex/clientIdentity.js) returns the *browser*
  identity (Plex Web / Chrome / model=Browser) → `isWebOs4Tv()` false → webOS4
  transcode/remux is mis-delivered as native HLS → `networkState:3` stall (the
  "embedded SRT stuck on Buffering" bug). When editing `getWebOSVersion()` /
  `isSimulatorRuntime()`, do NOT make the no-`webOS` path silently assume simulator;
  a missing dependency must surface, not degrade. Guard: `scripts/package-ipk.cjs`
  refuses to package without `webOSTV.js`; regression tests in
  `test/package-assets.test.js`. Memory `webostvjs-missing-dep-misdetect`.

## Key Files

| File | Role |
|---|---|
| `webos.js` | webOSTV.js wrappers: back key, keep-screen-on, Luna services, deviceInfo, exit |
| `versionGate.js` | Minimum-version check + feature gating entry points |
| `motionCursor.js` | Magic Remote motion → pointer/focus animation (gated) |
| `motionCursorState.js` | Motion cursor show/hide state machine |
| `webosRuntime.js` | webOS version query + simulator detection |
| `deviceDisplay.js` | Display metrics (resolution, pixel ratio) |

## Related docs

- [docs/webos-tv-spec-compliance.md](../../docs/webos-tv-spec-compliance.md)
- [docs/compatibility-matrix.md](../../docs/compatibility-matrix.md)
