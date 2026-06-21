# AGENTS.md — src/ui/components

## Purpose

Reusable DOM-factory widgets shared across screens — the Google TV component
vocabulary (buttons/chips/tabs/modals), media cards, virtualised rows, hub nav,
and loading affordances. Screens in [../screens](../screens/AGENTS.md) compose
these; styling lives in [../../styles](../../styles/AGENTS.md), focus handling in
[../](../AGENTS.md)'s `focus.js`.

*Keep this file up to date when:* a component factory is added/removed, or the
focusability / Chrome 53 contract below changes.

## Notable Patterns

- **Vanilla DOM factories, not classes.** Each export builds a node (often
  returning `{ element, setItems, destroy }`) — no framework. New widgets follow
  the same shape so `destroy` can detach listeners.
- **Chrome 53 / webOS 4 safe.** No template literals in hot paths (string
  concatenation only), no modern DOM APIs, motion gated via `html.caps-motion` in
  CSS. The npm-test guardrail enforces this — see [chrome53-css-guardrail](../../../CLAUDE.md).
- **Focusables are native `<button>` / `tabIndex=0` nodes** matched by
  `focus.js`'s `focusableSelector`. `controls.js` factories emit `gt-*`/`btn`
  classes styled in `app.css`; don't hand-roll inline-styled controls in screens.
- **Cards are cloned from a precompiled template.** `mediaCard.js` parses one
  skeleton then `cloneNode(true)`s it — several times faster than `createElement`
  per card on a B8. Optional pieces (progress bar, watched badge) are appended
  only when needed. Poster URLs are CSS-sized via tokens; intrinsic `width`/
  `height` hints are kept at 2:3 to avoid pre-CSS layout jump.
- **Rows render a bounded DOM window, not all items.** `virtualRow.js` keeps
  ~`visibleCount` cards around focus, with lead/trail spacers preserving scroll
  extent; `focusin` and Left/Right shift the slice. Posters hydrate off the
  keydown tick (`hydrateRowViewport`).
- **Bookmark UI delegates to the model.** `watchlistBookmark.js` is the only UI
  here that owns its own modal; all state goes through
  [../../watchlists](../../watchlists/AGENTS.md) and is gated by `canUseWatchlists`.

## Key Types

| File | Role |
|---|---|
| `controls.js` | Google TV vocabulary: `createButton` (filled/outline/icon/wide), chips, pill-tabs, list-items, modals |
| `mediaCard.js` | Poster card with title/subtitle/meta, progress bar, watched badge; `formatCardLines`, `resolveDetailRoute` |
| `virtualRow.js` | Horizontal hub row with windowed DOM around focus |
| `hubRow.js` | Static hub-row wrapper (title + row container) |
| `browsingHubNav.js` | Sidebar nav item list (Home/Watchlist/libraries/Search/Settings), respecting access gates |
| `watchlistBookmark.js` | Detail bookmark button + watchlist-picker modal |
| `loadingIndicator.js` / `spinner.js` | Loading affordances |

## Tests

| Test | Focus |
|---|---|
| [../../../test/component-registry.test.js](../../../test/component-registry.test.js) | component vocabulary matches the registry spec |
