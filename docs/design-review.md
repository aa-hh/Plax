# Plax — UI Design Review

**Date:** 2026-06-17  
**Scope:** Full UI audit — CSS, components, screens  
**Platform target:** webOS 4 / Chromium 53 · LG B8 · D-pad + Magic Remote  
**Methodology:** Three parallel passes — Web Interface Guidelines compliance (A), Plex parity (B), LG B8 performance budget (C)

---

## 1. Executive Summary

**Biggest wins in the current build:**
- Player is feature-rich: skip intro/credits, scrub preview thumbnails, up-next countdown, in-player audio/subtitle/quality switching — solid Plex parity.
- Virtual row windowing (26 DOM nodes max per row) and a 6-slot poster decode queue keep home screen memory bounded.
- Transition discipline is mostly correct: nearly all animations use `transform`/`opacity` (compositor-safe). Only two exceptions found.
- No `backdrop-filter`, `mix-blend-mode`, or `filter: blur` anywhere — the biggest GPU-killer is not present.
- All `document`-level listeners added during the recent refactor are correctly cleaned up in `destroy()`.

**Biggest gaps:**
- The Resume button on the detail screen does not show the resume timestamp — the single most-noticed Plex parity gap (P0, one-line fix).
- Seven hardcoded hex color values outside the token system, and `color-scheme: dark` missing from `:root` — both affect the design system's coherence.
- Library screen has no filter/sort controls and its grid is not virtualised — a b8-costly gap to close properly.
- Several ARIA attributes are wrong or missing (seek bar `role`, modal `aria-labelledby`, search input `aria-label`, progress bar attributes).
- One confirmed listener leak: `openTextInputModal` in `settingsScreen.js` leaves a `document` capture keydown listener if the user navigates away while the modal is open.

**LG B8 ceiling (things we will never do):**
- Hero section with animated/crossfade backdrop — b8-no-go.
- `backdrop-filter: blur` for any glass/frost UI element — b8-no-go.
- Full-library letter-jump with synchronous index build — b8-no-go (async indexing variant is b8-cheap).

---

## 2. Pass A — Web Interface Guidelines Findings

Grouped by file. Format: `file:line — [applies|fail|tv-na] — description`

### `src/styles/app.css`

**Focus states**

`app.css:144` — applies — `outline:none` on `.btn`/`.nav-item` etc. is intentional; every element in the list has a paired `:focus` rule restoring a visible border + box-shadow indicator.

`app.css:361–366` — applies — `.browsing-hub-item:focus` has `outline: 3px solid var(--border-focus)`. Correct.

`app.css:387–389` — **fail** — `.watchlist-row-link:focus` provides only `color: var(--accent)` as a focus indicator. Color-alone fails focus visibility at 10-foot viewing distance on a dark background. Add `outline` or `box-shadow` ring to match the design system.

`app.css:746,835` — applies — `.media-card` suppresses outline; the actual indicator is on `.card-poster-wrap` child (outline-color + box-shadow at line 844–847). Acceptable TV pattern.

`app.css:1231` — applies — `.detail-setting-chip:focus` uses border-color + box-shadow replacement. Consistent.

`app.css:1687–1689` — **fail** — `.detail-watchlist-btn:focus` changes only `border-color` (1 px, near-transparent to `--border-focus`). A 1 px border change is imperceptible at 10-foot TV distance. Add a `box-shadow: 0 0 0 3px var(--border-focus)` ring matching the standard pattern.

`app.css:1848–1855` — **fail** — `.detail-season-link` has no `:focus` rule and no `outline:none`. Browser UA default outline will render — inconsistent with every other interactive element and unpredictable on webOS 4. Add to the system `outline:none` list with a paired `:focus` ring.

`app.css:2481–2485` — applies — `.player-seek-bar:focus` suppresses outline; focus shown via `.player-seek-bar:focus .player-seek-thumb` enlarging + box-shadow ring (line 2527–2534). Correct.

`app.css:840,2484` — tv-na — `:focus-visible` selectors appear twice, both setting `outline:none`. Chromium 53 does not implement `:focus-visible` (added in Chrome 86) — these selectors never fire. Dead weight, no harm.

**Animation / transitions**

`app.css:236` — **fail** — `transition: width 160ms ease` on `.browsing-hub-nav-host`. `width` is not compositor-accelerated; every frame of the 160 ms sidebar-open triggers full layout. (Also flagged in Pass C.)

`app.css:2524` — **fail** — `transition: width 0.12s, height 0.12s, margin 0.12s, box-shadow 0.12s` on `.player-seek-thumb`. Three of four properties force layout recalculation on every frame during seek. Replace with `transform: scale()` + `box-shadow` only. (Also flagged in Pass C.)

`app.css:780` — applies — `transition: opacity 200ms ease` on poster images. Compositor-safe.

`app.css:3281` — applies — `transition: transform 0.35s ease, opacity 0.25s ease` on `.profile-card`. Both compositor-safe.

`app.css:789–795` — tv-na — `@media (prefers-reduced-motion: reduce)` block exists but webOS 4 never sets this preference. Block is inert at runtime; not harmful.

All `@keyframes` animate only `transform` or `opacity` — no layout-triggering keyframe animations found.

**Typography**

`app.css` — tv-na — `text-wrap: balance` absent on heading elements. Property not supported in Chromium 53 (added in Chrome 114). Not actionable for this target.

`app.css:137,567,2561,2842,3356` — applies — `font-variant-numeric: tabular-nums` correctly applied to perf HUD, pairing code, subtitle delay, player time, and PIN display. No gaps found.

`app.css` — applies — No CSS `content:` properties use three ASCII dots (`...`) for truncation. All ellipsis truncation uses `text-overflow: ellipsis` (CSS property). Correct.

**Content handling**

`app.css:806,815,825` — **fail** — `.card-title` (`#f2f5ff`), `.card-subtitle` (`#b8c3d7`), `.card-meta` (`#8a95aa`) use hardcoded hex values instead of `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`. Values are near-duplicates of those tokens with slight variance — reconcile.

`app.css:443` — **fail** — `.btn-primary color: #0a0a0f` hardcoded.

`app.css:923` — **fail** — `.watch-status-error color: #e88` hardcoded shorthand.

`app.css:1966` — **fail** — `.detail-network-status--error color: #f5a66e` hardcoded.

`app.css:2345,2364` — **fail** — `.player-status--error` and `.player-playback-error` use `#ffb4b4` and `#ff6b6b` hardcoded.

`app.css:3735` — **fail** — `.direct-play-notice.direct-play-blocked strong color: #f08088` hardcoded.

**Dark mode**

`app.css` — **fail** — `color-scheme: dark` absent from `:root`. Without it, form controls and scrollbars render in light mode on webOS 4 unless the UA happens to default to dark. Single-line fix: add `color-scheme: dark;` to `:root`.

**Images**

`app.css:554` — applies — `.pairing-qr img` has `width/height: 100%`; parent has explicit `260 × 260 px`. No CLS risk.

`app.css:2451–2456` — applies — `.player-scrub-preview-thumb img` has explicit parent `240 × 135 px`. Correct.

---

### `src/ui/components/mediaCard.js`

`mediaCard.js:128–129` — applies — Cards use `<div role="button" tabIndex=0>` with Enter-key handler. Not a native `<button>` but role + tabIndex + key handler satisfies D-pad focus requirements.

`mediaCard.js:185` — applies — `aria-label` set as composite title + subtitle + meta string. Specific, not generic.

`mediaCard.js:189` — applies — `img.alt` set to resolved primary title. Meaningful.

`mediaCard.js:191–199` — applies — Explicit `width` and `height` attributes on `<img>` for all three layout variants. No CLS.

`mediaCard.js:134–135` — applies — `img.decoding='async'` and `img.loading='lazy'` set by default; priority cards override to `'eager'` via `posterImages.js`.

`mediaCard.js:213–220` — **fail** — Progress bar has `aria-hidden="true"`. Silences it completely. Replace with `role="progressbar" aria-valuenow="{pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Watch progress"` and remove `aria-hidden`.

`mediaCard.js:222–228` — applies — "Watched" badge has `aria-label="Seen"`. Appropriate.

---

### `src/ui/components/hubRow.js`

`hubRow.js:19–23` — tv-na — Row container is a plain `<div>`, not `<ul>/<li>`. `role="list"` absent. Acceptable for a TV UI where D-pad navigation provides the traversal model.

`hubRow.js:29–30` — tv-na — No ARIA landmark on row container. Uses `data-focus-zone` for D-pad routing. Acceptable.

---

### `src/ui/components/browsingHubNav.js`

`browsingHubNav.js:106–122` — applies — Nav items use native `<button type="button" tabIndex=0>`. Labels always rendered in markup.

`browsingHubNav.js:113–115` — **fail (risk)** — `<button>` elements have no `aria-label` attribute of their own — accessible name is computed from the child `.browsing-hub-item__label` span. If CSS hides that span (e.g. in the collapsed icon-only sidebar state), the button becomes icon-only with no accessible name. Current CSS uses `display: none` on the label when sidebar is not `:focus-within`. Add `aria-label` to each `<button>` matching the label text to guard against this.

`browsingHubNav.js:173–174` — applies — Host element has `role="navigation" aria-label="Browse"`. Correct landmark.

---

### `src/ui/components/spinner.js`

`spinner.js:25–26` — applies — Spinner uses `role="status"` (which implies `aria-live="polite"` per spec). Correct.

---

### `src/ui/loadingOverlay.js`

`loadingOverlay.js:17–18` — **fail** — Loading indicator uses `role="progressbar"` without `aria-valuenow`, `aria-valuemin`, `aria-valuemax`. `role="progressbar"` without value attributes is invalid ARIA. For an indeterminate spinner, use `role="status" aria-live="polite"` (matching `spinner.js`). Remove `role="progressbar"`.

---

### `src/ui/screens/playerScreen.js`

`playerScreen.js:229` — **fail** — Seek bar element is `<button class="player-seek-bar">` with `aria-label="Seek"`. Should be `role="slider"` with `aria-valuemin="0"` and `aria-valuemax="100"`. The dynamic `aria-valuenow` and `aria-valuetext` updates (line 1617–1624) are already correct — just add the static role + min/max to the template HTML.

`playerScreen.js:233–234` — applies (with caveat) — Time display elements have `aria-hidden="true"`. The seek bar `aria-valuetext` string provides the same information once `role="slider"` is in place. Correct approach.

`playerScreen.js:216` — applies — Skip intro/credits button has specific `aria-label` updated dynamically.

`playerScreen.js:260–271` — applies — Icon-only quality/audio/subtitle player buttons have `aria-label` set statically and updated via `updateTrackButtonLabels()`. Correct.

`playerScreen.js:244` — tv-na — Player control bar is a `<div>`, not `<nav role="navigation">`. Screen readers are not a realistic use case on webOS 4 TV. Not actionable.

---

### `src/ui/screens/detailScreen.js`

`detailScreen.js:829,908,965` — applies — `<h1>` present and meaningful on episode, movie, and show detail views.

`detailScreen.js:742–753` — **fail** — `#btn-start` shows "Resume" or "Play" but no timestamp. The resume time is computed via `formatTimeRemaining(item)` (line 98) but only appears as a secondary metadata line. The button label should read "Resume from 23:45" when `item.viewOffset` is set. One-line fix in `buildPlaybackActionsHtml`.

`detailScreen.js:760` — **fail** — Detail modal sheet has `role="dialog" aria-modal="true"` but no `aria-labelledby`. There is a `<p id="detail-modal-title">` element inside it. Add `aria-labelledby="detail-modal-title"` to `#detail-modal-sheet`.

`detailScreen.js:291–293` — applies — Quality button shows text label ("Quality: Auto"). Not icon-only.

`detailScreen.js:316–333` — applies — Subtitle button shows text label ("Subtitles: Off"). Not icon-only.

---

### `src/ui/screens/searchScreen.js`

`searchScreen.js:49–51` — **fail** — `<input id="search-input">` has no `<label>` and no `aria-label`. `placeholder` is not a substitute. Add `aria-label="Search"`.

---

### `src/ui/screens/settingsScreen.js`

`settingsScreen.js:283–295` — **fail** — `<select>` elements (`#perf-hud-select`, `#debug-log-select`) have sibling `<label>` elements with no `for` attribute linking them. Add `for="perf-hud-select"` etc.

`settingsScreen.js:291` — **fail** — `<input id="log-sink-url">` has no `<label for="log-sink-url">`. Add the `for` attribute.

---

### `index.html`

`index.html` — **fail** — No `<meta name="theme-color">` tag. Add `<meta name="theme-color" content="#0a0a0f">`.

`index.html` — **fail** — No `<meta name="color-scheme" content="dark">`. Add it. (Also missing from CSS `:root` — fix both.)

`index.html:5` — applies — Viewport meta present with `user-scalable=no`. Correct for TV.

`index.html` — **fail** — No `<link rel="preload">` tags. If a custom webfont is used (verify in `app.css`), add a font preload. Also consider preloading `app.css` for first-paint on webOS 4's slow eMMC storage.

---

## 3. Pass B — Plex / Emby Parity

*Plex is the primary reference (Plex HTPC / Plex Web on TV, 2024–2025). Emby noted only where it differs materially.*

### Home screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| No hero/featured item: Plex always places a full-width featured item above the carousels (backdrop art, title, synopsis, Play button). We go straight to hub rows. | P1 | b8-costly |
| "Continue Watching" rail not pinned to row 0: Plex guarantees this rail at the top regardless of server hub ordering. Our `loadHomeFeedPhased` renders whatever the server returns in the order received — no client-side pin. Fix: sort/pin in `homeScreen.js renderRowsIntoFeed`. | P1 | b8-free |
| No "On Deck" guaranteed rail: similar to above — server-driven, no client pin. | P1 | b8-free |
| Information density: likely matches Plex (~4–6 rows visible above fold with current card sizing). No gap, but verify after hero decision. | P2 | — |

### Detail screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| Resume button shows no timestamp: Plex shows "Resume from 23:45" directly on the Play button. We show only "Resume". `formatTimeRemaining` (detailScreen.js:98) already computes the string — it just needs to be appended to `buildPlaybackActionsHtml` (line 742). | **P0** | b8-free |
| Movie detail missing cast, director, studio: Plex surfaces director, up to 5 cast names, studio, and collection badge on movie detail. We show year, duration, content rating, genres, and IMDb rating only. Would need to render `metadata.Director`, `metadata.Role`, `metadata.Studio` fields in `renderMovieDetail` around line 910. | P1 | b8-cheap |
| No "Up Next" episode card on episode detail: Plex shows a small next-episode card below the actions. We have an episode picker modal but no persistent "Up Next" surface. Would load next episode from `seasonEpisodes` after `ensureSeasonEpisodesLoaded` resolves; render a mini-card below the action row in `renderEpisodeDetail` around line 840. | P1 | b8-cheap |
| "More Like This" rail: we DO load related hubs via `loadRelatedHubs` (detailScreen.js:939). No gap. | — | — |
| Subtitle/audio picker: we open a modal with the full language list. Matches Plex's modal pattern. No gap. | — | — |
| Quality picker: we show profile labels (Auto, Original, bitrate tiers). Matches Plex. No gap. | — | — |

### Library screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| No filter/sort bar: Plex shows All / Unwatched / Genre / Year / Rating / Sort-by controls. We have a flat grid with only a "Scan" button. Would need a filter bar component above `#media-grid` and sort/filter params added to the `browseByType` API call. | P1 | b8-costly |
| Grid view with poster cards: present, `data-cols="6"`. Matches Plex. No gap. | — | — |
| No letter-jump for large libraries: Plex shows a letter-index sidebar or chip row for libraries > ~200 items. We cap at 500 with a notice. A simple async alpha-group approach would be b8-cheap; a synchronous index over 500 items is b8-no-go. | P2 | b8-cheap (async) / b8-no-go (sync) |
| Grid not virtualised: all grid cards rendered into DOM at once. At 500 items (cap) this is ~3,500 DOM nodes just for the grid. See Pass C. | P1 | b8-costly |

### Search screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| Real-time results as you type: 350 ms debounce, results stream via `onRow` callback. Solid parity. | — | — |
| Results by type (Movies / Shows / Episodes): server returns categorised hubs, rendered via `renderHubRow`. Parity confirmed. | — | — |
| On-screen keyboard: native `<input type="search">` with webOS on-screen keyboard on click. Matches Plex approach on webOS. | tv-na | — |

### Player screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| Chapter markers on seek bar: Plex renders tick marks at chapter boundaries on the seek track. We have no chapter UI. Would need Plex chapter data (`/library/metadata/{key}/chapters`) and small `<span>` tick elements inside `.player-seek-track` (playerScreen.js:230). | P2 | b8-cheap |
| Skip intro/credits: fully implemented with dynamic button. No gap. | — | — |
| "Up Next" episode countdown overlay: fully implemented (`#player-autoplay-panel`). No gap. | — | — |
| In-player audio/subtitle/quality switching: fully implemented via track modal. No gap. | — | — |
| Scrub preview thumbnails: fully implemented via storyboard sprite sheets. No gap. | — | — |

### Settings screen

| Gap | Priority | B8 cost |
|-----|----------|---------|
| No dedicated Appearance section: Plex offers subtitle style, UI theme choices. We embed limited appearance controls inside Playback. | P2 | b8-free |
| No dedicated Quality section: quality profiles accessible via detail screen and player, not as a top-level settings section. | P2 | b8-free |
| Overall structure (Account, Plex Home, Watchlists, Playback, Network, About, Developer): covers Plex's core surfaces. No critical gap. | — | — |

---

## 4. Pass C — Performance Audit

*Existing risks in the code today, separate from A/B findings.*

### CSS transitions

| Location | Property | Cost | Fix |
|----------|----------|------|-----|
| `app.css:236` — `.browsing-hub-nav-host` | `width` 160 ms | **b8-costly** | Replace with `transform: translateX` on a fixed-width panel, or drop the animation entirely |
| `app.css:2524` — `.player-seek-thumb` | `width`, `height`, `margin` (+ box-shadow) | **b8-costly** | Replace with `transform: scale()` + `box-shadow` only; pre-set final dimensions and scale down at rest |
| `app.css:2444` — `.player-scrub-preview-thumb` | `box-shadow` blur 28 px on a JS-positioned element | **b8-costly** | Remove or reduce blur; the preview thumb repaints on every scrub tick |

### DOM / virtualisation

| Location | Issue | Cost |
|----------|-------|------|
| `virtualRow.js:60` — row window shift | `innerHTML = ''` wipes and rebuilds full rendered slice (~26 card subtrees) on every window boundary crossing | b8-costly (but bounded; acceptable for rows, monitor on slow scroll) |
| `libraryScreen.js` — grid | Library grid renders ALL items into DOM at once (no virtualisation). At the 500-card cap: ~3,500 DOM nodes. `getFocusables` on this grid can be very slow. | **b8-costly** — virtualise the grid or cap visible rows |

### Layout queries in scroll paths

| Location | Issue | Cost |
|----------|-------|------|
| `posterImages.js:491–519` — `hydrateRowViewport` | Up to 52+ `getBoundingClientRect` calls per card per scroll-end (debounced 120 ms). Manageable for rows (26 DOM nodes) but the per-card linear scan runs on the debounce timer's tick. | b8-cheap (mitigated by debounce) |
| `posterImages.js:522–551` — `hydrateGridViewport` | Same pattern on the non-virtualised grid. At 500 cards this could be hundreds of `getBoundingClientRect` calls per scroll event. | **b8-costly** |
| `focus.js:747–753` — sidebar spatial-nav | O(zones × focusables) `getBoundingClientRect` calls per Right-keypress from sidebar. Negligible on home/detail, but on library screen with hundreds of focusable grid cards this could bust the 33 ms keypress budget. | b8-costly on library |

### Memory / listener leaks

| Location | Issue | Cost |
|----------|-------|------|
| `settingsScreen.js:127` — `openTextInputModal` | Adds `document.addEventListener('keydown', onKey, true)` (capture). Removed in modal `close()`. If the user navigates away while the modal is open, `settingsScreen.destroy()` does NOT call `close()` — the capture listener persists on `document` and intercepts all subsequent keypresses. | **b8-costly** |
| `playerScreen.js` — all document listeners | All `mousemove`, `mousedown`, `keydown`, `MOTION_CURSOR_*` listeners confirmed removed in `destroy()`. Clean. | b8-free |
| `detailScreen.js` — all document listeners | `keydown` listener confirmed removed. `attachFocusNav` detached. Clean. | b8-free |
| `focus.js:531–535` — module-level pointer tracker | `mousedown` + `click` on `document` for `notePointerInteraction`. Intentional, persistent, trivial (`Date.now()` write). Not a leak. | b8-free |

### Backdrop loading

| Location | Issue | Cost |
|----------|-------|------|
| `detailScreen.js:542–557` — `applyDetailBackground` | Loads backdrop via `loadUltraBlurBackdrop`. Only one backdrop per screen; not animated; CSS `background-image` (off-thread decode in theory). Cost depends on whether `ultrablur.js` caps the URL to a resized image or fetches full 1080p (~1–2 MB JPEG). If full resolution: b8-costly (large decode on eMMC + GPU upload). Verify `ultrablur.js` uses a Plex thumb `?width=1920` (or smaller) param. If not, cap to 1280 px wide. | b8-cheap (if thumbed) / b8-costly (if full-res) |

---

## 5. Roadmap

Each item is small enough for a single session. Priority tags per Pass B; B8 cost tags per Pass C.

| # | Priority | Screen | Effort | Scope | B8 |
|---|----------|--------|--------|-------|----|
| 1 | **P0** | Detail | XS | Add resume timestamp to Play button label in `buildPlaybackActionsHtml` (detailScreen.js:742). Change `'Resume'` → `'Resume from ' + formatTimeRemaining(item)`. | b8-free |
| 2 | P1 | CSS | XS | Add `color-scheme: dark` to `:root` in `app.css` + `<meta name="color-scheme" content="dark">` to `index.html`. | b8-free |
| 3 | P1 | CSS | XS | Add `<meta name="theme-color" content="#0a0a0f">` to `index.html`. | b8-free |
| 4 | P1 | CSS | S | Replace sidebar `width` transition with a `transform`-based approach (or remove the transition). `app.css:236`. | b8-free |
| 5 | P1 | Player | XS | Add `role="slider" aria-valuemin="0" aria-valuemax="100"` to seek bar static HTML (playerScreen.js:229). | b8-free |
| 6 | P1 | CSS | S | Fix seek-thumb transition — replace `width`/`height`/`margin` with `transform: scale()` + `box-shadow` only (app.css:2524). | b8-free |
| 7 | P1 | CSS | S | Tokenise the 7 hardcoded hex colors (app.css:806,815,825,443,923,1966,2345,2364,3735) — map to existing or new `:root` tokens. | b8-free |
| 8 | P1 | Components | XS | Add `aria-label` to each `<button>` in `browsingHubNav.js` to guard collapsed icon-only state. | b8-free |
| 9 | P1 | Settings | XS | Fix `openTextInputModal` listener leak: call modal cleanup in `settingsScreen.destroy()` (settingsScreen.js:455). | b8-free |
| 10 | P1 | Components | XS | Fix progress bar ARIA in `mediaCard.js:213` — replace `aria-hidden` with `role="progressbar"` + value attributes. | b8-free |
| 11 | P1 | Components | XS | Fix `loadingOverlay.js:17` — replace `role="progressbar"` (invalid without values) with `role="status" aria-live="polite"`. | b8-free |
| 12 | P1 | Detail | XS | Add `aria-labelledby="detail-modal-title"` to `#detail-modal-sheet` (detailScreen.js:760). | b8-free |
| 13 | P1 | Search | XS | Add `aria-label="Search"` to `#search-input` (searchScreen.js:49). | b8-free |
| 14 | P1 | Settings | XS | Add `for` attributes to settings `<label>` elements (settingsScreen.js:283–295). | b8-free |
| 15 | P1 | CSS | XS | Fix `.watchlist-row-link:focus` — add box-shadow ring, not just color (app.css:387). | b8-free |
| 16 | P1 | CSS | XS | Fix `.detail-watchlist-btn:focus` — add box-shadow ring (app.css:1687). | b8-free |
| 17 | P1 | CSS | XS | Fix `.detail-season-link` — add to outline:none list + add paired `:focus` ring (app.css:1848). | b8-free |
| 18 | P1 | Home | S | Pin "Continue Watching" row to position 0 in `renderRowsIntoFeed` (homeScreen.js:98). Client-side hub sort by `hubIdentifier`. | b8-free |
| 19 | P1 | Detail | M | Add cast/director/studio block to `renderMovieDetail` (detailScreen.js:~910). Use existing `item.Director`, `item.Role`, `item.Studio` Plex API fields. | b8-cheap |
| 20 | P1 | Detail | M | Add "Up Next" episode mini-card to `renderEpisodeDetail` (detailScreen.js:~840). Load from `seasonEpisodes` after `ensureSeasonEpisodesLoaded`. | b8-cheap |
| 21 | P1 | Library | L | Virtualise library grid — apply `virtualRow`-style DOM windowing to `.media-grid` in `libraryScreen.js`. Currently renders all ≤ 500 cards at once. | b8-costly (essential) |
| 22 | P1 | Library | L | Add filter/sort bar to library screen above `#media-grid`. Needs UI component + `browseByType` API sort/filter params. | b8-costly |
| 23 | P1 | Backdrop | S | Verify `ultrablur.js` caps backdrop URL to ≤ 1280 px wide (`?width=1280`). If not, add the param in `applyDetailBackground` (detailScreen.js:542). | b8-cheap |
| 24 | P2 | Player | M | Add chapter markers to seek bar: fetch chapter data from Plex API, render `<span>` tick elements in `.player-seek-track` (playerScreen.js:~230). | b8-cheap |
| 25 | P2 | Home | XL | Hero featured item above hub rows: full-width backdrop, title, synopsis, Play button. New component needed above `home-feed` in `homeScreen.js`. | b8-costly |
| 26 | P2 | Library | M | Async letter-jump chip row for large libraries. Build alpha index as a background pass; render chips above grid. | b8-cheap |

**Effort key:** XS = minutes, S = ~1 hr, M = 2–4 hrs, L = half-day, XL = multi-day.

---

## 6. Intentional Non-Goals

Features we will **not** pursue due to LG B8 hardware constraints. These are closed decisions — no need to revisit next session.

| Feature | Plex has it? | Why we skip |
|---------|-------------|-------------|
| `backdrop-filter: blur` for glass/frosted UI panels | Yes | b8-no-go — Chromium 53 ignores or CPU-renders it. Would cause visible jank on every modal or overlay open. |
| Animated hero backdrop (crossfade between items) | Yes | b8-no-go — Sustained GPU compositor pressure on Mali-G51. Static backdrop only. |
| Animated gradient backgrounds | Partial | b8-no-go — Any `@keyframes` animating `background-position` or `background` triggers software rendering on B8. |
| `filter: blur()` on poster images for hover states | Some clients | b8-no-go — Blur filter is not compositor-accelerated on Chromium 53; repaints on every frame. |
| Synchronous full-library letter index (client-side) | Emby | b8-no-go — Building a sorted alpha index over 500+ items synchronously blocks the main thread. Use async approach (item 26) if implemented. |
| `mix-blend-mode` overlay effects | Some | b8-no-go — Forces software compositing on this GPU. |
| `will-change: transform` pre-promotion on many elements | Common pattern | b8-no-go — Promotes elements to GPU layers; with limited VRAM (~500 MB effective) mass-promotion causes layer eviction jank worse than the problem it solves. Use sparingly (animation-active elements only). |
| Cast/people photos in cast rail | Plex | b8-costly — Cast photo rail requires a new poster hydration path for people images. Deferrable; text-only cast list (item 19) is b8-cheap and ships first. |
