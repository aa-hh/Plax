# AGENTS.md — src/platform

## Purpose

Isolates everything LG/webOS-specific so the rest of the app stays
platform-agnostic: the webOSTV.js wrappers, version gating, Magic Remote motion
cursor, and display metrics. This is where cross-version behaviour is decided.

*Keep this file up to date when:* the minimum webOS version changes, a feature
gate is added, or the motion/exit behaviour changes.

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
