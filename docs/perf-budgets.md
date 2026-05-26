# Performance Budgets

Targets for **webOS TV 5.0+** (Chromium 68+).

| Metric | Budget | Measurement |
|--------|--------|-------------|
| Cold start to pairing screen | &lt; 2.0s | `performance.now()` at first paint |
| Cold start to library (cached auth) | &lt; 3.0s | Boot → library grid visible |
| Main bundle (gzip) | &lt; 200 KB | `dist/app.js` after build |
| webOSTV.js (min) | &lt; 12 KB | `dist/webOSTV.js` |
| CSS (gzip) | &lt; 30 KB | `dist/app.css` |
| Poster row DOM nodes | &lt; 40 visible | Virtual row recycling |
| Play → first frame (LAN direct) | &lt; 4s | User-perceived |

## Rules

- Design UI for **1920×1080** graphics resolution (`appinfo.json`).
- Lazy-load non-critical screens.
- Posters max 300px wide on browse grids.
- Single native `<video>` element for playback.
