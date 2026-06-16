# Compatibility Matrix

**Minimum platform: webOS TV 4.0** (2018 LG OLED B8 and newer). webOS TV 4.0 and 5.0 are co-primary engineering targets.

## Platform

| webOS TV | Engine | Status |
|----------|--------|--------|
| &lt; 4.0 | — | **Unsupported** (blocked at launch) |
| 4.0 | Chromium ~53 (2018 TVs, e.g. B8) | Supported — **co-primary target**; CSS and JS polyfilled for Chromium 53; use **Auto** quality |
| 5.0 | Chromium 68 | Supported (minimum for full spec alignment) |
| 6.0 | Chromium 79 | Supported |
| 22–26+ | Newer Chromium | Supported |

### LG B8 (2018 OLED, webOS 4.x)

- App launches on webOS 4.0+ (version gate).
- **Auto** (default): progressive direct play when codecs match; otherwise HLS remux, then server transcode.
- **Original file only**: no remux/transcode — use only when the file is known to direct-play on the TV; DTS titles often need **Auto** on simulator or strict Original mode.
- DTS: HTML5 `canPlayType` is unreliable; on real LG TVs (webOS 4+), XPlay may assume in-app DTS decode when the browser probe is empty. The **webOS TV Simulator** keeps conservative DTS probing (warnings are expected).

## Graphics / Video Resolution

Per [App Resolution spec](https://webostv.developer.lge.com/develop/specifications/app-resolution):

| Model | Graphics (app UI) | Video playback |
|-------|-------------------|----------------|
| FHD | 1280×720 (optional package) | 1920×1080 |
| UHD | 1920×1080 (default in `appinfo.json`) | 3840×2160 |

## Subtitles

| Format | Support |
|--------|---------|
| SRT / text (direct play) | Yes — [universal transcode subtitles](https://plexapi.dev/api-reference/transcoder/transcode-subtitles) (`subtitles=sidecar`) + HTML5 TextTrack |
| SRT (HLS remux / transcode) | Yes — same universal endpoint with `session` + `directPlay`/`directStream` aligned to video |
| External / sidecar `.srt` | Yes — [GET `/library/streams/{id}.{ext}`](https://developer.plex.tv/pms/) first, then universal fallback |
| Embedded text (MKV, etc.) | Universal subtitles only (stream GET returns 501 per PMS — not a sidecar) |
| PGS / VOBSUB / DVD subs | Burn-in via server transcode (`subtitles=burn`) — [Plex subtitle formats](https://support.plex.tv/articles/200471133-adding-local-subtitles-to-your-media/) |

**Client fetch ladder** (see `buildSubtitleFetchPlan` in `src/playback/tracks/subtitleTracks.js`):

1. Sidecar track → `/library/streams/{id}.srt` → universal (`metadata` path, `subtitles=sidecar`, then `auto`) → part path last resort  
2. Embedded track → skip stream GET → universal paths as above  
3. Graphical track → video restart with burn-in (no client fetch)

## Audio / Video

| Feature | Notes |
|---------|-------|
| H.264 Direct Play | Yes |
| HEVC 4K Direct Play | UHD models |
| HDR10 / Dolby Vision | UHD + model flags via `deviceInfo` |
| AC-3 / E-AC-3 | Supported on most LG TVs; probe + fallback |
| DTS | Model-dependent — TV profile on device; simulator shows transcode warning; **Auto** uses remux/transcode when needed |

## Streaming

| Protocol | Status |
|----------|--------|
| HLS (Plex transcode) | Primary |
| Progressive HTTP (direct play) | Yes |
| DASH | Not used |

## Plex Server

- Test against PMS 1.32.x and latest stable.
- Insecure HTTP on LAN optional (user setting).

## Known Caveats

1. Codec support still varies by TV model within webOS 4+.
2. Graphical subtitles not supported.
3. Only one HTML5 video element active at a time (LG platform rule).
4. webOS 4 TVs run Chromium ~53 — older than webOS 5 (Chromium 68). Prefer **Auto** over **Original file only** for DTS or high-bitrate files.
5. **Chrome 53 JS polyfills**: `String.prototype.padEnd/padStart` (`src/core/stringPolyfills.js`), `AbortController` (`src/core/abortControllerPolyfill.js`), `Promise.prototype.finally` (`src/core/promiseFinallyPolyfill.js`). `addEventListener({ once: true })` is replaced throughout with `addOnceEventListener` from `src/utils/domUtils.js`.
6. **Chrome 53 CSS**: `flex gap:`, `display: grid`, CSS math functions (`min()`/`max()`/`clamp()`), `aspect-ratio:`, `inset:`, `scroll-padding-inline`, and `overscroll-behavior:` are all removed or replaced in `src/styles/app.css`. See `docs/webos-tv-spec-compliance.md` section 2a for the full list.
