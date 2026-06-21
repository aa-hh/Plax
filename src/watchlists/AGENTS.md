# AGENTS.md — src/watchlists

## Purpose

Per-profile watchlist data: who may use watchlists, where lists are persisted,
and how stored item snapshots are re-hydrated into live media for display. This
folder owns the **model + storage**, not the UI — the bookmark button, picker
modal, and watchlist screen live in [../ui](../ui/AGENTS.md). Persistence goes
through [../core](../core/AGENTS.md)'s `storage.js`; re-hydration pulls live
metadata from [../backends](../backends/AGENTS.md).

*Keep this file up to date when:* the storage schema (`STORAGE_VERSION`) or
snapshot shape changes, or the eligibility rule in `access.js` changes.

## Notable Patterns

- **Lists are scoped per profile, not per server.** `store.js` keys storage by
  the Plex Home user (`id` / `uuid`), so the active Home user — not the signed-in
  account — owns the lists. The active user is `state.activeHomeUser || state.user`;
  resolving the *wrong* user silently shows an empty list.
- **Items are stored as denormalised snapshots, not just rating keys.**
  `snapshotFromItem` captures title/thumb/progress so a list renders offline or
  before metadata loads; `resolveWatchlistItems` then overlays fresh
  `getMetadata` results (`mergeResolvedItem`), falling back to the snapshot
  (title → "Unavailable") when the server can't be reached.
- **Eligibility is admin / restricted only.** `canUseWatchlists` denies guests
  and non-Home users. Gate any new watchlist entry point behind it.
- **Bumped, not appended.** `addItemToWatchlist` de-dupes then `unshift`s, so the
  most recently added item is first.

## Key Types

| Export | Role |
|---|---|
| `access.js` → `canUseWatchlists` | Eligibility gate (admin or restricted profiles only) |
| `store.js` | CRUD over per-profile lists in local storage; `STORAGE_VERSION`-tagged |
| `store.js` → `snapshotFromItem` | Freeze a live media item into a stored snapshot |
| `store.js` → `ensureDefaultWatchlist` | Lazily create a first list on demand |
| `resolve.js` → `resolveWatchlistItems` | Re-hydrate snapshots against live backend metadata |
| `resolve.js` → `watchlistToHubRow` | Adapt a list into a Home-style hub row (`displayVariant: 'compact'`) |
| `resolve.js` → `classifyWatchlistRowKind` | Tag a list `tv` / `films` / `mixed` for poster preference |

## Tests

| Test | Focus |
|---|---|
| [../../test/watchlists.test.js](../../test/watchlists.test.js) | store CRUD, snapshotting, resolve/merge |
| [../../test/focus-nav-watchlist.test.js](../../test/focus-nav-watchlist.test.js) | watchlist screen focus navigation |
