# Plex subtitle transcode alignment

Reference for how XPlay talks to PMS for text subtitles vs official Plex client behavior.

## PMS APIs (summary)

| Endpoint | Role |
|----------|------|
| `PUT /library/parts/{id}?subtitleStreamID=&allParts=1` | Persist active subtitle on the part before transcode/subtitle fetch |
| `GET /video/:/transcode/universal/decision` | MDE / session priming (`subtitles=auto`, `hasMDE=1`) |
| `GET /video/:/transcode/universal/subtitles` | Extract SRT/VTT for client `TextTrack` (`subtitles=embedded\|sidecar\|auto`) |
| `GET /video/:/transcode/universal/start.m3u8` | HLS playback; soft client subs use `skipSubtitles=1` (plex-for-kodi); burn uses `subtitles=burn` + `X-Plex-Subtitle-Stream` |

`subtitles` query values: `auto`, `burn`, `none`, `sidecar`, `embedded`, `segmented`.

## XPlay flow

1. **Remux (direct-stream) + text subs:** `PUT` part selection → `start.m3u8` with `skipSubtitles=1` → client loads via `/subtitles` or `/library/streams/{id}.srt`.
2. **Direct play + text subs:** progressive file URL → `PUT` + `decision` prime → universal subtitle fetch plan.
3. **PGS/VOBSUB:** full transcode with `subtitles=burn`.

## Out of scope (proxy / host)

- Whatbox or other reverse proxies rewriting transcode URLs
- PMS voice-activity auto-sync (Plex Pass)
- TLS / token issues on remote `wan` connections
