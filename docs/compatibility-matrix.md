# Compatibility Matrix

**Minimum platform: webOS TV 4.0** (2018 LG OLED B8 and newer). webOS TV 5.0+ remains the primary test target.

## Platform

| webOS TV | Engine | Status |
|----------|--------|--------|
| &lt; 4.0 | — | **Unsupported** (blocked at launch) |
| 4.0 | Chromium (2018 TVs, e.g. B8) | Supported (best-effort; use **Auto** quality) |
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
| SRT / text (direct play) | Yes — Plex universal subtitles endpoint + HTML5 TextTrack (no video transcode) |
| SRT (via Plex transcode) | Yes, with timing offset when direct play unavailable |
| PGS / VOBSUB / DVD subs | Burn-in via server transcode only (no client-side image subs on webOS) |

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
4. webOS 4 TVs use an older Chromium than webOS 5; prefer **Auto** over **Original file only** for DTS or high-bitrate files.
