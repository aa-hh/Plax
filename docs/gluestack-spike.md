# ADR: Gluestack / React on webOS4 — rejected

**Date:** 2026-06-18
**Branch:** tv-ui-overhaul
**Status:** Rejected

---

## Question

Can React + gluestack-ui (react-native-web / NativeWind / Tailwind stack) run inside
XPlay on the B8 TV (webOS 4, Chromium 53) while staying inside the <200 KB gzip
budget for the full app bundle?

---

## Method

An isolated spike was created in `spike/` — a single throwaway React island that
mounted a minimal Settings screen component without JSX, NativeWind, or gluestack
itself.  The point was to measure the irreducible floor cost of React-DOM +
react-native-web before committing any engineering time to the full toolchain.

A separate Rollup config (`build/rollup.spike.config.js`) bundled the spike entirely
outside the main production config so the app's own bundle and budget were untouched.

Because Chromium 53 predates several built-in APIs that react-native-web calls
unconditionally (`Array.prototype.flat`, `Object.entries/values/fromEntries`,
`String.prototype.padStart/padEnd`), a hand-rolled polyfill prelude (`spike/polyfills.js`)
was written — intentionally without core-js — to keep the weight comparison honest.

The resulting `.ipk` was sideloaded to the B8 via `ares-install`.

---

## Findings

| Item | Result |
|---|---|
| Renders on Chromium 53 | **Yes** — with the hand-rolled polyfill prelude |
| Polyfills needed | `Array.flat/flatMap`, `Object.entries/values/fromEntries`, `String.padStart/padEnd` |
| Spike bundle (gzip) | ~66 KB (React-DOM + react-native-web, no gluestack, no NativeWind, no Tailwind) |
| App budget headroom remaining | ~0 KB (app already at ~255 KB gzip; budget is <200 KB) |
| Focus engine bridging | Every component would need a per-component JS focus bridge to XPlay's `focus.js` — no free spatial navigation from RN-Web on a TV |
| Gluestack / NativeWind included | **No** — 66 KB is the floor with just React-DOM + RN-Web; full stack would be larger |

---

## Decision

**Rejected.**

The 66 KB floor blows the remaining budget before a single real component is written.
The focus engine bridging requirement means the "write once" promise of RN-Web does
not extend to the TV 10-foot UI without significant per-component glue code that
negates the cross-platform benefit.

**Chosen path:** build an in-house vanilla Google TV component layer directly over the
existing `--gt-*` CSS token layer already present in `src/styles/app.css`.  Zero React
cost, zero webOS4 polyfill risk, and full control over the spatial focus engine that
already exists in `src/ui/focus.js`.

---

## Artifacts removed

- `spike/` — throwaway React island source
- `dist-spike/` — built spike bundle + sideloaded `.ipk`
- `build/rollup.spike.config.js` — separate Rollup config for the spike
- npm devDependencies: `react`, `react-dom`, `react-native-web`,
  `@rollup/plugin-alias`, `@rollup/plugin-replace`, `@babel/preset-react`
