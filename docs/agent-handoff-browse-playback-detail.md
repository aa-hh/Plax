# Agent handoff: browse, playback, episode detail

**Repo:** `/Users/alechamilton/XPlay 2`  
**Git:** `main` tracks `origin/main`; app source is largely **uncommitted** (working tree). Do not assume prior agents committed work.  
**Parent conversation:** [Browse & playback session](f8742b35-f83f-4ac2-a2cf-a71b7c1485c3)

Use this doc to spin up **one Cursor agent per package** (Section B). Copy prompts from Section C.

---

## Section A — Completed (do not redo)

### Skip intro: markers + multi-intro + visibility

- **Marker collection** from metadata, `Media`, and `Part` (`collectMarkersForItem`); wired in `mapLibraryItem` → `introMarkers` / `introMarker` — `src/playback/introMarkers.js`, `src/plex/library.js`
- **Multiple intro markers** per episode: `findIntroMarkers`, `findActiveIntroMarker`, per-marker skip via `skippedIntroMarkerKeys` + `markerKey()` — `src/playback/introMarkers.js`, `src/ui/screens/playerScreen.js`
- **Skip target** ~2s before marker end (`INTRO_SKIP_END_PAD_MS`) — `src/playback/introMarkers.js`
- **Skip Intro prompt stays visible** for the full intro window until the user skips (not hidden when transport overlay is visible); chrome uses `introPromptActive && !menuOpen && !exitConfirmVisible` — `src/ui/screens/playerScreen.js`, `src/styles/app.css` (`.player-overlay--skip-intro-active`)
- **Validation script** — `scripts/validate-intro-markers.mjs` (includes sample `type=credit` marker parse test; credits playback not implemented)

### Phase 1 browse loading (partial vs full audit list)

**Shipped:**

- **Home:** row skeletons, `loadHomeFeedPhased` (first 2 hubs, defer rest), render when **hub data** is ready — **no** `waitForPosterBatch` gate — `src/ui/screens/homeScreen.js`, `src/plex/recommendations/homeFeed.js`
- **Hub fetch concurrency cap** (default 4) via `mapPool` — `src/plex/library.js` (`loadHubRows`)
- **Library:** first page paints grid, background `fetchRest` for remaining items; deferred posters after first 24 cards — `src/ui/screens/libraryScreen.js`, `src/plex/library.js` (`browseByType` `{ progressive: true }`)
- **Poster deferral / focus prefetch** unchanged — `src/ui/posterImages.js`, `src/ui/components/mediaCard.js`
- **Episode rail styling (16:9)** on season detail — `src/styles/app.css` (`.row-scroll--episodes`), `mediaCard` `layout: 'episode'`

**Not shipped from Phase 1 audit** (safe to pick up in B2 or small follow-ups): lite hub item mapper, `cache.remember` singleflight, detail `includeChildren` dedup, `docs/perf-budgets.md` vs `virtualRow.js` naming.

### In-memory hub/metadata cache (baseline for B2)

- Namespaces + TTLs documented — `docs/caching-and-buffering.md`, `src/core/cache.js`
- Hub list + metadata + children caching — `src/plex/library.js`

### Direct play audit (documentation only)

- End-to-end pipeline explained; UX copy table; probe gaps (MKV progressive, `deviceInfo` in player, HDR warnings, `original` vs `directOnly`) — conversation audit agent `dcdf28a0`; **no product code changes** beyond existing probe/disclosure.

### Main screen loading audit (documentation only)

- Full browse architecture + phased plan — conversation audit agent `579dd837`; **Phase 2–3 not implemented** (see B2, B3).

---

## Section B — Independent work packages

Each package = **one agent session**. Run `npm run build && npm run validate` before finishing.

---

### B1 — Episode detail TV UX


| Field            | Value                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B1                                                                                                                                                       |
| **Title**        | Episode detail webOS redesign                                                                                                                            |
| **Goal**         | Dedicated **episode** detail layout (Plex WebUI information, TV interaction patterns), without regressing movie/show/season flows.                       |
| **Size**         | **L**                                                                                                                                                    |
| **Dependencies** | None (metadata fields largely exist in `mapLibraryItem`)                                                                                                 |
| **Key files**    | `src/ui/screens/detailScreen.js`, `src/styles/app.css`, `src/ui/components/mediaCard.js`, `src/ui/focus.js`, `src/core/router.js`, `src/plex/library.js` |


**Acceptance criteria**

- When `item.type === 'episode'`, show TV layout: breadcrumb/back, landscape art + progress, series title (→ show), episode title, season/ep/time-remaining line, release/duration/rating, **IMDb/audience rating** when `audienceRating` present.
- Primary **Play / Resume** + **Mark watched / unwatched**; file details as **labeled rows** (Video / Audio / Subtitles) with current value visible; OK opens picker (reuse chip/modal patterns or new modal).
- **Episode picker:** TV-friendly (horizontal strip and/or season episode grid modal) — not WebUI dropdown.
- Focus order: breadcrumb → picker → play → watch → file rows → rails.
- Navigation: series → `grandparentRatingKey`; season → season detail or episode list; breadcrumb → `parentDetail` / router back.
- Movie and show detail still work; season episode row uses existing `layout: 'episode'`.
- `npm run build` passes.

**Status: NOT DONE** — Agent `144538d4` only started exploration; `detailScreen.js` still uses one `renderDetail()` for all types (poster + generic title + setting chips). CSS has `.season-chip` / `.episode-chip` but **detail screen does not use them**.

**Exact gaps for B1**


| Requirement                                       | Current state                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Episode-only layout branch                        | Missing — single template for all types                                                  |
| Breadcrumb / back affordance                      | Missing                                                                                  |
| Landscape episode art + in-progress bar on detail | Cards have progress; detail poster is portrait thumb                                     |
| Series title link → show                          | `grandparentTitle` / `grandparentRatingKey` mapped, not shown as link                    |
| Episode vs series title hierarchy                 | Single `<h1>` with episode title only                                                    |
| Season · Ep · time remaining                      | Not on detail; only on cards                                                             |
| Clickable season                                  | Missing                                                                                  |
| `audienceRating` / IMDb                           | Mapped in `library.js`, not rendered on detail                                           |
| File details as `Label → value` rows              | Uses horizontal **chips** (`detail-setting-chip`)                                        |
| Audio/subtitle **modals** on detail               | Chips only, no modal                                                                     |
| Episode picker (modal / strip)                    | Season page uses horizontal `mediaCard` row only; no in-episode picker on episode detail |
| Focus order spec                                  | Generic `focusFirst(screen)`                                                             |
| `parentDetail` / breadcrumb back                  | `buildActiveDetailRoute` sets `parentDetail` on child nav; no breadcrumb UI              |


---

### B2 — Browse Phase 2 (cache, tiered hubs, bootstrap overlap)


| Field            | Value                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B2                                                                                                                                                                                                               |
| **Title**        | Browse loading Phase 2                                                                                                                                                                                           |
| **Goal**         | Cheaper revisits and cold start; implement **medium** items from loading audit `579dd837`.                                                                                                                       |
| **Size**         | **M**                                                                                                                                                                                                            |
| **Dependencies** | Phase 1 hub pool + no poster gate (done)                                                                                                                                                                         |
| **Key files**    | `src/core/cache.js`, `src/plex/library.js`, `src/plex/recommendations/homeFeed.js`, `src/ui/screens/bootstrapScreen.js`, `src/ui/screens/searchScreen.js`, `src/plex/search.js`, `docs/caching-and-buffering.md` |


**Acceptance criteria**

- Add `**browse` namespace** (or equivalent) for section listings; library grid revisit avoids full re-fetch when TTL valid.
- Optional **parallel library page fetch** after first paint (respect PMS; cap concurrency).
- **Tiered / stale-while-revalidate** for `hubs` (e.g. show cached rows immediately, refresh in background).
- **Bootstrap overlap:** start promoted hub list (or first hub row) while libraries still resolving, where safe.
- **Search:** stagger hub row rendering or parallel hub item load (same `loadHubRows` pool pattern as home).
- Scoped hub invalidation experiment (avoid nuking entire `hubs` on every watch tick where possible).
- Document new cache keys/TTLs in `docs/caching-and-buffering.md`.

**Audit reference (proposals #4, #6, #8, #10, #12, #14, #7)**

---

### B3 — Browse Phase 3 (library virtualization)


| Field            | Value                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B3                                                                                                                                                                                                    |
| **Title**        | Library grid virtualization                                                                                                                                                                           |
| **Goal**         | Large libraries stay within DOM/network budget on webOS.                                                                                                                                              |
| **Size**         | **L**                                                                                                                                                                                                 |
| **Dependencies** | B2 browse cache recommended first                                                                                                                                                                     |
| **Key files**    | `src/ui/screens/libraryScreen.js`, `src/ui/components/mediaCard.js`, `src/ui/posterImages.js`, `src/ui/components/virtualRow.js` (or new virtual grid), `src/plex/library.js`, `docs/perf-budgets.md` |


**Acceptance criteria**

- Library grid does **not** mount thousands of `.media-card` nodes at once.
- D-pad focus + scroll still correct; poster hydrate window matches focus/scroll.
- Progressive fetch compatible (first window + load more as user scrolls).
- Align `docs/perf-budgets.md` with actual row/grid behavior (`virtualRow.js` today renders **all** items — name is misleading).

**Audit reference (proposal #5, #15; structural phase)**

---

### B4 — Direct play clarity


| Field            | Value                                                                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B4                                                                                                                                                                                                                                                                          |
| **Title**        | Direct play UX + probe accuracy                                                                                                                                                                                                                                             |
| **Goal**         | Settings and player copy match behavior; reduce “Direct Play fails 90%” confusion.                                                                                                                                                                                          |
| **Size**         | **M**                                                                                                                                                                                                                                                                       |
| **Dependencies** | None                                                                                                                                                                                                                                                                        |
| **Key files**    | `src/playback/qualityProfiles.js`, `src/settings/playbackSettings.js`, `src/playback/capabilityProbe.js`, `src/ui/screens/detailScreen.js`, `src/ui/screens/playerScreen.js`, `src/playback/sessionController.js`, `src/platform/deviceDisplay.js`, `docs/design-system.md` |


**Acceptance criteria**

- Rename/clarify quality labels per audit (e.g. **“Original file only (no fallback)”**, **“Auto (direct → remux → transcode)”**); resolve duplicate **Original** vs **Direct play only** if appropriate.
- **MKV:** consider adding `mkv` to progressive container allowlist in probe (with LG doc caveat) so **Auto** can attempt true direct play when codecs OK.
- **Player probe** passes `deviceInfo` (same as detail) for bitrate messaging.
- Optional: HDR/DV warning when metadata implies HDR but `deviceInfo` lacks support.
- Detail disclosure mentions Auto may still play via remux.
- Player info **Mode** strings distinguish Direct Play vs Direct Stream vs Transcode.
- `npm run build` passes.

**Audit reference:** conversation agent `dcdf28a0` Section 6–7 (proposals only today).

---

### B5 — Skip credits markers


| Field            | Value                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B5                                                                                                                                                                          |
| **Title**        | Skip credits (end markers)                                                                                                                                                  |
| **Goal**         | Mirror intro skip for Plex `Marker` `type=credit`.                                                                                                                          |
| **Size**         | **M**                                                                                                                                                                       |
| **Dependencies** | Intro marker pipeline (done)                                                                                                                                                |
| **Key files**    | `src/playback/introMarkers.js` (or `creditMarkers.js`), `src/ui/screens/playerScreen.js`, `src/plex/library.js`, `src/styles/app.css`, `scripts/validate-intro-markers.mjs` |


**Acceptance criteria**

- Parse/filter `type === 'credit'` markers; expose on mapped items (e.g. `creditMarkers`).
- Player UI: **Skip Credits** (or combined prompt) during credit window; same visibility rules as intro (visible until user skips).
- Skip seek uses same end padding pattern as intro where appropriate.
- Per-marker skip keys (no global flag blocking multiple segments).
- Extend validation script for credit scenarios.
- README feature line updated if user-facing.

---

### B6 — Search loading parity with home


| Field            | Value                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **Package ID**   | B6                                                                                                              |
| **Title**        | Search browse UX parity                                                                                         |
| **Goal**         | Search feels like Home: fast feedback, hub-row pattern, no unnecessary blocking.                                |
| **Size**         | **S**                                                                                                           |
| **Dependencies** | B2 optional (hub cache helps repeat queries)                                                                    |
| **Key files**    | `src/ui/screens/searchScreen.js`, `src/plex/search.js`, `src/ui/components/hubRow.js`, `src/ui/posterImages.js` |


**Acceptance criteria**

- While debounced query runs: skeleton hub rows or row placeholders (not only centered “Searching…”).
- Results render hub rows as data arrives (parallel hub fetch via existing `loadHubRows` if `searchHubs` returns hub metas).
- Poster deferral / `primeVisiblePosters` on results container.
- Empty and error states unchanged in spirit.
- No regression to debounce (~350ms) or request cancellation (`requestToken`).

---

## Section C — Copy-paste prompts

### B1 — Episode detail TV UX

```
Implement a webOS TV episode detail experience in XPlay 2 (/Users/alechamilton/XPlay 2).

When metadata type is episode, replace the generic detail template with a TV layout: breadcrumb back, landscape episode art with watch progress, grandparent series title (navigate to show), episode title, season/ep/time-remaining, release/duration/content rating, audience/IMDb rating when present, Play/Resume + mark watched, and file detail rows (Video / Audio / Subtitles) showing label + current value with OK-to-pick modals.

Add a TV-friendly episode picker (horizontal strip and/or season episode grid modal). Wire navigation: series → grandparentRatingKey, season link → season detail, breadcrumb → parentDetail or back. Preserve movie/show/season flows.

Acceptance: logical D-pad focus order; no hover-only UI; npm run build && npm run validate pass. See docs/agent-handoff-browse-playback-detail.md B1 for gap list.
```

### B2 — Browse Phase 2

```
Implement browse loading Phase 2 for XPlay 2: browse-section cache for library grids, optional parallel section page fetch after first paint, tiered/SWR hub cache, bootstrap/home overlap (prefetch promoted hubs during bootstrap when safe), and search hub stagger/parallel load. Update docs/caching-and-buffering.md. Follow proposals in docs/agent-handoff-browse-playback-detail.md B2 (from audit 579dd837). npm run build && npm run validate must pass.
```

### B3 — Browse Phase 3

```
Implement true library grid virtualization for XPlay 2 library screen: bounded DOM for large sections, working D-pad focus and poster hydration, compatible with progressive browseByType. Fix or document virtualRow vs perf-budgets mismatch. Large change — see docs/agent-handoff-browse-playback-detail.md B3. npm run build && npm run validate must pass.
```

### B4 — Direct play clarity

```
Improve direct play clarity in XPlay 2: clearer quality profile labels in settings, MKV progressive probe consideration, pass deviceInfo into player-side probe, optional HDR warning, and player/detail copy that distinguishes Direct Play vs Direct Stream vs Transcode and notes Auto remux fallback. See docs/agent-handoff-browse-playback-detail.md B4 and prior audit (dcdf28a0). npm run build && npm run validate must pass.
```

### B5 — Skip credits

```
Add skip credits support in XPlay 2 mirroring intro markers: Plex Marker type=credit, player prompt visible until user skips, per-marker keys, seek padding. Extend scripts/validate-intro-markers.mjs. See docs/agent-handoff-browse-playback-detail.md B5. npm run build && npm run validate must pass.
```

### B6 — Search loading parity

```
Bring searchScreen loading UX in line with homeScreen: skeleton hub rows while searchHubs runs, defer posters, primeVisiblePosters on results, keep debounce and requestToken cancellation. See docs/agent-handoff-browse-playback-detail.md B6. npm run build && npm run validate must pass.
```

---

## Section D — Recommended order


| Order | Package | Rationale                                                                  |
| ----- | ------- | -------------------------------------------------------------------------- |
| 1     | **B1**  | User-facing episode detail; agent `144538d4` stalled — highest product gap |
| 2     | **B4**  | Reduces playback confusion; small surface, high support value              |
| 3     | **B6**  | Quick win; same patterns as shipped home Phase 1                           |
| 4     | **B2**  | Platform perf for daily Home/Library/Search use                            |
| 5     | **B5**  | Natural follow-up to shipped intro work                                    |
| 6     | **B3**  | Largest refactor; best after browse cache + profiling on real TV           |


**Parallelism:** B4 and B6 can run in parallel with B1 if different agents. B3 should not start until B2 is stable or explicitly scoped without browse cache.

---

## Quick verification commands

```bash
cd "/Users/alechamilton/XPlay 2"
npm run build && npm run validate
node scripts/validate-intro-markers.mjs
```

---

## Reference transcripts (optional)


| Topic                             | Agent / transcript                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Browse loading audit (Phases 1–3) | `579dd837` in [f8742b35-f83f-4ac2-a2cf-a71b7c1485c3](f8742b35-f83f-4ac2-a2cf-a71b7c1485c3) |
| Phase 1 implementation            | `6013e22d`                                                                                 |
| Direct play audit                 | `dcdf28a0`                                                                                 |
| Episode detail (not finished)     | `144538d4`                                                                                 |


