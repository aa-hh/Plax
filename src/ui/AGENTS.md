# AGENTS.md — src/ui

## Purpose

Owns the TV interaction layer: the D-pad focus/navigation engine, rail/carousel
movement + scrolling, poster image decoding, shared modals, and reusable
components. Per-route screen logic lives in [screens/](screens/AGENTS.md); visual
tokens/CSS live in [../styles](../styles/AGENTS.md). This folder is "how the user
moves and what the building blocks are," not "what each screen does."

*Keep this file up to date when:* the spatial-nav scoring changes, the rail
scroll/anchoring model changes, `NAV_SCROLL_MS` or the focus-cache invalidation
strategy changes, or a new shared component/modal is added.

## Notable Patterns

- **Geometric spatial navigation (`focus.js`), NOT a zone graph.** On each arrow
  press the engine takes the focused element's rect, projects a beam in that
  direction, and moves focus to the nearest candidate by geometry (`spatialMove`
  → `strictlyInDirection` + `scoreCandidate`). Layout *is* the nav model — there
  is no per-screen zone graph to maintain. (`[data-focus-zone]` attrs still in
  some screens are vestigial; the engine ignores them.) Replaced the old
  zone-graph engine in commit `a72371d`.
- **Focusables live in a `WeakMap` cache that MUST be invalidated on DOM
  mutation** — call `invalidateFocusableCache()` after re-rendering a list/feed,
  or the D-pad locks onto stale (removed) nodes. This is the classic "can't go
  right into the rails after returning Home" bug.
- **Focus watchdog re-homes focus** when it collapses to `<body>` (e.g. a
  re-render removed the focused node) — `restoreFocus`, wired in `attachFocusNav`.
- **No CSS `:focus-within` on webOS4.** Chrome53 discards any rule using it; drive
  expand/collapse + active states with JS-toggled classes. See memory
  `webos4-focus-within-dropped`.
- **Focus scale/grow is ON for webOS 4+ (incl. the B8)** via the `html.caps-motion`
  class set in [../core](../core/AGENTS.md) `app.js` (`applyMotionCapabilityClass`),
  NOT webOS5+. It stays smooth only because animations are transform/opacity-only
  (never layout/paint). `motionCursor.js` in [../platform](../platform/AGENTS.md)
  is a *separate* thing — the Magic Remote pointer, not focus scale.
- **Poster images fall back to ultrablur.** `posterImages.js` decodes/caches art;
  on error it uses the blurred background fallback ([../plex](../plex/AGENTS.md)
  `ultrablur.js`).

## Rail / carousel movement (`focus.js` `scrollFocusedIntoView`)

The home feed/rails are tuned to the 12-column grid; the full spec is in
[component-registry.md](../../docs/design-system/component-registry.md) → **Home
Rail**. The code seams:

- **Horizontal, home rails = anchored slot.** The selector pins to a fixed column
  (`ANCHOR_SLOT = 2`, the 3rd). Cards 1–3 sit at `scrollLeft 0`; from the 4th the
  rail shifts left in whole card-pitch steps (`(idx-2) * railPitch(el)`), keeping
  every rail on the grid. Other screens' rails (library/detail) **center** the
  focused card instead.
- **Vertical, home feed = anchored rails** (`scrollHomeRailAnchored`): moving down
  keeps the focus ring in a fixed vertical slot (the first rail's resting
  position) and scrolls the feed so the new rail rises into it. Non-home lists use
  `scrollNearestVertical` (edge-margin "camera follows focus").
- **Glide = `NAV_SCROLL_MS` (150ms)** — a short RAF ease-out-cubic glide on every
  engine incl. Chromium 53. `smoothScrollCarousel`/`smoothScrollVertical` jump
  instantly when there's no rAF (tests) and cancel any in-flight glide so a held
  d-pad chases focus. Chrome53 ignores `scrollIntoViewOptions`, so the scroll math
  is manual. Magic-remote *clicks* skip the snap (recent-pointer guard).
- **Virtualization:** `components/virtualRow.js` windows a rail's DOM (spacers
  preserve scroll extent); `components/hubRow.js` renders one `.row-section` rail.
  Card width/gap + the gutter bleed are CSS in [../styles](../styles/AGENTS.md).

## Key Files

| File | Role |
|---|---|
| `focus.js` | Spatial D-pad nav engine, focusable `WeakMap` cache, rail/feed scroll + anchoring |
| `posterImages.js` | Art/thumb decode + cache, ultrablur fallback on error |
| `resumeChoice.js` | Resume-vs-restart modal for in-progress media |
| `pinEntry.js` | PIN entry input |
| `loadingOverlay.js` | Full-screen loading spinner |
| `format.js` | Duration/count/truncate string helpers |

## Folder Map

- `screens/` — per-route screens. See [screens/AGENTS.md](screens/AGENTS.md).
- `components/` — reusable building blocks: `mediaCard.js` (poster + progress +
  badges), `virtualRow.js` (windowed horizontal rail), `hubRow.js` (rail section),
  `browsingHubNav.js` (collapsible left-gutter nav sidebar), `controls.js` (player
  overlay UI), `watchlistBookmark.js`, `loadingIndicator.js`, `spinner.js`.
- `icons/` — SVG icon assets.

## Related docs

- [docs/design-system/component-registry.md](../../docs/design-system/component-registry.md) — **single source of truth** for component specs (incl. the Home Rail movement spec) + Figma node-ids. Follow the Design decision protocol in the [root AGENTS.md](../../AGENTS.md) and record results there.
- [docs/design-system.md](../../docs/design-system.md) — component specs + 10-foot UX.
