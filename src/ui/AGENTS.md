# AGENTS.md — src/ui

## Purpose

Owns the TV interaction layer: the D-pad focus/navigation engine, poster image
decoding, shared modals, and reusable components. Per-route screen logic lives in
[screens/](screens/AGENTS.md); visual tokens/CSS live in
[../styles](../styles/AGENTS.md). This folder is "how the user moves and what the
building blocks are," not "what each screen does."

*Keep this file up to date when:* the focus-zone model changes, a new shared
component/modal is added, or the focus cache invalidation strategy changes.

## Notable Patterns

- **Focus engine = `focus.js`.** Focusable elements belong to zones marked with
  `[data-focus-zone]`. Left/Right moves *within* a zone; Up/Down moves *between*
  zones; Left at a zone edge returns to the sidebar. Focusables and zones are held
  in `WeakMap` caches that **must be invalidated on DOM mutation** — stale caches
  are the usual cause of "focus jumps to the wrong element."
- **No CSS `:focus-within` on webOS4.** Chrome53 discards any rule using it, so
  expand/collapse and active states are driven by JS-toggled classes, not CSS
  pseudo-classes. See memory `webos4-focus-within-dropped`. Don't reintroduce
  `:focus-within` for cross-version behaviour.
- **Focus motion is gated.** Scale/shadow focus animation is webOS5+/dev only —
  it lives in [../platform](../platform/AGENTS.md) `motionCursor.js`, not here.
- **Poster images fall back to ultrablur.** `posterImages.js` decodes/caches art;
  on error it uses the blurred background fallback (see [../plex](../plex/AGENTS.md)
  `ultrablur.js`).

## Key Files

| File | Role |
|---|---|
| `focus.js` | D-pad navigation engine: zones, focusable `WeakMap` cache, arrow routing |
| `posterImages.js` | Art/thumb decode + cache, ultrablur fallback on error |
| `resumeChoice.js` | Resume-vs-restart modal for in-progress media |
| `pinEntry.js` | PIN entry input |
| `loadingOverlay.js` | Full-screen loading spinner |
| `format.js` | Duration/count/truncate string helpers |

## Folder Map

- `screens/` — per-route screens. See [screens/AGENTS.md](screens/AGENTS.md).
- `components/` — reusable building blocks: `mediaCard.js` (poster + progress +
  badges), `virtualRow.js` (virtualized horizontal scroll), `controls.js` (player
  overlay UI), `browsingHubNav.js` (top pivot nav), `watchlistBookmark.js`,
  `hubRow.js`, `loadingIndicator.js`, `spinner.js`.
- `icons/` — SVG icon assets.

## Related docs

- [docs/design-system.md](../../docs/design-system.md) — component specs + 10-foot UX.
