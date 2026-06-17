# Performance Budgets

Targets for **webOS TV 4.0+** (Chromium 53+) — LG B8 is the floor.

| Metric | Budget | Measurement |
|--------|--------|-------------|
| Cold start to pairing screen | &lt; 2.0s | `performance.now()` at first paint |
| Cold start to library (cached auth) | &lt; 3.0s | Boot → library grid visible |
| Warm boot to home (disk-cached) | &lt; 800 ms | `boot:init` → `screen:firstPaint{home}` |
| D-pad key → focus visual update | &lt; 80 ms p95 | `input:keydown` → `input:focusCommitted` |
| Back navigation to retained screen | single frame (no network) | `route:retainHit` mark + DevTools network |
| User-select avatars (warm cache) | visible before first network frame | `userSelect:avatar-visible` mark |
| Main bundle (gzip) | &lt; 200 KB | `dist/app.js` after build |
| webOSTV.js (min) | &lt; 12 KB | `dist/webOSTV.js` |
| CSS (gzip) | &lt; 30 KB | `dist/app.css` |
| Poster row DOM nodes | &lt; 40 visible | Virtual row recycling |
| Play → first frame (LAN direct) | &lt; 4s | `play:pressed` → `play:firstFrame` |

## Rules

- Design UI for **1920×1080** graphics resolution (`appinfo.json`).
- Lazy-load non-critical screens.
- Posters max 300px wide on browse grids.
- Single native `<video>` element for playback.
- Never write to IndexedDB on the input path; batch and flush via `setTimeout(0)`.
- Retain up to 3 recent screens (`display:none`) so Back navigation never
  rebuilds DOM or hits the network.
