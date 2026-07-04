# B8 Snappiness Plan — 4 sequential agent phases (2026-07-04)

Mission: make the app feel snappy on the LG B8 (webOS 4, Chromium 53, single slow
main thread) by replacing main-thread work (JPEG decode, per-frame layout) with
compositor work and intentional scheduling. Every change here was diagnosed from
real on-device numbers (see Baselines) captured by the jank scoreboard that is
already deployed and working.

**Read this whole file before writing any code. Then read
`docs/design-system/component-registry.md` (Motion section + the entry for the
component you touch).**

---

## Ground rules (NON-NEGOTIABLE — these encode hard-won on-device failures)

1. **Workspace**: work ONLY in this worktree
   (`/Users/alechenderson/Vibe Codes/XPlay2-motion-aliveness`, branch
   `motion-aliveness`). NEVER touch `/Users/alechenderson/Vibe Codes/XPlay 2`
   (another Claude instance may be editing it concurrently).
2. **Git**: NEVER `git stash`/`pop`, never rebase, never push, never force
   anything. Local additive commits only. `node_modules` here is a symlink that
   git sometimes picks up — NEVER `git add -A` / `git add .`; always add explicit
   paths, and check `git status` before committing that `node_modules` is not
   staged (if it is: `git rm --cached node_modules`).
3. **Gate**: `npm test` must pass before every commit. It includes (a) an eslint
   `no-undef` pass and (b) a Chrome53 CSS-compat lint that bans modern CSS unless
   the line carries `/* chrome53-ok */`. If the CSS lint flags you, fix the CSS —
   do not sprinkle markers to silence it (markers are for proven-safe exceptions
   only).
4. **Chrome 53 rules** (the app runs on this engine over `file://`):
   - Animate **transform + opacity ONLY**. Never animate width/height/margin/
     top/left/box-shadow/filter. (Phase 4 exists to fix the one violation.)
   - No `:focus-within` (Chrome 53 drops the whole rule). Expansion state =
     JS-toggled classes.
   - No `inset:` shorthand — longhand `top/right/bottom/left`.
   - No `-webkit-line-clamp`, no `gap` in flex, no CSS `linear()`.
   - Column-flex children: size to content (`flex: 0 0 auto`), never `flex: 1`
     (Chrome53 compression bug).
   - JS is Babel-transpiled (browserslist chrome 53) — write normal ES modules,
     but no runtime APIs newer than Chrome 53 without feature detection
     (`img.decode` is 64+, `createImageBitmap` options are unreliable,
     `IntersectionObserver` absent).
5. **Design protocol**: before editing any UI file, state
   `Registry: <entry> — <status>` from `docs/design-system/component-registry.md`.
   After a change that alters behavior/anatomy, update the registry entry (the
   Motion/Instrumentation sections for perf work).
6. **No deploying**: do NOT run `ares-*`, do not start/kill log receivers, do not
   touch ports. On-device validation is done by the parent session between
   phases. Your DONE state is: tests green + commit + a short report of what to
   validate on-device.
7. **Perf instrumentation is sacred**: keep every existing `tvLog`/`mark`
   breadcrumb (`jank:*`, `anim:*`, `detail:backdrop-swap`, etc.) working. If you
   move code, move its breadcrumb with it.
8. **Commit format**: conventional commits, one commit per phase, ending with
   `Co-Authored-By:` line naming your model.

## Baselines (measured on the real B8, 2026-07-04, build a0d9878)

| Channel | Today | Target after this plan |
| --- | --- | --- |
| `jank:rail-scroll` (horiz) | worstMs 150–650, ALL frames dropped, 1–3 frozen per move | worstMs <100, frozen 0 in steady browse |
| `jank:navigation` detail | worstMs 1212, busyMs 1984 (backdrop decode, breadcrumb-confirmed) | worstMs <300 |
| `jank:sidebar` expand/collapse | worstMs 323–723, busyMs 615–933 | worstMs <120, frozen 0 |
| `anim:screen-enter-fade` home re-entry | startDelayMs 1506 (fade never ran) | startDelayMs <400 |

Root cause behind all of them: synchronous JPEG decode and per-frame layout on
the single main thread. The fixes below replace those with compositor work or
deliberate scheduling ("one thing at a time") — never by deleting motion.

---

## Phase 1 — Gate poster decode behind rail glides + trickle drain

**Model: Sonnet 5. Files: `src/ui/transitionGate.js`, `src/ui/focus.js`,
`docs/design-system/component-registry.md`, tests.**

The D-pad glide (`smoothScrollCarousel` / `smoothScrollVertical` in
`src/ui/focus.js`) is innocent — the freeze is posters decoding the moment
scrolling reveals them. All poster binds already route through the single choke
point `bindPosterImage` (`src/ui/posterImages.js`), which already defers via
`onIdle()` when `isTransitioning()` — so the fix is to make glides open the gate.

1. **`transitionGate.js` — add `extendTransition(ms)`**: like `beginTransition`
   but never shortens: `transitionUntil = Math.max(transitionUntil, now + ms)`,
   arming the same safety timeout. Export it.
2. **`transitionGate.js` — trickle drain**: `flushIdleQueue` currently runs the
   whole queue in one synchronous loop — that dump is the measured 1506ms home
   re-entry stall (every deferred poster decodes in one task). Rework: drain ONE
   callback per macrotask (`setTimeout(0)` chain). Rules:
   - A `draining` flag prevents double-drains (endTransition + safety timer can
     both fire).
   - If `beginTransition`/`extendTransition` re-opens the gate mid-drain, STOP
     the chain; remaining callbacks stay queued for the next drain.
   - Preserve the existing semantics: a callback that itself calls `onIdle`
     queues for a later drain, never the current one; one throwing callback must
     not starve the rest.
3. **`focus.js`**: at each real glide start (both scroll fns, right where
   `sampleGlide(...)` is called), `extendTransition(300)` (150ms glide + settle
   headroom; a held key keeps extending, so posters resolve when input stops —
   that is the intended Netflix-style behavior, not a bug). Import from
   `../ui/transitionGate.js` — transitionGate is dependency-free, no cycle risk.
4. **Tests**: add unit tests (follow the existing `node --test` layout — look at
   how current tests import modules) for: extendTransition never shortens;
   trickle drain runs one-per-task; re-opening mid-drain pauses it; throwing
   callback doesn't kill the chain.
5. Update the registry Motion→choreography paragraph: glides now extend the
   window; drain is one-per-macrotask.

**On-device validation (parent does this)**: `jank:rail-scroll` worstMs <100;
home re-entry `anim:screen-enter-fade` startDelayMs 1506 → <400; posters visibly
fill in on scroll-stop (expected, intentional).

Commit: `perf(motion): gate poster decode behind rail glides + trickle idle drain`

---

## Phase 2 — Native corner-wash backdrop (kill the ultrablur JPEG)

**Model: Sonnet 5. Files: NEW `src/ui/colorWash.js`, NEW
`scripts/gen-noise-png.cjs`, `src/ui/screens/detailScreen.js`,
`src/plex/ultrablur.js`, registry, tests.**

Context: the detail backdrop today fetches 4 corner colors from PMS
(`/services/ultrablur/colors`), paints a CSS gradient, then "upgrades" to a
**1280×720 JPEG that is just that same gradient + noise**, whose decode is the
measured 1212ms freeze. The JPEG's only value is noise dithering (OLED banding)
and bilinear corner blending. Both are reproducible natively for ~0ms.

1. **`src/ui/colorWash.js`** (new, dependency-free):
   - `buildCornerWashCss(colors)` — `colors = {topLeft, topRight, bottomRight,
     bottomLeft}` (hex strings, no `#`). Returns a `background-image` value:
     noise tile layer (top), then 4 corner-anchored radial gradients, e.g.
     `radial-gradient(circle at 0% 0%, rgba(r,g,b,1) 0%, rgba(r,g,b,0) 62%)`
     for topLeft, etc. Include a `hexToRgba` helper. Caller pairs it with
     `background-color` = one of the corners (pick bottomLeft) so uncovered
     center never shows through.
   - `NOISE_TILE_URL` — a `url(data:image/png;base64,...)` constant: a small
     (~48×48) transparent PNG of random low-alpha (≤5%) monochrome noise,
     `repeat`. Generate it ONCE with `scripts/gen-noise-png.cjs` (node built-ins
     only: construct the PNG by hand — IHDR/IDAT via `zlib.deflateSync`/manual
     CRC — ~40 lines; commit the script, paste the base64 output as the
     constant). Do NOT add an npm dependency for this.
2. **`detailScreen.js`** (`applyDetailBackground`, ~line 747): keep the `onIdle`
   + `loadUltraBlurBackdrop` colors flow and all token/destroyed guards. When
   colors arrive: apply `DETAIL_BG_GRADIENT + ', ' + buildCornerWashCss(colors)`
   plus the background-color, and log the existing
   `tvLog('perf', 'detail:backdrop-swap')` breadcrumb at that moment (keep the
   name — it anchors the jank-attribution timeline). DELETE the entire
   `new Image()` / `swap()` / `imageUrl` upgrade branch — the JPEG path dies on
   ALL engines (it has no advantage over the native wash anywhere).
   `buildUltraBlurColorGradient` import goes away (colorWash replaces it).
3. **`ultrablur.js`**: `loadUltraBlurBackdrop` keeps its cached
   `{colors, imageUrl}` shape (the persisted cache holds old entries — callers
   just ignore `imageUrl` now; note this in a comment). Remove
   `buildUltraBlurImageUrl`/`buildUltraBlurImagePath`/`buildUltraBlurColorGradient`
   ONLY if `grep` proves no other callers (check `homeScreen.js`,
   `appearance*`). `homeScreen.js`'s detail-warm prefetch of
   `loadUltraBlurBackdrop` stays — it now warms colors, still valid.
4. **Tests**: colorWash output contains 4 `radial-gradient(` layers + the noise
   url; hexToRgba handles 3- and 6-digit hex; output passes the Chrome53 CSS
   lint patterns (no `inset:` etc. — the lint only scans .css files, but keep
   the generated string conservative anyway since it lands in inline styles).
5. Registry: update the Detail screen entry (backdrop anatomy = native wash) and
   the Motion/choreography paragraph.

**On-device validation (parent)**: `jank:navigation` detail worstMs 1212 → <300;
`detail:backdrop-swap` still on the timeline; HUMAN eyeball: no visible banding
on the OLED (the noise tile's job).

Commit: `perf(detail): native corner-wash backdrop — kill the ultrablur JPEG decode`

---

## Phase 3 — Layered immersive hero (home): ambient wash → soft bleed → crisp subject

**Model: Opus. Files: `src/ui/screens/homeScreen.js`, `src/styles/app.css`,
NEW `src/ui/palette.js`, reuse `src/ui/colorWash.js`, registry, tests.**

Problem being solved: the hero art is a 796px 16:9 box top-right; everything
else is flat `#131313`. On sparse homes (Jellyfin, new users) the screen looks
empty. Design answer (user-approved "Option C"): three layers, cheapest first,
each appearing when ready — **color leads, image follows**. Total decode cost
must stay identical to today (ONE 720px art decode per settle; we reuse its
bytes and pixels for everything).

**Anatomy** (bottom → top inside `.screen-home`):
1. `il-ambient` — TWO full-screen wash layers (a/b, same crossfade pattern as
   the existing `il-hero__backdrop--a/b`): `buildCornerWashCss(palette)` from
   the focused item's palette. Opacity crossfade `var(--dur-medium1)
   var(--ease-standard)`. Sits behind ALL home content (z below sidebar, rails,
   hero). Keep max opacity subtle (~0.55 over surface-dim) — ambient tint, not
   wallpaper.
2. `il-hero__bleed` — TWO full-screen `background-size: cover` layers (a/b)
   using the SAME art URL/objectURL as the corner box, under a strong full-screen
   scrim (flat `rgba(19,19,19,0.55)` ramping to ~0.85 at the bottom and toward
   the left text column — reuse the `il-hero__scrim` gradient technique).
   720→1920 upscale = natural softness; that is intentional. Max layer opacity
   ~0.45. **Gate behind `html.caps-motion` and give it a single kill-switch
   class** (e.g. `il--no-bleed` on the screen root suppresses the layers) so if
   the B8 scoreboard objects, disabling is a one-line change.
3. Existing crisp top-right 16:9 box + its scrim + content column: UNCHANGED.

**`src/ui/palette.js`** (new):
- **THE LANDMINE, spelled out**: the app runs on `file://`, so every network
  image is cross-origin — drawing a plain `Image` to a canvas taints it and
  `getImageData` throws SecurityError. Therefore: fetch the art via **XHR as a
  Blob** (the Plex token is already in the URL query via `getArtUrl` — no
  custom headers needed), `URL.createObjectURL(blob)` → blob URLs are
  same-origin → `Image` → draw scaled to an 8×8 canvas → `getImageData` →
  average the 2×2 corner blocks → `{topLeft, topRight, bottomRight, bottomLeft}`
  hex. Wrap the read in try/catch anyway; on ANY failure resolve `null` (wash
  simply doesn't update — today's behavior, never an error state).
- `getPalette(url)` → Promise<{colors, objectUrl}>. LRU cache keyed by url, max
  ~12 entries; on evict AND on screen destroy, `URL.revokeObjectURL`. **Never
  revoke a URL still referenced by a live background layer** — evict order must
  respect the two-layer swap (simplest: only revoke on cache evict, and size the
  LRU larger than the 6-entry `ilCacheKeys` so an on-screen URL can't be
  evicted while current).
- The blob is fetched ONCE and its objectURL is used for BOTH the corner box and
  the bleed layer AND the palette — one network fetch, one decode, three uses.

**Wiring in `homeScreen.js`** (`ilUpdateHero`, existing 500ms settle debounce —
keep it; it is the scroll-thrash protection):
1. On settle: `tok = ++ilHeroToken`. `getPalette(url)`:
   - cache hit → crossfade `il-ambient` immediately (color leads).
   - miss → palette resolves with the loaded image → crossfade ambient + bleed +
     corner box together (guarded by `tok`, `destroyed` — mirror the existing
     `commit()` guard pattern exactly, including the 6s settle ceiling).
2. Replace the current plain `new Image()` load with the palette/objectURL flow,
   keeping `ilCacheTouch` and the a/b side-swap logic. The corner box's
   `background-image` now uses the objectURL.
3. `ilShowHero(false)` (sidebar focus / non-home hubs): fade BOTH ambient layers
   to opacity 0 alongside the existing content dim; restore on next update.
4. `destroy()`: clear timers (already), plus palette cache revoke-all.
5. Add breadcrumb: `tvLog('perf', 'home:hero-swap', { cached: <bool> })` at
   commit time so hero cost is attributable on the timeline.
6. Jellyfin/other backends: palette.js is backend-agnostic by design (bytes →
   canvas). Do not add any server-specific color API.

**CSS**: new layers use longhand offsets, `position: absolute`, opacity
transitions only. The bleed scrim must keep rail text/cards readable — when in
doubt, darker. Wash layers must sit under the sidebar scrim stack (check
z-index against `browsing-hub-nav-host` z:5).

**Tests**: palette corner-averaging math on a synthetic ImageData; LRU eviction
+ revoke ordering; homeScreen guards (token supersede) if the existing test
layout reaches them.

**On-device validation (parent)**: `jank:rail-scroll` unchanged vs Phase 1;
focus-settle hero swap ≤1 dropped frame (`home:hero-swap` vs `jank:rail-scroll`
timeline); sparse profile (few rails) visually "dressed"; watch GPU memory —
if the TV blanks layers or crashes, kill-switch the bleed first.

Commit: `feat(home): layered immersive hero — ambient wash + soft bleed + crisp subject`

---

## Phase 4 — Sidebar: snap-width + compositor label choreography

**Model: Opus. Files: `src/styles/app.css`,
`src/ui/components/browsingHubNav.js` (likely CSS-only + registry; JS only if a
class hook is missing), registry.**

Measured: expand/collapse freezes 323–723ms. Cause: `transition: width 180ms`
(layout every frame) + labels/section-titles/brand flipping `display:none→block`
(big reflow) all inside the transition. The motion must survive; the layout
work per frame must die.

**The design** (still feels intentional — "the drawer appears, its contents
cascade in"):
1. **Width snaps** (remove `transition: width` from BOTH hosts — `.screen-home`
   ~line 723 and `.library-screen` ~line 1415). One reflow, one frame.
2. **Make the snap frame cheap**: the reflow is expensive today partly because
   children re-lay-out at the new width AND labels enter the DOM at the same
   moment. Fix: `.browsing-hub-item` (and the section-title/brand rows) get a
   FIXED content width = expanded inner width at ALL times, so the collapsed
   96px host merely CLIPS them (`overflow: hidden` is already on the host).
   Verify the icon's x-position is identical collapsed vs expanded (the registry
   records that 96px was chosen exactly so the icon/pill doesn't shift — keep
   that true; the icon column keeps its current geometry, labels sit after it).
3. **Labels/section titles/brand wordmark: never `display`-toggle again.**
   Always in DOM: collapsed = `visibility: hidden; opacity: 0;
   transform: translateX(-8px)`; expanded = visible, `opacity: 1`,
   `translateX(0)`, transition `opacity/transform 160ms
   var(--ease-standard-decelerate)` with a small per-section
   `transition-delay` stagger (~30ms steps, cap 3 steps) — this cascade IS the
   drawer's motion now, and it's pure compositor. (`visibility` may snap; that's
   fine — opacity carries the fade. No `:focus-within`, classes only — the
   existing `--expanded`/`--peek` JS toggles stay exactly as they are.)
   The brand mark↔wordmark swap (~app.css line 1777) gets the same treatment
   (cross-fade via opacity, both always in DOM, absolutely stacked).
4. **Scrim**: already opacity-only — untouched.
5. **Check the collapsed "active label legible" rule** (browsingHubNav.js ~line
   63-65 comment) — whatever hook keeps the active item's label visible when
   collapsed must keep working with the new visibility scheme.
6. Keep `jank:sidebar` sampler exactly where it is — it is the proof.
7. Registry: update Navigation drawer (container) + Nav item entries: motion
   mechanics = snap + cascade (record it as the designed behavior, per the
   modal-drawer kit anatomy: surface + scrim over content), note the
   Chrome53 rationale.

**Watch out for**: Chrome53 flex quirks — fixed-width children inside the
column-flex host must stay `flex: 0 0 auto`; test collapsed clipping visually in
the simulator if unsure (`ares-launch -s 26 dist --simulator-path /Applications`
is allowed — it's local, not the TV).

**On-device validation (parent)**: `jank:sidebar` worstMs 323–723 → <120,
frozen 0; visual: no icon shift on expand, labels cascade, active label still
legible collapsed.

Commit: `perf(nav-drawer): snap-width + compositor label choreography — kill per-frame reflow`

---

## Runbook (parent session)

- Phases run STRICTLY in order, one agent at a time, same worktree, fresh agent
  per phase (no isolation worktrees — branch continuity matters).
- Between phases: parent builds (`NODE_ENV=production npm run package` — MUST
  set NODE_ENV or the IPK ships unminified), deploys to Alec-TV (IP drifts —
  `ares-setup-device -F` first), drives the TV, reads `logs/tv.log` against the
  Baselines table, and only then starts the next phase.
- If a phase's on-device numbers regress: revert that phase's single commit
  (`git revert <sha>`), do not pile fixes on top blind.
- Agent prompt template: "Read
  docs/plans/2026-07-04-b8-snappy-agent-plan.md in full, then execute Phase N
  exactly. Obey every Ground rule. Report: files changed, test results, what the
  parent must validate on-device."
