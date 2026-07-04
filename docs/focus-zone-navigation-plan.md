# Focus Zone Navigation — Implementation Plan

**Status:** ready to implement · 2026-07-04
**Goal:** make D-pad focus movement deterministic by adding a *zone (container) layer* with
focus memory on top of the existing geometric engine in `src/ui/focus.js`.
**Model:** the industry-standard container-first pattern (Android TV FocusFinder semantics,
BBC `lrud`, Norigin, Enact Spotlight) implemented natively — a library was evaluated and
rejected (React-bound or graph-registration-based; see git history of this decision).

This document is a complete spec. Follow it literally; where it says "decision", the
decision has already been made — do not re-litigate it. Anything not listed under
*Scope* is a non-goal.

---

## 0. Hard constraints (read first)

1. **Chrome 53 / webOS 4** is the floor engine. Allowed and already used in `focus.js`:
   `WeakMap`, `Element.closest()`, attribute selectors, `getBoundingClientRect`.
   **Match the existing file style: `var`, `function () {}` — no arrow functions, no
   `let/const`, no template literals** (Babel transpiles, but the codebase keeps source ES5-flavoured).
2. **Never use `:focus-within`** (Chrome 53 silently drops the whole rule). This plan
   requires **no CSS changes at all** — if you find yourself editing `app.css`, stop.
3. `npm test` runs an ESLint `no-undef` gate then `node --test`. New globals must be
   registered in `eslint.config.js` (this plan introduces none).
4. **Do not use `git stash`** — another Claude instance may work in this repo concurrently.
   All edits are additive; re-apply on conflict.
5. Tests run in Node against `test/helpers/minimal-dom.js` (no jsdom). Its `document` has
   **no `addEventListener`** and its `el.focus()` does **not** dispatch `focusin`. The spec
   below is written so nothing depends on those in tests.
6. All existing `test/focus-nav-*.test.js` files must pass **unmodified**. That is the
   primary regression gate: their fixtures carry no `data-focus-zone` attributes, so the
   new code paths must reduce to today's flat behavior when no zones are present.

---

## 1. Background: what exists today

- Engine: `src/ui/focus.js`. One flat geometric pass per arrow press:
  `spatialMove()` (line ~392) scores every focusable on screen
  (`strictlyInDirection` + `scoreCandidate` = primary-axis gap + cross-axis gap penalty)
  and returns the minimum. Escape hatches: `data-nav-left/right/up/down` attributes and
  `addNavOverride()` (checked first, keep them first).
- Hand-patched special cases that exist because the flat model leaks across containers:
  - Sidebar vertical wall: UP/DOWN never crosses `.browsing-hub-nav-host` ↔ content
    (`isInSideNav` checks in `spatialMove` and `getScoredCandidates`). **Keep this rule.**
  - Sidebar vertical fast-path: UP/DOWN inside the sidebar scopes the query to the host
    (perf fix for the laggy sidebar). Superseded by the generic intra-zone scoping below.
  - LEFT-from-content into the sidebar always lands the FIRST hub item
    (`spatialMove`, the block commented "LEFT that crosses from main content INTO the
    sidebar…"). Replaced by `data-focus-zone-enter` in Phase 2.
  - Detail-screen cast cards carry `data-nav-up`/`data-nav-down` hacks
    (`detailScreen.js:244`, `detailScreen.js:1499`). Removed in Phase 2.
- **Already-annotated markup that nothing consumes yet** (this plan wires it up):
  - `data-focus-zone` on: hub rail sections (`src/ui/components/hubRow.js:21`,
    value `"hub-row"`), library grid (`libraryScreen.js:62`), detail top-bar /
    primary-actions / more-menu / disclosure (`detailScreen.js:275/910/1030/1222/1346`),
    appearance screen groups (`appearanceScreen.js:78-86`), player actions / seek /
    taskbar / menu sheet (`playerScreen.js`, search for `data-focus-zone`).
  - `data-focus-mode="sequential"` (+ `data-focus-sequential-axis="horizontal"` on the two
    player rows). Also set WITHOUT an axis on four picker screens
    (`providerPickerScreen.js:28`, `pairingScreen.js:20`, `serverPickerScreen.js:57`,
    `jellyfinLoginScreen.js:29`) — those stay **inert** (see §3.4 decision).

---

## 2. Design summary

Resolution order for one arrow press (highest priority first):

1. **Seek-bar guard** — unchanged (`player-seek-bar` owns LEFT/RIGHT).
2. **Explicit override** — `data-nav-*` / `addNavOverride` — unchanged, always wins.
3. **Sequential zone** — if the focused element is inside a
   `[data-focus-mode="sequential"]` host **that declares an explicit axis**, axis keys
   step ±1 through the host's focusables in DOM order; ends clamp (no move, no wrap).
   Perpendicular keys fall through to 4/5.
4. **Intra-zone geometry** — if the focused element is inside a `[data-focus-zone]`,
   run the existing flat geometric loop scoped to that zone. If it finds a candidate,
   done. (This also generalizes the old sidebar perf fast-path: candidate sets shrink
   from ~60 rects to the zone's handful on every press — a B8 win.)
5. **Cross-zone resolution** — collect *units* in the pressed direction:
   every other zone (scored by its container rect, relaxed direction test) and every
   **zoneless** focusable (scored by its element rect, strict direction test, exactly
   today's rules). Best score wins. A zoneless winner is returned directly; a zone winner
   goes through its **entry policy**:
   1. `data-focus-zone-enter="<selector>"` → first match inside the zone (pinned entry;
      used by the sidebar so entering it always lands Home).
   2. **Focus memory** → the zone's last-focused child, if still attached and focusable
      (this is what makes DOWN-then-UP perfectly symmetric on rails).
   3. **Cross-axis alignment** → the zone child whose center is closest to the focused
      element's center on the cross axis (same column for vertical moves, same row for
      horizontal). With the anchored home rails this naturally lands the anchor-slot card.
6. **Nothing found** → `handleKeyNav`'s existing boundary behavior (vertical presses in
   content eat the event so webOS can't hijack) — unchanged.

A screen with no `data-focus-zone` anywhere exercises only steps 1, 2, 5-with-only-
zoneless-units, 6 — which is byte-for-byte today's algorithm. That is why the existing
tests must pass unmodified.

**Focus memory** is a module-level `WeakMap` keyed by the zone **element**. A re-render
that replaces the zone node naturally drops its memory (falls back to alignment) — no
lifecycle management needed. Recycled `virtualRow` cards mean memory is effectively
*positional* after a rebind; that is the desired Netflix-like behavior, not a bug.

---

## 3. Phase 1 — engine changes (`src/ui/focus.js` only)

Work in this order. After each numbered step, `npm test` must still pass.

### 3.1 Zone helpers (insert after the `isInSideNav` block, ~line 389)

```js
// --- Zone (container) navigation layer -----------------------------------------
// Screens annotate structural groups (rails, grids, button rows, the sidebar)
// with data-focus-zone. Cross-zone moves resolve zone-first: pick the best zone
// in the pressed direction, then pick the entry element inside it
// (enter-selector → remembered child → cross-axis alignment). Elements outside
// any zone keep the flat geometric behavior, so screens migrate one at a time.

var _zoneMemo = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function zoneOf(el) {
  if (!el || !el.closest) return null;
  if (_zoneMemo && _zoneMemo.has(el)) return _zoneMemo.get(el);
  var z = el.closest('[data-focus-zone]') || null;
  if (_zoneMemo) _zoneMemo.set(el, z);
  return z;
}

// Last-focused child per zone ("focus memory"). Keyed by the zone ELEMENT so a
// re-render that replaces the zone drops its memory with it.
var _zoneMemory = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
function rememberZoneFocus(el) {
  if (!_zoneMemory || !el) return;
  var z = zoneOf(el);
  if (z) _zoneMemory.set(z, el);
}
```

### 3.2 Sequential mode (insert after the zone helpers)

Decision: sequential applies **only when `data-focus-sequential-axis` is present** on the
host. The four picker screens that set `data-focus-mode="sequential"` without an axis
remain on geometry (zero regression risk; wiring them is a separate follow-up).

```js
// Sequential zones: axis keys walk the host's focusables in DOM order,
// clamped at the ends. Only active when the host declares an explicit
// data-focus-sequential-axis (the picker screens that set the mode without an
// axis intentionally stay on geometry). Returns:
//   undefined — not in a sequential host / perpendicular key → caller continues
//   null      — clamped at an end (handled, no move)
//   element   — the step target
function sequentialStep(active, key) {
  if (!active || !active.closest) return undefined;
  var host = active.closest('[data-focus-mode="sequential"]');
  if (!host) return undefined;
  var axis = host.getAttribute('data-focus-sequential-axis');
  if (!axis) return undefined;
  var delta = 0;
  if (axis === 'horizontal') {
    if (key === ARROW_RIGHT) delta = 1;
    else if (key === ARROW_LEFT) delta = -1;
  } else {
    if (key === ARROW_DOWN) delta = 1;
    else if (key === ARROW_UP) delta = -1;
  }
  if (!delta) return undefined;
  var list = getFocusables(host);
  var idx = list.indexOf(active);
  if (idx < 0) return undefined;
  return list[idx + delta] || null;
}
```

### 3.3 Direction test for zone rects and the entry policy

Zone rects are big, so the strict per-element containment conditions in
`strictlyInDirection` would wrongly reject them; use an edge test with a small epsilon:

```js
// A zone qualifies when its near edge lies beyond the focused ELEMENT's far
// edge in the pressed direction (8px epsilon tolerates label padding overlap).
var ZONE_EDGE_EPS = 8;
function zoneInDirection(a, z, key) {
  if (key === ARROW_UP) return z.bottom <= a.top + ZONE_EDGE_EPS;
  if (key === ARROW_DOWN) return z.top >= a.bottom - ZONE_EDGE_EPS;
  if (key === ARROW_LEFT) return z.right <= a.left + ZONE_EDGE_EPS;
  if (key === ARROW_RIGHT) return z.left >= a.right - ZONE_EDGE_EPS;
  return false;
}

// Entry policy for a zone being entered from aRect via `key`:
// enter-selector → remembered child → cross-axis alignment.
function pickZoneEntry(zone, aRect, key) {
  var sel = zone.getAttribute('data-focus-zone-enter');
  if (sel) {
    try {
      var pinned = zone.querySelector(sel);
      if (pinned && isNavFocusable(pinned)) return pinned;
    } catch (e) { /* invalid selector — fall through */ }
  }
  var mem = _zoneMemory && _zoneMemory.get(zone);
  if (mem && zone.contains(mem) && isNavFocusable(mem)) return mem;
  var list = getFocusables(zone);
  var vertical = key === ARROW_UP || key === ARROW_DOWN;
  var aMid = vertical ? aRect.left + aRect.width / 2 : aRect.top + aRect.height / 2;
  var best = null;
  var bestD = Infinity;
  for (var i = 0; i < list.length; i++) {
    var r = rectOf(list[i]);
    if (!r) continue;
    var mid = vertical ? r.left + r.width / 2 : r.top + r.height / 2;
    var d = Math.abs(mid - aMid);
    if (d < bestD) { bestD = d; best = list[i]; }
  }
  return best;
}
```

### 3.4 Cross-zone resolution

Zones and zoneless focusables compete in ONE scored pass so mixed screens (some elements
annotated, some not) stay fully reachable and unannotated screens behave exactly as today.

```js
// Cross-zone move: other zones (scored by container rect) and zoneless
// focusables (scored by element rect, today's flat rules) compete in one pass.
function crossZoneMove(container, active, aRect, activeZone, key) {
  var vertical = key === ARROW_UP || key === ARROW_DOWN;
  var activeSideNav = isInSideNav(active);
  var best = null;
  var bestScore = Infinity;
  var bestIsZone = false;

  var zones = container.querySelectorAll('[data-focus-zone]');
  for (var i = 0; i < zones.length; i++) {
    var z = zones[i];
    if (z === activeZone) continue;
    if (z.contains(active)) continue;                    // ancestor of active
    if (activeZone && activeZone.contains(z)) continue;  // nested in active zone
    var zr = rectOf(z);
    if (!zr) continue;
    if (!zoneInDirection(aRect, zr, key)) continue;
    // The sidebar wall: UP/DOWN never crosses sidebar ↔ content.
    if (vertical && isInSideNav(z) !== activeSideNav) continue;
    if (!getFocusables(z).length) continue;              // skeleton/empty zone
    var s = scoreCandidate(aRect, zr, key);
    if (s < bestScore) { bestScore = s; best = z; bestIsZone = true; }
  }

  var list = getFocusables(container);
  for (var j = 0; j < list.length; j++) {
    var c = list[j];
    if (c === active) continue;
    if (zoneOf(c)) continue; // zoned elements are represented by their zone
    var cr = rectOf(c);
    if (!cr) continue;
    if (!strictlyInDirection(aRect, cr, key)) continue;
    if (vertical && isInSideNav(c) !== activeSideNav) continue;
    var s2 = scoreCandidate(aRect, cr, key);
    if (s2 < bestScore) { bestScore = s2; best = c; bestIsZone = false; }
  }

  if (!best) return null;
  if (bestIsZone) return pickZoneEntry(best, aRect, key);
  // LEFT from content into a not-yet-zoned sidebar still lands the TOP item
  // (verbatim behavior of the old special case; unreachable once the sidebar
  // hosts carry data-focus-zone-enter — removed in the annotation phase).
  if (key === ARROW_LEFT && !activeSideNav && isInSideNav(best)) {
    var hubHost = sideNavHostOf(best);
    var firstHub = hubHost && hubHost.querySelector('.browsing-hub-item');
    if (firstHub && isNavFocusable(firstHub)) return firstHub;
  }
  return best;
}
```

### 3.5 Rewrite `spatialMove`

Extract the current candidate loop body into a helper so intra-zone reuse is literal,
then replace `spatialMove` with:

```js
// Flat geometric pass scoped to `scope` (the old spatialMove loop, verbatim
// rules). Used for intra-zone moves.
function flatGeometricMove(scope, active, aRect, key) {
  var list = getFocusables(scope);
  var best = null;
  var bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c === active) continue;
    var cRect = rectOf(c);
    if (!cRect) continue;
    if (!strictlyInDirection(aRect, cRect, key)) continue;
    var score = scoreCandidate(aRect, cRect, key);
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function spatialMove(container, key) {
  var active = document.activeElement;
  if (isPlayerSeekBar(active) && (key === ARROW_LEFT || key === ARROW_RIGHT)) {
    return null;
  }
  var override = resolveNavOverride(active, key);
  if (override) return override;
  var aRect = rectOf(active);
  if (!aRect) return null;

  var seq = sequentialStep(active, key);
  if (seq !== undefined) return seq;

  var activeZone = zoneOf(active);
  if (activeZone) {
    var inner = flatGeometricMove(activeZone, active, aRect, key);
    if (inner) return inner;
  }
  return crossZoneMove(container, active, aRect, activeZone, key);
}
```

Notes:
- The old sidebar UP/DOWN scoping block (`scope = activeHost`) and the old
  LEFT-into-sidebar block at the end of `spatialMove` are DELETED here — the sidebar
  wall lives in `crossZoneMove`, the scoping is generalized by intra-zone, and the
  LEFT special case moved verbatim into `crossZoneMove`'s zoneless branch.
  (The sidebar perf fast-path is fully restored in Phase 2 when the sidebar host
  becomes a zone; between phases the wall checks keep behavior correct.)
- `handleKeyNav`, `getScoredCandidates`, the watchdog, scrolling, and the editable-input
  block are **untouched** in Phase 1 except for §3.6.

### 3.6 Record focus memory

Two recording points (both needed):

1. In `handleKeyNav`, immediately after `target.focus();` add
   `rememberZoneFocus(target);` — deterministic for unit tests (minimal-dom's `focus()`
   fires no events).
2. In `attachFocusNav`'s `onFocusIn`, after `lastFocused = t;` add
   `rememberZoneFocus(t);` — covers pointer clicks, `restoreFocus`, and screens' own
   `.focus()` calls in the real app (focusin bubbles).

### 3.7 Exports

Add to the export list: `zoneOf`, `pickZoneEntry`, `crossZoneMove` are internal — export
only what tests need: `rememberZoneFocus` is exercised through `handleKeyNav`; export
`zoneOf` for the Phase 3 debug overlay. Keep all existing exports.

---

## 4. Phase 1 tests — new file `test/focus-nav-zones.test.js`

Use the conventions of `test/focus-nav-home.test.js` (import `installMinimalDom`,
`createElement`, `layout`, build fixtures with explicit rects, drive with
`handleKeyNav(screen, keyEvent(code))`, assert `document.activeElement.id`).
Zone wrappers: create a div, `setAttribute('data-focus-zone', 'name')`, give it a
`layout()` rect that bounds its children, append children to it, append it to the screen.
Reminder: minimal-dom `focus()` does not fire focusin — build memory by *navigating*
(handleKeyNav records it), not by calling `.focus()` and hoping.

Required cases (one `test()` each, names verbatim are fine):

1. **flat screens unchanged** — rebuild the exact `buildHomeFixture` geometry from
   `focus-nav-home.test.js` WITHOUT zones; assert 3-4 representative moves match today's
   results. (Belt-and-braces on top of the untouched existing suites.)
2. **intra-zone containment** — two stacked rail zones; RIGHT from the last card of
   rail 1 must NOT jump to a geometrically-near card in rail 2 when rail 1 has no
   right-candidate and rail 2's zone is not to the right (expect no move → null).
3. **cross-zone alignment entry** — rails vertically stacked with rail 2 offset 90px
   right of rail 1; DOWN from rail-1 card N lands the rail-2 card whose center-x is
   nearest (NOT the flat-geometry winner). Give explicit coordinates.
4. **focus memory round-trip** — navigate RIGHT twice inside rail 1 (memory = card 2),
   DOWN to rail 2, UP again → focus returns to rail-1 card 2, not the aligned card.
5. **enter-selector pins entry and beats memory** — sidebar zone
   (`data-focus-zone-enter=".browsing-hub-item"`) containing two hub items; navigate
   into the sidebar, out, and back in via LEFT from a bottom-row card → always lands the
   FIRST hub item.
6. **memory dies with the element** — build memory on a card, `removeChild` it,
   re-enter the zone → alignment fallback picks a surviving card
   (call `invalidateFocusableCache()` after the removal, as the app does).
7. **empty zone skipped** — a skeleton zone (no focusables) between two rails never
   wins; DOWN skips over it to the next real rail.
8. **sidebar wall holds across zones** — full-height sidebar zone left of content;
   UP from the top rail with nothing above in content → no move (and never the sidebar).
9. **sequential axis keys** — host with `data-focus-mode="sequential"`,
   `data-focus-sequential-axis="horizontal"`, three buttons laid out so flat geometry
   would pick button 3 from button 1; RIGHT steps 1→2 (DOM order), RIGHT at button 3
   returns no move (clamp), DOWN falls through to cross-zone.
10. **sequential without axis is inert** — same fixture minus the axis attribute →
    geometry applies.
11. **zoneless elements stay reachable on a mixed screen** — one zoned rail + one
    zoneless button below it; DOWN from the rail reaches the button; UP from the button
    re-enters the rail via entry policy.

Run: `node --test test/focus-nav-zones.test.js`, then the full `npm test`.

---

## 5. Phase 2 — screen annotations (+ deleting the hacks)

After each bullet, run `npm test` and keep it green. These are markup-string edits.

1. **Sidebar hosts** — on every `<nav class="browsing-hub-nav-host" …>` add:
   `data-focus-zone="sidebar" data-focus-zone-enter=".browsing-hub-item"`.
   Known sites: `src/ui/screens/homeScreen.js:32`, `searchScreen.js:45`,
   `libraryScreen.js:49`. Then `grep -rn "browsing-hub-nav-host" src` and annotate any
   further creation sites the grep reveals (watchlist/settings variants) — annotate the
   markup string that CREATES the nav, not consumers.
2. **Delete the LEFT-into-sidebar special case** from `crossZoneMove` (the block marked
   "unreachable once the sidebar hosts carry data-focus-zone-enter") — but FIRST confirm
   via grep that every `browsing-hub-nav-host` creation site got the zone attributes.
3. **Detail cast row** — in `detailScreen.js` (~line 252) add
   `data-focus-zone="detail-cast"` to `<div class="detail-cast-row row-scroll">`. Then
   DELETE the now-redundant hacks: the `data-nav-up`/`data-nav-down` attributes inside
   the cast-card template (line ~244) and the `card.setAttribute('data-nav-up', …)` at
   line ~1499. Leave the more-menu's `data-nav-*` self-pins (lines ~1020-1021) alone —
   they are intentional lateral-escape blockers.
4. **Detail chip/button rows** — grep `detailScreen.js` for the containers that hold
   `.season-chip`, `.episode-chip`, and `.detail-setting-chip` elements; add a
   `data-focus-zone` to each horizontal strip container (one zone per strip). Skip any
   strip already inside an annotated zone (check `closest`-style by reading the markup).
5. **Search screen** — add `data-focus-zone="search-input"` to the
   `<div class="search-input-row">` (`searchScreen.js:48`). Result rails come from
   `renderHubRow` and are already zoned.
6. **Watchlist / library extras** — `grep -n "tabindex\|class=\"" src/ui/screens/watchlistScreen.js`
   and check `libraryScreen.js` for focusable clusters outside `#media-grid` (filter
   strips, letter rails). Annotate each cluster container. If a screen turns out to be a
   single grid/rail already zoned, do nothing.
7. **Do NOT touch**: `settingsScreen.js` (it has bespoke capture-phase key handling,
   line ~197 comment — out of scope), the picker/pairing/login screens (sequential
   stays inert by design), `playerScreen.js` (already fully annotated), and
   `appearanceScreen.js` (already annotated).

Verification after Phase 2: `npm test`, plus a fixture-level smoke: temporarily run the
app in the simulator (`ares-launch -s 26 dist --simulator-path /Applications` after
`npm run build`) and walk Home/Detail/Search with the keyboard arrows.

---

## 6. Phase 3 — debug overlay (small, do last)

`src/ui/focusDebug.js` draws scored arrows via `getScoredCandidates` (line ~208). Add a
zone view so on-TV QA can see decisions:

- Import `zoneOf` from `focus.js`.
- When the overlay is active, outline the active element's zone (JS-set inline
  `style.outline`, no stylesheet changes) and print the resolved entry-policy stage
  (`enter-attr | memory | alignment | flat`) in the overlay's existing readout. The
  cheapest correct implementation: have `spatialMove` stash its last decision on a
  module-level `_lastNavDecision = { path: 'intra'|'cross-zone'|'sequential'|'flat', entry: '…' }`
  object and export a `getLastNavDecision()`; focusDebug renders it. Keep it dead-code
  cheap: writes are two property assignments per keypress, no allocation beyond the one
  object, and only when `isPerfEnabled()` or the debug overlay is on is it ever read.

No tests required beyond `npm test` staying green (focusDebug has none today).

---

## 7. Phase 4 — documentation & registry (required, not optional)

1. **Component registry** (`docs/design-system/component-registry.md`): add a
   *"D-pad navigation engine (foundations)"* entry near the existing Foundations notes
   with: status `✅` + date, the resolution order from §2 of this doc (one line per
   tier), the attribute vocabulary (`data-focus-zone`, `data-focus-zone-enter`,
   `data-focus-mode="sequential"` + axis, `data-nav-*` overrides), the sidebar-wall
   rule, and a pointer to this plan + `src/ui/focus.js`.
   Note that `test/component-registry.test.js` exists — run it; if it enforces entry
   shape, match the shape of neighboring entries.
2. Add one line to `docs/design-system.md` or the foundations section it keeps (if a
   navigation section exists) pointing at the registry entry. If none exists, skip.

---

## 8. Phase 5 — device verification (B8)

Per the deploy runbook (memory: fresh worktrees need the undeclared dep):

```
npm install webostvjs   # if this worktree hasn't packaged before
npm run package
ares-setup-device -F    # trust the discovered IP, it drifts via DHCP
ares-install --device Alec-TV <ipk from dist/>
```

Manual QA script on the B8 (all with the physical remote, no pointer):

1. Home: DOWN through 4 rails, then UP back — focus must retrace the exact cards
   (memory round-trip).
2. Home: RIGHT 5 cards into rail 1, DOWN, UP — returns to card 5.
3. Home: from a card in the BOTTOM rail, LEFT → sidebar must land on the top item (Home).
4. Sidebar: UP/DOWN stays inside the sidebar (wall intact), and traversal is not laggy
   (intra-zone scoping preserved the perf fix).
5. Home while rails are still skeleton-loading: DOWN must skip skeleton rows without
   focus dying (watchdog + empty-zone skip).
6. Detail: DOWN from primary actions → cast row; UP from cast → the action you left
   (memory), not a random button; DOWN from cast → rails. Confirm the removed
   `data-nav-*` hacks left no dead ends.
7. Detail: episode/season chip strips — LEFT/RIGHT stays in the strip, UP/DOWN exits
   cleanly.
8. Search: type with the on-screen keyboard (editable-key ownership untouched), then
   DOWN into results, UP back to the input.
9. Player: LEFT/RIGHT walks the transport pills in order; UP reaches the seek bar; seek
   bar LEFT/RIGHT still scrubs (guard untouched); DOWN returns to transport.
10. Library grid: arrows behave as before (grid was already one zone).
11. Regression sweep: appearance screen groups, watchlist screen, long-press Back exit
    still quits.

If anything fails on-device but passes in tests, use the Phase 3 overlay to read which
resolution path fired before changing code.

---

## 9. Acceptance criteria

- [ ] `npm test` green; **zero edits** to existing `test/focus-nav-*.test.js` files.
- [ ] New `test/focus-nav-zones.test.js` covers all 11 cases in §4.
- [ ] `focus.js` no longer contains the LEFT-into-sidebar special case or the sidebar
      vertical scoping block (both generalized), but DOES still contain the sidebar
      wall, the seek-bar guard, overrides-first, and the untouched editable-input block.
- [ ] `detailScreen.js` cast-card `data-nav-up/down` hacks removed.
- [ ] Registry entry added (Phase 4) — required by the design protocol.
- [ ] B8 QA script (§8) passes; note results in the PR/commit body.

## 10. Non-goals (do not do these)

- No library adoption, no React, no CSS changes, no `:focus-within`.
- No wiring of the axis-less sequential picker screens (follow-up).
- No changes to `settingsScreen.js` key handling, the router's Back handling, the
  watchdog, scroll physics, or the editable-input keyboard ownership block.
- No JS/rAF additions beyond what exists (B8 frame budget).
