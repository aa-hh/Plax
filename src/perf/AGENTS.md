# AGENTS.md — src/perf

## Purpose

Opt-in runtime telemetry for diagnosing webOS TV performance sessions: a
sampling resource monitor plus an on-screen HUD. Entirely dev/diagnostic — it is
inert unless explicitly enabled, and ships disabled in normal use.

*Keep this file up to date when:* the enable triggers, the sampled fields, or the
`window.__plaxPerf` console API change.

## Notable Patterns

- **Disabled by default; two enable triggers.** `resourceMonitor.js`'s
  `shouldEnable()` returns true only for URL `?perf=1` or
  `localStorage.plax_perf_enabled === '1'`. Every public function early-returns
  when `enabled` is false, so importing the module costs nothing at runtime.
- **`initResourceMonitor()` must run before the HUD.** It sets the `enabled` flag
  and installs the `window.__plaxPerf` console API (`enable`/`disable`/`mark`/
  `getSnapshot`/`exportData`/`clear`). `initPerfHud()` no-ops if perf is off.
- **HUD toggles on the `H` key**, suppressed while typing or with modifiers.
- **Bounded ring buffers.** Samples and marks cap at `MAX_SAMPLES` (720 ≈ 1h at
  5s) via `pushBounded` — no unbounded growth during long sessions.
- **Route is injected, not imported.** `sample`/`getCurrentSample` take a
  `routeGetter` callback so this folder doesn't depend on the router; the HUD
  passes [../core](../core/AGENTS.md)'s `getRoute`.
- **Video stats read the live `<video id="native-player">`** directly
  (buffer-ahead, dropped/total frames via `getVideoPlaybackQuality`).

## Key Types

| Export | Role |
|---|---|
| `resourceMonitor.js` → `initResourceMonitor` | Set enable flag, install `window.__plaxPerf` API |
| `resourceMonitor.js` → `startSampling` / `stopSampling` | Begin/end the 5s sample loop |
| `resourceMonitor.js` → `getCurrentSample` | One-shot `{ route, heap, video }` snapshot |
| `resourceMonitor.js` → `mark` | Record a labelled timeline event |
| `perfHud.js` → `initPerfHud` | Build the on-screen HUD; returns a destroy fn |

To collect a trace on-device: enable perf, then
`window.__plaxPerf.exportData()` in the console.
