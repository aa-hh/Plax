# AGENTS.md — src/ui/screens

## Purpose

One file per user-visible route. Each screen owns its data loading, layout, and
interactions, and registers with the [../../core](../../core/AGENTS.md) router.
Shared focus/components come from [../](../AGENTS.md); playback engine from
[../../playback](../../playback/AGENTS.md); data from
[../../plex](../../plex/AGENTS.md).

*Keep this file up to date when:* a screen is added/removed or its retention
behaviour changes.

## Notable Patterns

- **Screen retention affects back-nav.** Browse screens are retained (kept alive
  in the router's `retainStack`, so back-navigation restores them with focus
  intact, no re-render); player / pairing / profile-picker are transient and torn
  down on leave. When a screen shows stale data after returning, check whether it
  should refresh on re-show vs being a retained instance. See
  [../../core](../../core/AGENTS.md) for the retention model.
- **Player screen is the overlay UI only;** the engine is
  [../../playback](../../playback/AGENTS.md). `playerOverlayFirstFrame.js` handles
  first-frame overlay timing.

## Key Types

| Screen | Role |
|---|---|
| `playerScreen.js` | Playback overlay: transport, seek + storyboard preview, quality/audio/subtitle menus, skip markers |
| `detailScreen.js` | Metadata: seasons/episodes, related, file details, connection probe, watch status, refresh/scan |
| `homeScreen.js` | Promoted-hub rows + pivots (Home/TV/Films/Search) |
| `libraryScreen.js` | Browse a library section with sidebar; "Scan for new media" |
| `settingsScreen.js` | Network (LAN/remote), playback quality, user/server management |
| `searchScreen.js` | Debounced `/hubs/search` with section fallback |
| `watchlistScreen.js` | Watchlist bookmarks |
| `profilePickerScreen.js` | Plex Home user selection (transient modal) |
| `pairingScreen.js` | Plex QR/PIN login (transient) |
| `designReviewScreen.js` | Dev/design component showcase |
| `playerOverlayFirstFrame.js` | First-frame overlay timing helper |

## Related docs

- [docs/agent-handoff-browse-playback-detail.md](../../../docs/agent-handoff-browse-playback-detail.md) — navigation/state handoff between browse, detail, and playback.
- [docs/screen-review-playbook.md](../../../docs/screen-review-playbook.md) — route-by-route simulator QA checklist.
