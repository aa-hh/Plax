# AGENTS.md — src/utils

## Purpose

Low-level, dependency-free helpers shared across the app: the fetch wrapper,
remote logging, XML parsing, QR generation, and DOM helpers. Nothing here knows
about Plex or screens.

*Keep this file up to date when:* the fetch/timeout strategy changes or a new
shared utility is added.

## Notable Patterns

- **`fetch.js` wraps native `fetch` (Chrome53 has it), not XHR.** Timeouts use
  `Promise.race`, not `signal`, because the AbortController polyfill (see
  [../core](../core/AGENTS.md)) does not make legacy fetch honor `signal`. Use
  this wrapper rather than calling `fetch` directly when you need a timeout.
- **Remote logging via `tvDebug.js`** posts tagged/leveled logs to an HTTP sink —
  pair with `scripts/log-receiver.cjs` (`npm run log:receive`) to capture logs off
  a real TV. See [docs/tv-debug-inspect.md](../../docs/tv-debug-inspect.md).
- **PMS returns XML;** `xml.js` (`extractMetadataItems`) is the lightweight parser
  used by [../plex](../plex/AGENTS.md).

## Key Files

| File | Role |
|---|---|
| `fetch.js` | `fetch` wrapper with `Promise.race` timeout + JSON/text parsing |
| `tvDebug.js` | Remote logging to HTTP sink (tag/level/message + timestamps) |
| `xml.js` | Minimal XML → metadata item parser |
| `qrDataUrl.js` | QR code data-URL generation (pairing) |
| `domUtils.js` | DOM helpers (e.g. add-once event listener) |

## Folder Map

- `vendor/` — third-party code (QR lib, polyfill backfills).
