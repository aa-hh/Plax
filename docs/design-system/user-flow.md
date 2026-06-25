# XPlay — App User-Flow Reference

**Figma file:** https://www.figma.com/design/WI3ps729HoHyWQKfEG3XSH/XPlay-%E2%80%94-App-User-Flow-Reference  
**fileKey:** `WI3ps729HoHyWQKfEG3XSH`

## Keeping this current

When a user flow or screen changes:
1. Update the matching harness entry in `docs/design-system/flow/render.mjs` (or the harness files in `harness/`).
2. Re-render: `npx rollup -c docs/design-system/flow/harness/rollup.harness.mjs` then re-screenshot.
3. Upload the new PNG to the matching Figma frame via `upload_assets` targeting its `img` node ID.
4. If the transition itself changed, update the arrow/label in the matching Figma section via `use_figma`.

## Board sections

| Section | Figma node | Content |
|---------|-----------|---------|
| §1 · Onboarding & Server Selection | `15:2` | Provider picker → Plex pairing / Jellyfin login → Server picker. Three swimlanes (first-run / returning / mid-session). |
| §2 · Browsing Hub | `28:2` | Global Nav Hub + Home, Library, Search, Watchlist, Settings. Card tap → Detail. |
| §3 · Detail | `33:21` | 4 variants: Movie, Show, Season, Episode. Play → Player, breadcrumb nav. |
| §4 · Player | `38:10` | 6 key states: Loading, Playing+transport, Paused, Seeking, Track drawer, Skip/Up-Next. |

## Screen inventory

### §1 Onboarding
| Screen | Thumbnail | Figma img node |
|--------|-----------|---------------|
| Provider picker | `thumbnails/provider-picker.png` | `15:16` |
| Plex pairing | `thumbnails/plex-pairing.png` | `15:19` |
| Jellyfin login · URL | `thumbnails/jf-login-url.png` | `15:22` |
| Jellyfin · Quick Connect | `thumbnails/jf-login-quickconnect.png` | `15:25` |
| Jellyfin · password | `thumbnails/jf-login-password.png` | `15:28` |
| Server picker (launch) | `thumbnails/server-picker-launch.png` | `15:31` |
| Server picker (from Settings) | `thumbnails/server-picker-settings.png` | `15:34` |

### §2 Browsing Hub
| Screen | Thumbnail | Figma img node |
|--------|-----------|---------------|
| Home | `thumbnails/home.png` | `28:14` |
| Library | `thumbnails/library.png` | `28:17` |
| Search | `thumbnails/search.png` | `28:20` |
| Settings | `thumbnails/settings.png` | `28:23` |

### §3 Detail
| Screen | Thumbnail | Figma img node |
|--------|-----------|---------------|
| Movie detail | `thumbnails/detail-movie.png` | `33:26` |
| Show detail | `thumbnails/detail-show.png` | `33:29` |
| Season detail | `thumbnails/detail-season.png` | `33:32` |
| Episode detail | `thumbnails/detail-episode.png` | `33:35` |

### §4 Player
Player state frames are labeled dark-background placeholders. To add real thumbnails, render each state from the player overlay markup/CSS and upload to:

| State | Figma img node |
|-------|---------------|
| Loading / first frame | `38:15` |
| Playing + transport | `38:19` |
| Paused | `38:23` |
| Seeking / scrub | `38:27` |
| Track selector drawer | `38:31` |
| Skip / Up Next | `38:35` |

## Render script

`docs/design-system/flow/harness/` — real app screens + mock fixtures bundled via rollup.

```bash
# Rebuild bundle (needed when src/styles/app.css or screen components change)
npx rollup -c docs/design-system/flow/harness/rollup.harness.mjs

# Re-screenshot all §2/§3 screens
HARNESS="file:///path/to/docs/design-system/flow/harness/index.html"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for s in home library search settings detail-movie detail-show detail-season detail-episode; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --window-size=1920,1080 --virtual-time-budget=5000 \
    --screenshot="docs/design-system/flow/thumbnails/$s.png" \
    "${HARNESS}?screen=${s}"
done
```

## Screen → component registry mapping

| Screen | Registry entry |
|--------|---------------|
| Provider picker | Provider-picker card |
| Server picker | Server picker (cross-provider saved-link chooser) |
| Home | Home rail / Media card |
| Library | Library grid / Media card |
| Detail · Movie/Show/Season/Episode | Detail screen |
| Settings | Settings screen |
| Player | Player overlay (§4 placeholder — not yet in registry) |
