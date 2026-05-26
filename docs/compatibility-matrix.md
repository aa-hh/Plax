# Compatibility Matrix

**Minimum platform: webOS TV 5.0** (Chromium 68). Earlier webOS versions are not supported.

## Platform

| webOS TV | Engine | Status |
|----------|--------|--------|
| &lt; 5.0 | — | **Unsupported** (blocked at launch) |
| 5.0 | Chromium 68 | Supported (minimum) |
| 6.0 | Chromium 79 | Supported |
| 22–26+ | Newer Chromium | Supported |

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

## Audio / Video (webOS TV 5.0 baseline)

| Feature | Notes |
|---------|-------|
| H.264 Direct Play | Yes |
| HEVC 4K Direct Play | UHD models |
| HDR10 / Dolby Vision | UHD + model flags via `deviceInfo` |
| AC-3 / E-AC-3 | Supported per LG 5.0 AV spec |
| DTS | Often requires server transcode |

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

1. Codec support still varies by TV model within webOS 5+.
2. Graphical subtitles not supported.
3. Only one HTML5 video element active at a time (LG platform rule).
