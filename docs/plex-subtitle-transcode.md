# Plex subtitle transcode alignment

Reference for how XPlay talks to PMS for text subtitles vs official Plex client behavior.

## PMS APIs (summary)

| Endpoint | Role |
|----------|------|
| `PUT /library/parts/{id}?subtitleStreamID=&allParts=1` | Persist active subtitle on the part before transcode/subtitle fetch |
| `GET /video/:/transcode/universal/decision` | MDE / session priming (`subtitles=auto`, `hasMDE=1`) |
| `GET /video/:/transcode/universal/subtitles` | Extract SRT/VTT for client `TextTrack` (`subtitles=embedded\|sidecar\|auto`) |
| `GET /video/:/transcode/universal/start.m3u8` | HLS playback; soft client subs use `skipSubtitles=1` (plex-for-kodi); burn uses `subtitles=burn` + `subtitleStreamID` + `X-Plex-Subtitle-Stream` (same on `/decision`) |

`subtitles` query values: `auto`, `burn`, `none`, `sidecar`, `embedded`, `segmented`.

## XPlay flow

1. **Every play / restart:** `PUT` part when a subtitle is selected → `GET /decision` with `subtitles=auto`, `X-Plex-Incomplete-Segments=1`, and `protocol=hls` on the active server URL (**HTTPS** when ranked first) → follow `Part@decision` and `Part@protocol` for the `start.m3u8` URL or progressive part URL. When PMS chooses HLS, the player **does not** fall back to progressive HTTP `/universal/start` (broken on many `plex.direct` proxies).
2. **Remux (direct-stream) + text subs:** `start.m3u8` with `skipSubtitles=1` after the server chose remux → client loads via `/library/streams/{id}.srt` then `/subtitles` over HTTP isolated from the live HLS session. Do **not** call `/decision` again during an active remux (stalls the next HLS segment). Failed soft subs do not restart with burn-in on remux.
3. **Direct play + text subs:** progressive file URL when decision says `directplay` → `PUT` + subtitle `decision` prime → universal subtitle fetch plan.
3. **PGS/VOBSUB:** full transcode with `subtitles=burn`.

## Out of scope (proxy / host)

- Whatbox or other reverse proxies rewriting transcode URLs
- PMS voice-activity auto-sync (Plex Pass)
- TLS / token issues on remote `wan` connections
