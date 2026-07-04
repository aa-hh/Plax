# TV Component Spec Registry — single source of truth

This file is the **authoritative, per-component spec record** for Plax's TV UI. It
is the *first* thing to check before building or changing any UI component, and the
*last* thing to update after building one to spec.

> **Every entry records the *canonical kit spec* (the target), never a blessing of
> the current code.** The status field says how the code relates to that target:
>
> | Status | Meaning | What an agent does |
> |---|---|---|
> | ✅ **to-spec** | code matches the recorded canonical spec | reuse as-is; no Figma needed |
> | 🚧 **diverges** | canonical spec captured, code is off-spec (deviations listed) | the recorded spec is the **target** — bring the code up to it; **never reproduce the current code** |
> | 📐 **reference** | canonical spec captured, no app instance yet | build new instances to it |
> | 📝 **summary** | behaviour captured, **anatomy not yet pulled from kit** | treat as not-yet-specced — pull anatomy before relying on it |
> | *(absent)* | not yet specced | follow the [protocol](#design-decision-protocol) to spec it, then record |
>
> So a 🚧 entry is a **fix-list, not an endorsement.** When the user says *"fix the
> library screen,"* reconcile that screen's components to their registry specs —
> ✅ and 🚧 alike mean *make the code match the recorded canonical spec.*

> **Reconciled 2026-06-20** — this file merges four parallel agent registries that
> had diverged across worktrees (the rich original `83b6a73` had been overwritten
> down to a single entry by `0ee9799`). Folded in: the settings redesign (Inline
> Edit-Toggle, Settings screen, updated Button), the Jellyfin backend (Provider
> picker, Login, User picker), and the Home rail motion spec. **Commit this file** —
> see Maintenance.

Related: [design-system.md](../design-system.md) (10-foot UX + behaviour),
[google-tv-foundation.md](../google-tv-foundation.md) (adoption rationale),
[google-tv-figma-tokens.md](../google-tv-figma-tokens.md) (Material 3 blue tokens).

---

## Design Decision Protocol

Run this **whenever a design decision is needed** — adding a new component, changing
a component's sizing/spacing/states/focus, or reconciling a visual.

1. **Check this registry first.** If the component is listed, the recorded spec is
   the **canonical target** — don't re-query Figma. Status ✅ → code already matches,
   reuse. Status 🚧 → reconcile the code *up to* the recorded spec (do not copy the
   current off-spec code). Only go to step 2 if the component is **absent**.
2. **Read the Android TV guideline** for that component class — see the
   [guideline map](#android-tv-guideline-map). These are the *general rules*.
3. **Pull the exact spec from the TV Design Kit (Figma MCP).** Look the component up
   in the [node-id index](#figma-node-id-index), then:
   - `get_design_context` (fileKey + node-id) → component decomposed into named parts
     (= the anatomy) + geometry
   - `get_variable_defs` (fileKey + node-id) → exact color / size / spacing tokens
   - `get_metadata` (fileKey + node-id) → locate node-ids / state-variant tree
   - **Do not** use `get_context_for_code_connect` — needs an Org/Enterprise Code
     Connect seat this project does not have.
4. **Build to spec, reconciled with platform constraints** (see caveats below).
5. **Record the result here** using the [entry template](#new-component-entry-template).

### Platform reconciliation caveats (always apply on top of the kit)

- **Cards stay vertical 2:3**, never landscape 16:9, even though the kit defaults to 16:9.
- **Theme is Material 3 *blue*** (`--accent: #A8C7FA`), not the kit purple or old Plax gold.
- **Focus scale/motion is enabled for webOS 4+ (incl. the B8) and dev** via `html.caps-motion` (`app.js` `applyMotionCapabilityClass`: `osMajor >= 4 || osMajor === 0 || dev`). It stays smooth on Chromium 53 only because **animations are transform/opacity-only** — never layout (width/height/margin) or paint (big-blur shadow/background). Keep that constraint; the hard focus ring is the always-on primary cue. (NB: an earlier gate mis-read LG's firmware number as webOS 5 and over-animated — see [[caps-motion-gate-bug]].)
- **No `:focus-within`** (Chrome53 drops it) — drive active/expanded states with JS classes.
- Map kit pixel values onto existing CSS tokens in `src/styles/app.css`; add a token only if none fits.

---

## Canonical sources (do not re-derive these)

| Source | Value |
|---|---|
| Android TV design guidelines | https://developer.android.com/design/ui/tv |
| Figma TV Design Kit (Community) | https://www.figma.com/design/TLtknC3rZXQqWe3uIivt94/TV-Design-Kit--Community- |
| Figma `fileKey` | `TLtknC3rZXQqWe3uIivt94` |
| Figma pages | `17:864` Getting Started · `0:1` Styles · `22:532` Components |
| Figma plan | paid **Dev seat** (Code Connect unavailable — Org/Enterprise only) |

**Figma MCP quick reference** (always pass `fileKey: TLtknC3rZXQqWe3uIivt94`):
`get_design_context` = anatomy + geometry, `get_variable_defs` = tokens,
`get_metadata` = locate node-ids / state variants.

---

## Android TV guideline map

| Component class | Guideline URL |
|---|---|
| Foundations (focus, D-pad, overscan) | https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv |
| Color system | https://developer.android.com/design/ui/tv/guides/styles/color-system |
| Layout | https://developer.android.com/design/ui/tv/guides/styles/layouts |
| Buttons | https://developer.android.com/design/ui/tv/guides/components/buttons |
| Cards | https://developer.android.com/design/ui/tv/guides/components/cards |
| Featured carousel | https://developer.android.com/design/ui/tv/guides/components/featured-carousel |
| Immersive list | https://developer.android.com/design/ui/tv/guides/components/immersive-list |
| Lists | https://developer.android.com/design/ui/tv/guides/components/lists |
| Navigation drawer | https://developer.android.com/design/ui/tv/guides/components/navigation-drawer |
| Tabs | https://developer.android.com/design/ui/tv/guides/components/tabs |

Components without a dedicated page (chips, dialogs, text fields, menus, snackbars,
progress, controls) → use **Foundations + Layout + Color** plus the Figma spec.

---

## Figma node-id index

Primary node for each component in the kit's **Components** page (`22:532`).

| Component | Category frame | Primary node-id | Key variant props |
|---|---|---|---|
| Button | Buttons `8677:41929` | `169:1649` | Type=Filled/Outline, Size=S/M/L, State, Show icon, Enabled |
| Icon button | Buttons | `911:6945` | Type, Size, State, Enabled |
| Card | Cards `8689:37296` | `337:1709` | Ratio=2:3/1:1/16:9, Embed, Focus |
| Chip | Chips `8689:42422` | `2506:17680` | State, Selected, Leading/Trailing Icon, Image |
| List item | Lists `8677:45429` | `561:3969` | State |
| Tabs | Tabs `8689:27815` | `17:848` (tab item `17:849`) | Type=Primary/Secondary, State, Label, Show icon |
| Navigation drawer | Navigation drawer `8689:43720` | `563:4331` | Expanded |
| Nav item | Navigation drawer | `9:161` (default `9:873`) | State, Expanded, Badge |
| Text field | Text fields `8736:19302` | `3815:25016` (default `3816:24930`) | State, Variation, Type, Label config |
| Dialog | Dialog `8727:15085` | `3755:24555` | Type=Standard/Full Screen/Two Column/Web view |
| Modal / drawer | Modal drawer `8736:25866` | `4498:31402` | Direction |
| Menu | Menu `8842:26165` | `8842:26171` (List) | — |
| Progress bar | Progress bar `719:6043` | `719:6044` | Progress=20–100%, handle |
| Controls (checkbox/radio/switch) | Controls `8689:42658` | `591:4649` | Control type, Selected, Enabled, On |
| Player UI | Player UI `8842:27004` | `8842:27004` | — |

> Node-ids verified against the kit 2026-06-19. If a lookup 404s, re-run
> `get_metadata(fileKey, "22:532")` and refresh this table.

---

## New component entry template

**Anatomy** = the parts a component is made of. **Don't invent it** — `get_design_context`
returns the component already decomposed into named parts, which you copy into the
Anatomy field. Example: List Item → `Icon` / `Content`[`Overline`, `Title`, `Subtitle`] /
`Action` / `Control`, with each part's size/type/opacity inline. Optional slots show up
as the variant property names (`showIcon`, `overline`, `subtitle`, `action`, `control`).

Tools (all work on a Dev seat): `get_design_context` = anatomy + geometry,
`get_variable_defs` = token values, `get_metadata` = locate node-ids. **Do not** use
`get_context_for_code_connect` (Org/Enterprise Code Connect only).

```markdown
### <Component name>

- **Status:** ✅/🚧/📐/📝 · <YYYY-MM-DD>
- **Android TV guideline:** <url + section followed>
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `<id>` (variant axes: <Prop=…>)
- **Code:** `src/.../<file>` — `.<css-class>` in `src/styles/app.css`
- **Anatomy (parts → slot):**
  - `<part>` — required/optional (gated by variant `<Prop>`); <what it is>
- **Variant axes:** `<Prop=A|B>`, `<State=Default|Focused|Pressed|Disabled>`, …
- **Per-element spec:** <table or list — size · padding · type · color/token per part × state>
- **Deviations from kit (fix-list):** <only for 🚧 — what to reconcile>
- **Platform deviations (ratified):** <2:3 not 16:9; transform-only focus scale webOS4+ via caps-motion; etc.>
```

---

## Container sizing tokens (single source of truth)

> **Rule:** every component's container box (width / height / `min-height` / padding /
> gap / `border-radius` / media footprint) references a token in `:root` of
> `src/styles/app.css`. Never inline a px/vw container value — change the token and it
> applies to every instance at once. Run `/ckm:design-system audit-containers` to find
> drift; `/ckm:design-system <component> <prop>=<value>` to change one globally.

| Token | Value | Used by |
|---|---|---|
| `--icon-md` | 24px | nav-item icon, hub-icon, library hub-icon, player-menu chevron-icon, player-menu radio control |
| `--icon-lg` | 28px | `.btn-icon-glyph`, `.library-item__icon` |
| `--nav-rail-w` / `--nav-rail-w-expanded` | 96 / 280px | `.browsing-hub-nav-host` collapsed / expanded — collapsed widened from the redline's 80px literal (2026-07-04) so a 72px circular pill fits with the SAME 12px host padding as expanded (96 = 12+72+12); see Nav item's circle note |
| `--nav-item-h` | 72px | `.browsing-hub-item` — **finalized for 10-foot scale** (tested & approved 2026-07-04; was 52px app-standard) |
| `--nav-band-h` | 80px | `.browsing-hub-brand` (header) + `.browsing-hub-section--system` (footer) — redline 80dp literal, item/brand centered inside |
| `--nav-icon-md-nav` | 36px | `.browsing-hub-item__icon` / `.hub-icon` inside nav — **finalized for 10-foot scale** (nav-scoped, was 24px shared `--icon-md`) |
| `--nav-selected-bg` | rgba(0,74,119,.4) | `.browsing-hub-item.active` selected pill (secondaryContainer @40%) |
| `--font-nav-label` | 24px | `.browsing-hub-item` label — **finalized** (tested 36px, settled at 24px 2026-07-04) |
| `--list-item-h` | 64px | `.player-menu-option` (kit List Item 561:3969). (`.gt-list-item` settings rows stay `--target-min` 52 — ratified.) |
| `--field-pad-y` / `--field-pad-x` | 14 / 18px | `.tv-text-input`, `.search-input` (kit Text field 12×16 scaled) |
| `--field-pad-y-auth` / `--field-pad-x-auth` | 18 / 24px | `.tv-text-input` auth variant, `.login-field__btn` (kit ×1.5) |
| `--field-radius` | `--radius-md` (8px) | all text-field boxes |
| `--badge-size` | 30px | `.badge-watched` |
| `--list-item-h`, `--modal-sheet-max-w` | 420px | `.player-track-modal-sheet` (drawer width cap) |
| `--provider-card-w` / `--provider-card-media-h` | 420 / 200px | `.provider-card` |
| `--login-fields-w` | 560px | `.jellyfin-login .login-fields` |
| `--search-input-max-w` | 980px | `.search-input` |
| `--settings-content-max-w` | 880px | `.detail-setting-row`, `.detail-file-row`, `.detail-network-*`, `.settings-row` |

Coincidentally-equal values that are **deliberately not coupled** (distinct components):
`.pairing-layout`/`.detail-episode-art-wrap`/`.pin-pad-btn`/`.screen-subtitle`.

---

## Foundations

### Iconography  ✅ Material Symbols Rounded (2026-06-30)

- **Status:** ✅ · 2026-06-30 — migrated off the mixed Radix / Android-TV-Kit / one-off set.
- **Source:** **Material Symbols (Google), "Rounded" style, weight 400** — the official Google design icon library ([m3.material.io/styles/icons](https://m3.material.io/styles/icons), [fonts.google.com/icons](https://fonts.google.com/icons)), OFL. This is the single sanctioned icon source going forward; do NOT reintroduce Radix or bespoke glyphs. Exception: `P_CLOCK` (Radix, MIT) used for the Leaving Soon rail item only — replace with MS `schedule` when convenient.
- **Delivery:** path data is **inlined** as SVG (`src/ui/icons/navIcons.js`), NOT the Material Symbols icon font — so there is no CDN/font runtime dependency and every glyph renders on Chromium 53 / webOS 4 over `file://`. Single-colour (`fill: currentColor`) → inherits the host's colour/focus state. Sized via CSS (`--icon-md` 24px on nav/hub, `1em` on inline badges); never hard-code width on the SVG.
- **ViewBox:** kept verbatim at the library's `0 -960 960 960` baseline-anchored grid. **No `fill-rule`** — Material Symbols rely on default nonzero winding (evenodd breaks counters on several glyphs).
- **Outlined ↔ Filled pattern:** nav/section glyphs are **outlined when idle, filled when active/selected** (standard Material navigation). `iconSvgForKind(kind, filled)` returns the matching variant; the sidebar flips it on selection via `refreshHubNavIcons` (see Nav item). Glyphs shipped as outline+fill pairs: home, bookmark (watchlist), tv (show), movie (films), settings, video_library. Single-variant glyphs: search, tune (Quality), more_horiz (More), star-fill (rating).
- **To add an icon:** grab the Rounded SVG (e.g. `@material-symbols/svg-400/rounded/<name>.svg`, fill variant `<name>-fill.svg`), inline the `d` as a `P_*` constant + a `*IconSvg()` wrapper. Keep the 960 viewBox and no fill-rule.

### Typography  ✅ Roboto (2026-07-04)

- **Status:** ✅ · 2026-07-04 — reverted Elms Sans trial; Roboto is the primary typeface.
- **Typeface:** **Roboto** — system-delivered on Android TV / webOS; no `@font-face` needed. Token `--gt-font: 'Roboto', 'Noto Sans', system-ui, -apple-system, 'Segoe UI', sans-serif` (`src/styles/app.css`), TV-scaled across the Material 3 type roles.

### Motion  ✅ Material 3 motion system (2026-06-30)

- **Status:** ✅ tokens + tiers · 2026-06-30 — M3 easing/duration tokens landed in `src/styles/app.css` `:root`; legacy M2 curve `cubic-bezier(0.4,0,0.2,1)` + bare `ease` deprecated and migrated. **Build status of individual effects:** focus scale/glide, sheet/drawer slide-ins, **staggered screen-enter reveal (home-feed rows), cross-screen fade-through, `caps-motion-rich` tier (focus lift + elevation shadow on webOS 5+)** ✅ shipped 2026-06-30 · detail `•••` spring menu ⏸️ **deferred** — the current More flow uses the `openSidePanel` drawer (now M3 emphasized-decelerate); the anchored spring popover is a separable, hardware-validated follow-up (bespoke focus management, B8 risk).
- **Source:** [Material 3 Motion](https://m3.material.io/styles/motion) easing + duration specs, reconciled to the Chrome 53 / webOS 4 floor. M3's true "emphasized" curve is a two-part spline delivered via CSS `linear()` (Chrome 113+); on our floor it is approximated with the closest single `cubic-bezier`. cubic-bezier + custom props predate Chrome 53 → no `/* chrome53-ok */` marker needed.
- **THE RULE (non-negotiable):** animate **`transform` + `opacity` only** — the compositor-only properties. Never animate layout (width/height/margin/top/left) or paint (box-shadow/background/filter-blur) per frame. This is what holds 60fps on the B8. (History: [[caps-motion-gate-bug]] — a firmware misread once over-animated with big-blur shadows.)
- **Timing discipline:** enter **decelerates**, exit **accelerates**, and **exit is shorter than enter**. Cap at `--dur-medium2` (300ms) — at 10-foot distance M3's 450–600ms "long" durations feel sluggish.
- **No JS/rAF spring integrators on the baseline tier** — per-frame style writes contend with the `focus.js` scroll glide → dropped frames. "Spring feel" = the `--ease-spring` overshoot bezier + `transition-delay` stagger, transform/opacity only.

**Easing tokens** (`:root`):

| token | value | use |
| --- | --- | --- |
| `--ease-standard` | `cubic-bezier(0.2,0,0,1)` | default in/out |
| `--ease-standard-decelerate` | `cubic-bezier(0,0,0,1)` | enter (incoming element) |
| `--ease-standard-accelerate` | `cubic-bezier(0.3,0,1,1)` | exit (outgoing element) |
| `--ease-emphasized` | `cubic-bezier(0.2,0,0,1)` | hero/expressive (single-bezier stand-in for the M3 spline) |
| `--ease-emphasized-decelerate` | `cubic-bezier(0.05,0.7,0.1,1)` | emphasized enter (sheets/drawers) |
| `--ease-emphasized-accelerate` | `cubic-bezier(0.3,0,0.8,0.15)` | emphasized exit |
| `--ease-spring` | `cubic-bezier(0.2,0,0,1.2)` | baked overshoot for discrete pops (detail `•••` menu) — NEVER a JS spring on B8 |

**Duration tokens** (`:root`):

| token | value | use |
| --- | --- | --- |
| `--dur-short2` | 100ms | micro (focus ring/scale, mirrors `--focus-motion-dur` 0.1s) |
| `--dur-short3` | 150ms | small fades (scrim), cross-screen fade leg, nav-glide `NAV_SCROLL_MS` |
| `--dur-short4` | 200ms | overlay/transport in |
| `--dur-medium1` | 250ms | sheets/drawers enter (emphasized-decelerate) |
| `--dur-medium2` | 300ms | hard cap; staggered-reveal total budget |

**Capability tiers** (`app.js` `applyMotionCapabilityClass`, classes on `<html>`):

| tier | engines | what runs |
| --- | --- | --- |
| `html.caps-motion` (baseline) | webOS 4+ incl. B8, sim, dev | focus scale/glide, sheet/drawer slide-ins, staggered screen-enter reveal, cross-screen fade-through, detail `•••` spring menu — all transform/opacity only |
| `html.caps-motion-rich` | webOS 5+ / fast Chromium | adds depth flourishes too costly on Chrome 53: focus **parallax / lift-shadow** on hero & featured cards, longer reveal chains. The B8 silently skips these (it only ever has `.caps-motion`). |

**Pattern → timing map:**

| pattern | enter | exit | easing |
| --- | --- | --- | --- |
| focus scale/ring | 100ms | — | standard |
| nav-scroll glide | 150ms rAF ease-out-cubic | — | (JS, `focus.js`) |
| overlay / transport | 200ms | 150ms | emphasized-decelerate / standard-accelerate |
| sheet / side drawer | 250ms (`--dur-medium1`) | instant | emphasized-decelerate |
| staggered screen-enter | ≤40ms step, ≤300ms total | — | standard-decelerate |
| cross-screen fade-through | 150ms out → 150ms in | — | standard |
| detail `•••` spring menu | 200–250ms + stagger | short | spring (overshoot) |

### D-pad navigation engine (foundations)

- **Status:** ✅ · 2026-07-04
- **Resolution order (priority tier):**
  1. Declarative `data-nav-*` overrides (attribute on the focused element, or `addNavOverride()` programmatic map)
  2. Sequential mode (DOM order stepping when inside `[data-focus-mode="sequential"]` **with** explicit `data-focus-sequential-axis`; clamped at ends)
  3. Intra-zone geometry (flat spatial scorer scoped to the active `[data-focus-zone]` container)
  4. Cross-zone resolution (zone rects scored against zoneless focusables in one pass; winning zone enters via policy: `data-focus-zone-enter` selector → focus memory (WeakMap, last-focused child per zone) → cross-axis alignment)
  5. Boundary behavior (vertical arrows in content eat the event to prevent webOS platform hijack at screen edges)
- **Attribute vocabulary:**
  - `data-nav-left`, `data-nav-right`, `data-nav-up`, `data-nav-down` — CSS selector pinning a target element
  - `data-focus-zone="<name>"` — container for geometric scoping and entry policy
  - `data-focus-zone-enter="<selector>"` — element inside the zone that always receives focus on entry
  - `data-focus-mode="sequential"` — enables axis-based DOM-order stepping (requires `data-focus-sequential-axis`)
  - `data-focus-sequential-axis="horizontal"|"vertical"` — axis keys step in DOM order; perpendicular keys fall through to cross-zone
- **Sidebar vertical wall rule:** UP/DOWN never crosses the `.browsing-hub-nav-host` ↔ main-content boundary (enforced in `crossZoneMove` via the `isInSideNav` guard, mirrored in `getScoredCandidates` for the debug overlay).
- **Settings screen note:** The Settings sidebar is intentionally unzoned so `spatialMove` preserves a LEFT-from-content-into-sidebar fallback that lands the first hub item (Home); once Settings sidebar gains `data-focus-zone-enter`, this fallback becomes redundant.
- **Source:** `src/ui/focus.js` (engine core: `spatialMove`, `crossZoneMove`, `flatGeometricMove`, `sequentialStep`, `pickZoneEntry`, `zoneOf`, `rememberZoneFocus`); `docs/focus-zone-navigation-plan.md` (complete specification).

---

## Component specs

### Media card  (audited 2026-06-19)

- **Status:** ✅ to-spec — poster matches kit; the text stack is a ratified Plax extension
- **Android TV guideline:** [Cards](https://developer.android.com/design/ui/tv/guides/components/cards)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `337:1709` (2:3 variant `219:1934`)
- **Code:** `src/ui/components/mediaCard.js`; `.card-poster-wrap` / `.card-text` (`.card-title/.card-subtitle/.card-meta`) in `src/styles/app.css:1291+`
- **Anatomy (parts → slot):**
  - `poster` — required; image tile, **radius 12**
  - `scrim` — optional; gradient overlay
  - `badge` — optional; watched/progress/unwatched, top-left
  - `progress` — optional; bottom progress bar
  - `text-stack` — kit Standard card has `title` (16/24 Medium) + `secondary` (12/16 Regular @60%); app maps these to `title`/`subtitle` and **adds a 3rd `meta` line** (Plax extension)
- **Per-element (as-built vs kit):**
  - poster radius `--radius-lg` = **12** ✅ matches kit 12; sizes rail `156×234`, grid `176×264`
  - thumb **fetch** width `POSTER_WIDTH_ROW/GRID = 210` (was 180 → bumped 2026-06-20 for ~1.2–1.35× overscan crispness; episode still 16:9 at `340×191`). Cost ≈ width²: ~36% more bytes/decode/RAM per poster, throttled by `MAX_CONCURRENT_POSTER_LOADS = 6`.
  - text-stack `margin-top --space-5`; title `--font-card-title 18/1.25 w600`, subtitle 16, meta 14, all single-line
  - focus: ring via transparent border; transform-only scale runs under caps-motion (webOS 4+, incl. B8)
- **Platform deviations (ratified):** vertical 2:3 (not 16:9); title weight 600 vs kit 500; meta line is app-specific. No action.

### Detail screen — Film & Episode (hero + cast rail)  (added 2026-06-20)

- **Status:** ✅ to-spec · 2026-06-20 — reimagined on the JetStream reference; reconciled to platform.
- **Reference source:** JetStream (android/tv-samples `JetStreamCompose` → `MovieDetails.kt` / `CastAndCrewList.kt`); Figma community file `YP3cp4DjvPKyDexIoeyOF0` node `3-432`. No kit frame in `TLtknC3rZXQqWe3uIivt94` (composed from existing kit components).
- **Android TV guideline:** [Detail screens](https://developer.android.com/design/ui/tv) (browse → detail).
- **Code:** `src/ui/screens/detailScreen.js` (`renderMovieDetail` / `renderEpisodeDetail`, helpers `buildGenreChipsHtml` / `buildCreditsRowHtml` / `buildCastRailHtml` / `bindCastImages` / `iconActionButtonHtml`); styles `.detail-genre-pill`, `.detail-credits-row`, `.detail-cast*`, `.detail-icon-btn*` in `src/styles/app.css:2231+`.
- **Anatomy (parts → slot), JetStream-mapped:**
  - hero: 2:3 poster (NOT JetStream's full-bleed backdrop — platform 2:3 rule) + info column; ultrablur backdrop stays as screen bg.
  - info: title → `detail-meta` dot row (year · runtime · contentRating · **rating badge**) → **genre pills** (≤4, `--radius-pill`) → summary → **credits row** (Director / Writer / Studio, label+value cols) → actions.
  - **rating badge** (`.detail-rating-badge`, added 2026-06-22): `icon` + `score`. The score is always shown; when the rating comes from an official source we have a logo for, the logo is shown — otherwise a **Material Symbols Rounded "star" (filled)** icon from the Google design library stands in (`starIconSvg` in `src/ui/icons/navIcons.js`, `0 -960 960 960` viewBox, inherits `--accent` via `currentColor`). No official-source logo assets are bundled yet, so the star renders for every source today; the source seam is `ratingSourceLabel`/`buildRatingHtml` in `detailScreen.js`. Sized `1em`, `4px` right margin (no flex `gap` — Chrome53). Used in movie/show/episode layouts.
  - actions: Play (primary) + **icon buttons** Subtitles (Material Symbols `subtitles`) & Quality (Material Symbols `tune`) that open `openSidePanel` drawers; label span shows current value. Then the **`...` (More) overflow** — see the dedicated **Detail overflow menu** entry below. Movie/episode (`btn-more-options`, `buildMoreMenuHtml`) shows an in-place vertical stack instantly (no animation); show/season (`btn-more-actions`) still opens the flat `openMoreOptionsPanel` (`openSidePanel`) drawer. Both expose context-aware **Mark as Watched / Unwatched** (one, per `getWatchStatus`) + **Add to / Remove from Watchlist** (if `supportsWatchlistBookmark` && `canUseWatchlists`). Inline watchlist button and secondary mark-watched/unwatched buttons **removed** (2026-06-26). The `...` icon is `moreOptionsIconSvg()` (three horizontal dots, `navIcons.js`).
  - **Cast & Crew rail:** circular 104px avatars (JetStream uses 144dp portrait cards → swapped to circular 10-ft convention), name (2-line clamp) + character role; ≤12; display-only (actors not navigable), images via `bindPosterImage`.
  - episode: 16:9 still + series/title/meta/summary + credits + actions + Up Next + cast rail.
- **Data:** `item.genres/directors/writers/roles/studio`; `writers` added to Plex (`src/plex/library.js`) + Jellyfin (`mapItem.js`) mappers. Cast thumb: full URL passthrough, else `getThumbUrl(server, thumb, 200)`.
- **Platform deviations (ratified):** 2:3 poster vs JetStream backdrop; circular cast avatars vs portrait cards; flex `gap` retained (codebase convention). Subtitles/Quality kept per user request as icon-button drawer openers.

### Detail overflow menu (added 2026-06-30; animation removed 2026-06-30)

- **Status:** ✅ to-spec · 2026-06-30 — new in-house component. No Figma kit primitive (Android TV has no speed-dial/FAB-menu); composed from the Button/Icon-button gold-standard. **No animation** — an earlier CSS-spring reveal was built and then explicitly removed per product decision; the menu now shows/hides instantly (plain `display` toggle, no transition/keyframe of any kind).
- **Android TV guideline:** [TV navigation/actions](https://developer.android.com/design/ui/tv) — reconciled to a D-pad-driven expanding action group (not a pointer FAB).
- **Code:** `src/ui/screens/detailScreen.js` (`buildMoreMenuHtml` / `buildMoreMenuItems` / `wireMoreMenu` / `runMoreMenuAction` / `toggleWatchlistMembership`); styles `.detail-more-menu` / `.detail-more-stack` / `.detail-more-item*` / `.detail-more-trigger` in `src/styles/app.css` (next to `.detail-icon-btn`). Mounted by `buildPlaybackActionsHtml` (movie/episode only; show/season keeps `openMoreOptionsPanel`).
- **Anatomy:** `.detail-more-menu[data-focus-zone="detail-more-menu"]` (single state class `is-open`) → `.detail-more-stack` (`position:absolute; bottom:100%`, `display:none` by default and `display:flex` only while `.is-open`, normal column → last child nearest trigger; tonal `--bg-elevated` ≈ M3 L2, hairline border, **no large-blur shadow** per Chrome53 paint guardrail) holding `.detail-more-item` buttons (compose `.btn`; leading `.detail-more-item__icon` + label) → `.detail-more-trigger` (= `#btn-more-options`, composes `.btn.detail-icon-btn`, `aria-haspopup`/`aria-expanded`).
- **Items (data-driven, today):** **Mark as Watched / Unwatched** (toggle via `markWatched`/`markUnwatched` + `applyWatchAction` re-render); **Add to / Remove from Watchlist** (toggle via watchlist store, label/icon updated in place — gated on `supportsWatchlistBookmark` && `canUseWatchlists`, omitted+re-indexed otherwise); **Add to / Remove from Up Next** (toggle via `src/playback/userQueue.js` `addToQueue`/`removeFromQueue`/`isInQueue`, label updated in place — gated to playable leaf types `isQueueableType` = episode/movie/clip, omitted+re-indexed for season/show). Up Next reuses `libraryIconSvg` (video_library glyph — no dedicated queue glyph exists in `navIcons.js`).
- **Motion:** none. Open/close is an unanimated `is-open` class toggle; items are `hidden`/un-`hidden` in lockstep with the container's `display`. The `--ease-spring` token that powered the removed reveal was deleted from `:root` (app.css) — it had no other consumers.
- **Focus (D-pad):** items ship `hidden` (non-focusable per `isNavFocusable`) until opened. Open → un-hide + `is-open`, focus the nearest item, set trigger `data-nav-up`→nearest. Up/Down walk the stack via per-item `data-nav-up`/`-down` (resolved before geometry); top item self-traps Up, bottom item Down→trigger; Left/Right trapped to self. Back (461/27/8/Backspace/GoBack) intercepted capture-phase → close + return focus to trigger; also closes on `focusout` of the container. No `:focus-within`. Uses `data-nav-*` attributes (die with the DOM) rather than `addNavOverride` (which `clearNavOverrides` would wipe globally).
- **Platform deviations (ratified):** in-house (no kit source); tonal elevation + hairline instead of M3 drop shadow; no entry/exit motion by product decision.

### Button  ⭐ gold-standard reference entry

- **Status:** ✅ · 2026-06-22 — re-pulled + optimized: the canonical `.btn` is now the **single source of truth for the whole button family**. Every button-family class either composes `.btn` (+ a variant/size modifier) or is a ratified distinct component documented below. Killed the last bespoke per-instance overrides (`.detail-modal-cancel`, `.detail-secondary-actions .btn`), unified `.btn-outline` border on the kit outline token, reconciled `.detail-watchlist-btn` focus to the shared inversion, and added the `.btn--icon`/`.btn--lg` size modifiers from the kit Icon button (`911:6945`). (Prior 2026-06-20: rest fill `#444746 @80%`; `.btn-outline:focus` inversion fix.)
- **Android TV guideline:** [Buttons](https://developer.android.com/design/ui/tv/guides/components/buttons) — incl. the [Button container](https://developer.android.com/design/ui/tv/guides/components/buttons#button-container) section ("solid color containers for filled buttons; container width from content with consistent padding; text/icon = fully rounded")
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `169:1649` (canonical Button)
- **Code:** `.btn` / `.btn-primary` / `.btn-outline` in `src/styles/app.css`
- **Anatomy (parts → slot):** `container` + `background-layer` (fill/outline + focus halo) + `icon` (optional, `Show icon`) + `label`
- **Variant axes:** `Type=Filled|Outline`, `State=Default|Focused|Pressed`, `Enabled`, `Show icon`
- **Per-element spec — kit reference values** (node `169:1649`):

  | Element | Default (Filled) | Focused | Pressed | Disabled |
  |---|---|---|---|---|
  | radius | 40 (pill) | 44 | 40 | 44 |
  | padding (y/x) | 10/16 | 9/14.4 | 10/16 | — |
  | icon↔label gap | 6 | 6.6 | 6 | — |
  | fill | `#444746` @80% | `#E3E3E3` solid | `#E3E3E3` solid | `#444746` @40% |
  | label color | `#E3E3E3` @80% | `#303030` | `#303030` | `#E3E3E3` @40% |
  | label type | Roboto Med 14/20 +0.1 | 15.4/22 +0.11 | 14/20 | 14/20 |
  | icon size | 18 @80% | 19.8 | 18 | 18 @40% |
  | outline (Outline type) | border `#C4C7C5` 1.5px @40% | bg `#E3E3E3` + border `#8E918F` 1.65px | border `#8E918F` 1.5px | border `#C4C7C5` @20% |
  | focus ring | — | fill extends `-2/-3.2px` beyond box | — | — |

  Kit focus = **invert (light fill + dark text) + ~1.1× scale**.
- **App reconciliation (as-built 2026-06-20):**
  - `.btn` = filled. Rest fill **`--button-container rgba(68,71,70,.8)` (kit `#444746 @80%`, node `169:1649`)**, pill radius `--gt-radius-button 999`, label scaled to `--font-meta 22` for 10-foot.
  - **Padding `--space-5`/`--space-6` (20/24px)** → height ≈ 71px. Scaled from the kit container proportion (py10–12/px16 vs a 14px label) to our 22px label so the solid container has real internal padding (was 12/28px → 52px, a tight pill).
  - **Focus = light-pill inversion** (`background:--focus-fill #E3E3E3` + `color:--focus-on-fill #303030`) — the primary cue; a paint change, so it is instant on every engine (not animated). The kit's 1.1× scale runs under `html.caps-motion` (now webOS 4+, incl. B8).
  - `.btn-primary` = always-blue filled (one primary per screen); still inverts on focus.
  - **`.btn--sm` = size variant** (kit Size=S): pure size modifier — `min-height --space-9` (40px), `padding --space-2/--space-4` (8/16), `font-size --font-small`; keeps the pill radius, fill/outline, and focus-inversion of the base. Compose `.btn .btn-outline .btn--sm` for compact controls (modal Cancel/Close). **Replaced** the bespoke `.btn-player-modal-cancel` (off-spec `radius:6 / min-height:38 / muted color`), which is deleted.
- **Resolved (2026-06-20):**
  - **Rest fill** adopted kit canonical `#444746 @80%` (`rgba(68,71,70,.8)`, surface-variant, node `169:1649`), replacing the off-spec `#303030` (which had been pulled from an ImageButton node). The 80% alpha composites over the darkest settings-card surfaces (`#131314`–`#282A2C`) lighter than `#303030` did, so card legibility improved rather than regressed — the original reason to keep `#303030` no longer holds.
  - **`.btn-outline:focus` fixed** — removed the `color:--gt-text` override that fought the shared `.btn:focus` inversion (caused light-on-light). Outline buttons now invert like the filled button (light `--focus-fill` fill + dark `--focus-on-fill` label); the rule only sets `border-color:--focus-fill` to match the inverted surface. Verified on the two focusable call sites (`.detail-modal-cancel`). Focusable outline buttons are now safe to use.
- **Platform deviations (ratified):** blue `--accent` focus accents; type up-scaled to 22px for 10-foot; kit 1.1× focus scale runs under caps-motion (webOS 4+).
- **Canonical state model (single source of truth)** — every variant × size × state, as-built in `app.css`:

  | | Rest | Focused (= Pressed/Selected cue) | Disabled |
  |---|---|---|---|
  | **Filled** (`.btn`) | fill `--button-container` (#444746 @80%), label `--gt-text` | **invert**: bg `--focus-fill` #E3E3E3 + label `--focus-on-fill` #303030, border transparent, +1.1× scale under caps-motion | `opacity .4`, `pointer-events:none` |
  | **Primary** (`.btn .btn-primary`) | fill `--gt-primary` (blue), label `--gt-on-primary`, weight 600 | same inversion | same |
  | **Outline** (`.btn .btn-outline`) | transparent + 1px `#8E918F @35%` (kit outline token), label `--gt-text-2` | same inversion + `border-color:--focus-fill` | same |
  | **Icon** (`.btn .btn--icon`) | circular footprint (`--target-min`), fill/outline per Filled/Outline above | same inversion | same |

  - **Sizes (pure footprint modifiers, keep pill + fill + inversion):** base/M = `--target-min` 52, py/px `--space-5/--space-6`, label `--font-meta` 22. `.btn--sm` (kit S) = `--space-9` 40, py/px `--space-2/--space-4`, label `--font-small`. `.btn--lg` (kit L) = `--player-icon-btn-lg` 88, py/px `--space-6/--space-7`, label `--font-row-label`. Icon footprints: M `--target-min`, S `--space-9`, L `--player-icon-btn-lg`, all circular.
  - **Hover / motion-cursor + scale (recorded 2026-06-22) — the previously-missing state:** TV is D-pad-first (Android TV Buttons/Foundations). The magic-remote **motion cursor** (`body.cursor-visible` + pointer-over) gets **`cursor: pointer` ONLY — no paint change**; focus inversion stays the single visual cue. There are **no button-family `:hover` paint rules** (the stray `.player-media-info-btn:hover` was the last one — deleted). **Scale:** focus scale = `--focus-scale` (1.06, kit ~1.1×), **transform-only under `html.caps-motion`** (webOS 4+). It applies to **icon-only / non-text controls**; **text buttons (`.btn`/`.btn-primary`/`.btn-outline`) deliberately do NOT scale** — Chromium 53 blurs GPU-stretched text, so `html.caps-motion .btn` transitions `background` only. Cursor-hover never scales (only `:focus`).
- **App class map (every button-family class → its resolution):**

  | Class | Resolution |
  |---|---|
  | `.btn` / `.btn-primary` / `.btn-outline` / `.btn--sm` | **canonical** (vocabulary preserved — referenced widely) |
  | `.btn--icon` / `.btn--lg` | **new** canonical modifiers (kit Icon button `911:6945` S/M/L) |
  | `.btn-icon` | legacy alias of `.btn--icon` (kept; `createButton({variant:'icon'})`) |
  | `.btn-wide` | canonical wide variant (`--gt-radius-wide` 12) |
  | `.btn-icon-glyph` / `.btn-label` | canonical inner slots (glyph box + label span) |
  | `.detail-modal-cancel` | **bespoke override deleted** → now a focus-system marker only; composes `.btn .btn-outline .btn--sm` at every call site |
  | `.detail-secondary-actions .btn` (Mark watched/unwatched) | **contextual override deleted** → composes `.btn .btn-outline .btn--sm` |
  | `.library-scan-btn` | **reconciled 2026-06-22** → composes `.btn .btn-outline .btn--sm` (bespoke hand-roll deleted; it was a redundant copy of the Outline kit values) |
  | `.player-media-info-btn` | **reconciled 2026-06-22** → composes `.btn .btn-icon` (filled, so the solid container reads over live video); bespoke `:hover` rule + accent-tint focus **deleted** → shared `.btn:focus` inversion; CSS stripped to overlay position + 50% radius + 52px square |
  | `.player-skip-intro-prompt` | **reconciled 2026-06-22** → composes `.btn` (duplicate rest paint deleted); overlay position + credits-countdown fill preserved; auto-focused = inverted (selected) |
  | `.login-field__btn` / `.login-switch-provider` | compose `.btn`; `login-field__btn` ratified as the Auth-field-shaped input launcher (Login/Auth field entry); `login-switch-provider` = plain `.btn` |
  | `.player-control-pill` / `.player-stream-pill` (+`--icon`/`--play`/`--danger`/`--on`) | **ratified distinct** — transient transport controls (see reason below) |
  | `.detail-watchlist-btn` (+`--active`) | **reconciled 2026-06-22** → composes `.btn .btn-icon` (circular icon button — was a bespoke **square** `--radius-md` button, off the icon-button convention). Only the bookmarked `--active` accent-soft fill + active-focus glyph override remain bespoke; inversion focus inherited from `.btn`. |
  | `.watchlist-row-link` | **ratified distinct** — a borderless inline text link (not a container button); focus = accent text, no inversion |
  | `.pin-pad-btn` | **ratified distinct** — fixed-grid PIN keypad cell (84×64); inherits the shared `.btn:focus` inversion via the focus group |
  | `.provider-card` | **ratified distinct** — a selection *card*, not a button (Provider-picker entry) |
- **Deliberately distinct (with reason):**
  - **Player pills** (`.player-control-pill` / `.player-stream-pill`) — transient auto-hiding transport controls over live video: dark-translucent rest (must read over any frame), circular icon variants, active-marks, `--play`/`--danger` semantics, no scale (never clip in tight rows). They already share the kit focus-inversion; their footprint/rest are video-overlay-specific.
  - **`.detail-watchlist-btn`** — a *toggle* (bookmarked on/off). Composes the canonical **circular** `.btn .btn-icon` (reconciled 2026-06-22 from a bespoke square button); the only bespoke part is the bookmarked `--active` accent-soft fill. Shares the kit inversion focus.
  - **`.watchlist-row-link`** — an inline text link inside a list row, not a pill container.
  - **`.pin-pad-btn`** — a fixed-geometry keypad cell; size is dictated by the keypad grid, not content.

### Icon button  ⭐ sub-entry of Button (kit node `911:6945`)

- **Status:** ✅ · 2026-06-22 — pulled fresh; mapped onto the `.btn--icon` modifier.
- **Android TV guideline:** [Buttons](https://developer.android.com/design/ui/tv/guides/components/buttons) (Icon button — compact, single glyph, fully rounded; sizes S/M/L; "don't use two icons", "don't center icon+text together").
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `911:6945` (axes Type=Filled|Outline, Size=S|M|L, State=Default|Focused|Pressed, Enabled).
- **Anatomy:** `container` (square, fully-rounded) + `background-layer` (fill/outline + focus halo) + single `icon` (centered, vertically + horizontally). No label slot.
- **Per-state kit values** (node `911:6945`):

  | | Default | Focused | Pressed | Disabled |
  |---|---|---|---|---|
  | S | p6 / r14 / icon16 | p5.2 / r24.2 / icon17.6 + halo 30.8 | p6 / r14 | icon @40% |
  | M | p10 / r20 / icon20 | p9 / r24.2 / icon22 + halo 44 | p10 / r20 | icon @40% |
  | L | p14 / r28 / icon28 | p12.6 / r30.8 / icon30.8 + halo 61.6 | p14 / r28 | icon @40% |

  Fill/label colors inherit the Button table (Filled = surface-variant fill → invert on focus; Outline = `#8E918F` border → invert). Focus = invert + ~1.1× scale + circular halo.
- **App reconciliation (as-built):** `.btn--icon` = circular footprint (`border-radius:50%`, square `--target-min` 52 = M). `.btn--icon.btn--sm` = `--space-9` 40 (kit S up-scaled), `.btn--icon.btn--lg` = `--player-icon-btn-lg` 88 (kit L). Fill/outline + focus inversion + caps-motion scale all inherited from `.btn`. Compose `.btn .btn--icon` (filled) or `.btn .btn-outline .btn--icon`. Glyph via `.btn-icon-glyph` (or `--play .player-control-icon` in the player).
- **Platform deviations (ratified):** footprints up-scaled to the 10-ft target floor (`--target-min`/`--player-icon-btn-lg`) rather than literal kit px; halo expressed as the caps-motion scale + the shared inversion, not a separate ring layer; blue accents.

### Chip  ✅ reconciled 2026-06-20

- **Status:** ✅ to-spec · 2026-06-20 — all chip instances reconciled to kit `2506:17680` (8px rounded-rect, 8/16 padding, 1px `#8E918F` outline, shared control-inversion focus). The Library filter chip (`2506:17644`) was already reconciled (see Library grid entry); the other instances were brought into line with it.
- **Android TV guideline:** Foundations + Layout (no dedicated chip page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `2506:17680` (default `2506:17644`)
- **Anatomy (canonical):** `container` (flex, `gap 8`, `padding 8/16`) + `background` (border `#8E918F` 1px **@20%**, **radius 8**) + `leading icon` (opt) + `label` (Roboto Medium **14/20**, +0.1, `#C4C7C5` @80%) + `trailing icon`/`image` (opt); states `Default|Focused|Pressed|Active`
- **Code (as-built):** `.detail-setting-chip` / `.library-filter-chip` / `.user-chip` group + `.browsing-hub-item`; focus group `src/styles/app.css:314`
- **Resolved spec / values:**
  - **Radius:** all instances → `--radius-md` (8px) rounded-rect (was `--radius-pill` 24 on `.detail-setting-chip` via `--radius-md`… and `.user-chip`). `.user-chip` changed `--radius-pill` → `--radius-md`.
  - **Padding:** kit `8/16` → `var(--space-2) var(--space-4)`. `.detail-setting-chip` was `12/22`; `.user-chip` was `10/space-5` → both reconciled.
  - **Border:** 1px `#8E918F` outline matching the ✅ Library filter chip (`rgba(142,145,143,.35)`); replaces the off-spec `rgba(255,255,255,.08)` on `.detail-setting-chip` and the borderless `.user-chip`.
  - **Selected/Active:** kept blue Material 3 tokens — `--gt-secondary-container`/`--gt-on-secondary-container` aligned with the filter chip where applicable; `.detail-setting-chip--active`/`.user-chip.active` retain `--accent-soft`/`--accent` (ratified blue active treatment, same family).
  - **Focus:** removed the off-spec ring+shadow override on `.detail-setting-chip:focus` so the chip uses the shared control INVERSION (light `--focus-fill` fill + dark `--focus-on-fill` text) from the focus group at `src/styles/app.css:346`.
  - **Focused-while-selected (added 2026-06-22):** `.library-filter-chip--active:focus` explicitly re-applies the inversion (`--focus-fill`/`--focus-on-fill`). Without it the `--active` blue fill (source-ordered *after* the shared `:focus` group, equal specificity) won → a selected+focused chip kept its blue fill and showed **no focus feedback** on Chrome 53. Mirrors Jetstream `MovieFilterChip`'s `focusedSelectedContainerColor`/`focusedSelectedContentColor`. Jetstream cross-check also confirms: 1px border @50% rest, no focus scale (`focusedScale=1f` — chips clip), optional leading Check icon on selected.
- **Platform deviations (ratified):** label **`--font-meta` 22px** kept (kit 14 → 10-foot up-scale, ratified Plax rule, do not shrink); blue `--accent`/secondary-container active tokens; border `@35%` (the reconciled Library-grid value) rather than literal kit `@20%`; focus motion via `html.caps-motion` only.
- **Trailing-glyph note (2026-06-22):** the Library **Sort** chip (`.library-filter-chip--sort`) shows a down-chevron via a **CSS border-triangle `::after`** (`currentColor`, so it inverts on focus) — NOT a Unicode glyph. The webOS 4 system font does not include `▾` (U+25BE), which rendered as nothing on the B8. Use border-triangle or SVG for any chip/tab glyph; never a bare Unicode arrow.

### Navigation drawer (container)

- **Status:** ✅ to-spec · 2026-06-27 — pulled fresh from the kit + Google's Compose source; built to spec.
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) — collapsed rail always visible (3–7 destinations), expands on focus; top = logo/profile/search, bottom = 1–3 actions; active indicator = a distinct background shape; standard (push content) vs modal (overlay + scrim).
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / Navigation drawer `563:4331` (axis `Expanded`).
- **Google source (canonical):** `androidx.tv.material3` `NavigationDrawer.kt` — expand on `onFocusChanged(hasFocus)` → `DrawerValue.Open/Closed`, width via `animateContentSize`. **NB:** JetStream renders nav as a **top bar** (`DashboardTopBar.kt`); the side-drawer spec is the guideline + kit + this component, not JetStream.
- **Code (as-built):** `.browsing-hub-nav-host` in `src/styles/app.css` (base ~658; home overlay `.screen-home …` ~568; library overlay `.library-screen …` ~1213); mounted by `src/ui/components/browsingHubNav.js` (`mountBrowsingHubNav`).
- **Anatomy (3 regions, kit 563:4331):** `Header` (kit Account Switch — **we keep the plax brand**, ratified) → `Nav items` (destinations, column gap 12) → `Footer` (Settings, pinned bottom via `margin-top:auto`). No dividers / section headings (kit has none).
- **Geometry — redline dp literal, NOT doubled (final, 2026-06-27):** the user supplied Google's own annotated redline (`umKprEfp5UqPDzIKlceq8O` node `8689:43720`) — rail width as a **range** (collapsed min 40 / max 80dp, expanded min 220 / max 280dp), item 48dp, icon 24dp, item gap 12dp, drawer pad 12dp, header/footer each an 80dp band. **An earlier same-day pass doubled all of it**, reasoning the redline file's own "Usage" example frames (node `8689:44041`) place the drawer inside a **960×540 "TV Frame" (half of 1920×1080)**, so kit px must be a 50%-scale preview — this looked well-evidenced (it even matched the `--safe-x` "58dp → 116px @1920" ×2 precedent already in this file) but was **wrong**: the user confirmed the ×2 result was "far too large," and checking real shipping code (`android/tv-samples` `JetStreamCompose`) shows Google's own polished sample uses a 32dp tab / 14sp label for persistent nav chrome — smaller than the undoubled kit defaults, confirming Android's dp/sp units are already correctly scaled for TV by the OS and a Figma preview canvas size is not a doubling instruction. **Reverted to literal 1:1**: collapsed **80px** / expanded **280px** (`--nav-rail-w`/`--nav-rail-w-expanded`, max of each range), drawer padding **12px**, **header/footer each an 80px band** (`--nav-band-h`, content vertically centered inside, not stretched).
- **Expand model:** JS class `--expanded`/`--peek` toggled on focusin/out (`syncExpanded`), **NOT `:focus-within`** (Chrome53 drops it). Mirrors Compose's `onFocusChanged(hasFocus)`. **Cold-landing guard (2026-07-04):** the home screen parks initial focus on the rail (`data-initial-focus="1"`) until the feed loads; `syncExpanded` stays collapsed for that programmatic landing (previously it flashed open→closed on every load), and the first real keydown inside the rail clears the flag and expands normally.
- **Standard vs modal:** home + library use the **modal/overlay** form (absolute rail in the left safe-gutter, overlays the grid for the full-width reclaim); search/settings/detail/watchlist use the **standard/push** form (rail is a flow sibling). **No border anywhere** (the old `border-right` divider was dropped 2026-07-04).
- **Backing & scrim (2026-07-04):** collapsed = **opaque hard-edged `--bg-base` backing, no scrim** — feed content scrolling under the rail simply hides behind it. Expanded (overlay screens only) = **scrim** per the kit's modal-drawer anatomy (Scrim node `8689:45284`): a `position:fixed` `::before` on the host (fixed escapes the host's `overflow:hidden`; **the host must never gain a transform/filter** or it re-captures the pseudo), 50vw gradient (`--bg-base` → transparent), constant geometry, **opacity-only** toggle (0 collapsed / 1 expanded, `pointer-events:none`, `z-index:-1` under the rail surface), fade gated by `html.caps-motion`.
- **Motion:** width-expand eased (`width 180ms cubic-bezier(.4,0,.2,1)`) **only on the overlay screens** (reflows just the rail's own items); in-flow screens snap (animating width there reflowed the heavy main content — the "laggy entry" stutter). Label slides in via `@keyframes navLabelIn` under `html.caps-motion` (opacity + translateX, transform/opacity-only → smooth on Chrome53, higher-FPS on capable HW). Scrim fade = opacity-only, caps-motion gated.
- **Brand lockup invariants (2026-07-04):** the header band is a **fixed** `height: --nav-band-h` (not min-height, no vertical padding) so it can never grow when the lockup swaps; the wordmark svg renders at **68px** so its "x" glyph (275/466 of its viewBox) equals the collapsed mark's **40px** — the x keeps identical optical size AND vertical center across states. SVG **gradient ids are per-instance** (`plaxLogo.js` counter): fixed ids duplicated across coexisting copies (splash + rail, two screens mid-transition) made `url(#id)` resolve to a hidden subtree's def and the chevron silently lost its gradient ("parts of the logo missing" on first load).
- **Platform deviations (ratified):** plax brand header instead of the kit account switcher; overlay form on home/library. Chrome53 guardrails (JS-class expand, no flex-gap, transform/opacity-only motion) retained.

### Nav item (browsing-hub sidebar)

- **Status:** ✅ to-spec · 2026-06-27, five passes same-day — see Resolution history below. Sub-entry of the Navigation drawer container above.
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / Nav item `9:161` (states `Default | Focussed | Selected` × `Expanded` × `Badge`). Redline cross-check: `umKprEfp5UqPDzIKlceq8O` / node `8689:43720` (user-supplied — the user's saved copy of the same kit).
- **Google source (canonical):** `androidx.tv.material3` `NavigationDrawerItem.kt` / `NavigationDrawerItemDefaults.kt` — `IconSize 24`, `ContainerHeightOneLine 48`, `RoundedCornerShape(50)`, `focusedScale 1.05f`. Reconfirmed by the redline (48dp item, 24dp icon, 12dp gaps, 40–80/220–280dp rail range, 80dp header/footer bands) and used **literally, 1:1** — cross-validated against real shipping code (`JetStreamCompose` `DashboardTopBar.kt`: 32dp tab height, 14sp label), which confirms Android TV nav chrome does not need scaling up from raw dp/sp (see the Navigation drawer container entry's Geometry note).
- **Code (as-built):** `.browsing-hub-item` (+ `__icon` / `__label` / `.hub-icon`) `src/styles/app.css` (~774+); header/footer bands `.browsing-hub-brand` / `.browsing-hub-section--system` (~1560+, ~1588+).
- **Resolution history (so a future agent doesn't re-loop this):** pass 1 (kit-exact 1:1) shipped 48px item / 16px label → **"far too small."** Pass 2 substituted the app's *other* 10-foot tokens (`--target-min` 52px / `--font-body` 24px) as a heuristic fix — never directly objected to. Pass 3: the user supplied Google's own redline and flagged the result was still "much larger [on Google's own kit] than what you're doing" — the redline's own "Usage" example frames showed the drawer drawn inside a **960×540 "TV Frame" (half 1920×1080)**, which read as "every kit px needs ×2." Pass 4 shipped that ×2 (96px item / 32px label / 48px icon / 160-560px rail) — the user confirmed it was now **"far too large."** Pass 4 also introduced a brand-mark size bump (40→80px, scope creep beyond the redline) that coincided with a broken gradient + apparent rail shift seen on the webOS **simulator**; that mark bump was reverted first as the safe, low-risk fix, independent of the size question. **Pass 5 (final):** re-examined the ×2 theory against **real shipping code** — `android/tv-samples` `JetStreamCompose` `DashboardTopBar.kt`/`Type.kt` — which shows Google's own polished sample uses a **32dp tab height and 14sp label**, smaller than even the undoubled kit defaults. This proves dp/sp values are NOT meant to be doubled for TV; the 960×540 Figma frame was a design-canvas convenience, not a code instruction. **Reverted all of pass 4's doubling** back to literal redline dp (item/icon/gaps/rail/bands), keeping only the label at `--font-body` (24px, pass 2's choice, cross-validated by the JetStream numbers landing in the same ballpark once scaled, and matching what the user directly asked for earlier — "why aren't we using ... 24 labels").
- **Anatomy (parts → slot):** `container` (flex, h **72px** `--nav-item-h` — finalized for 10-foot scale; `padding-x 16px`; pill radius `--gt-radius-button`) → `content` (`icon` **36px** `--nav-icon-md-nav` (nav-scoped, not the shared `--icon-md`); + `label` when expanded; icon→label gap **12px**) → `badge` (opt — not used yet). Label = Medium, **`--font-nav-label` 24px** (finalized 2026-07-04), `line-height 1.3`, `--gt-ls-title` tracking. Header/footer are each an **80px band** (`--nav-band-h`, `.browsing-hub-brand` / `.browsing-hub-section--system`), content vertically centered inside, not stretched. **Brand mark/wordmark stays 40px** (its original size); it's not part of the kit/redline anatomy at all (we keep the plax brand instead of the kit's account switcher).
- **State model (kit `9:161`, all via existing `:root` tokens):**

  | State | Container | Content (icon + label) |
  |---|---|---|
  | Default (drawer blurred) | transparent | on-surface-variant `--gt-text-2` #C4C7C5 |
  | Default (drawer focused = `--expanded`) | transparent | on-surface `--gt-text` #E3E3E3 |
  | Focused | inverse-surface `--focus-fill` #E3E3E3 | inverse-on-surface `--focus-on-fill` #303030 |
  | Selected (`.active`) | secondary-container @40% `--nav-selected-bg` #004A77 | on-secondary-container `--gt-on-secondary-container` #C2E7FF |
  | Focused + selected (`.active:focus`) | inverse pill (focus **wins**, explicit) | #303030 |

  Icon follows content color via `currentColor` (kit: icon + label share the state color). Collapsed rail: labels `display:none`; the **Selected pill behind the icon** is the current-section cue (`aria-current` + `.active`). **Collapsed pill is a CIRCLE (2026-07-04, corrected same-day):** pass 1 narrowed the HOST's side padding 12→4px in the collapsed state to make room for a 72px circle — this shifted the icon ~8px left on collapse, a visible jump the user flagged ("icon should always stay exactly where it is"). Pass 2 (final): host padding stays the SAME 12px in every state; `--nav-rail-w` was widened 80→96px instead, so the host's content box (96−2×12=72) already equals `--nav-item-h`. The item (width:100% of that box) is a 72×72 circle for free — its pill background covers the full item box regardless of the item's own internal padding, so no item-level padding changes were needed either. Icon x now moves only ~2px between collapsed/expanded (46 vs 48, measured) — imperceptible, and in the "slightly right" direction the user asked for, vs. the ~8px jump before.
- **Motion:** focus/selected pills are **paint** cues → instant + crisp on every engine. Under `html.caps-motion` the paint swap is eased (`background-color`/`color` `--focus-motion-dur`) and the label slides in (`navLabelIn`). **No transform-scale on the item** — the kit's `focusedScale 1.05` is omitted because Chromium 53 blurs GPU-scaled text (same ratified rule as text Buttons); the pill is the cue and capable HW simply runs the eased paint/label motion at higher FPS.
- **Exceptions DROPPED in the 2026-06-27 reset** (were prior bespoke deviations, now replaced by shared kit/app language): `accent-soft`/`--gt-primary` selected → **secondary-container**; `bg-surface-hover` + `--focus-shadow` ring focus → **inverse pill**; the collapsed stacked `--label-active` accent label (removed). **The only remaining deviation is the label size** (`--font-body` 24px vs kit 16sp) — everything else (rail widths, item height, icon, gaps, bands) is the redline dp taken literally, confirmed correct (not doubled) against real shipping code.
- **Retained Chrome53 technical guardrails** (NOT design exceptions): JS-class expand (no `:focus-within`), margin gaps (no flex-gap), transform/opacity-only motion.
- **Contract:** nav order Home · Watchlist (cond.) · **Leaving Soon** · libraries · Search · Settings (Media / Search / System groups in `browsingHubNav.js`; Settings footer-pinned, `margin-top:auto`). **Hosts:** Home, Library, Settings, Search, Detail, Watchlist all mount `.browsing-hub-nav-host`, stretched to full viewport height. 658/658 tests pass.
- **Leaving Soon destination (2026-06-30, from a parallel main-branch pass):** Media-section item `{ id:'leavingSoon', label:'Leaving Soon', iconKind:'leavingSoon' }`, added after Watchlist, before the per-library entries. Available to **every** profile (not gated like Watchlist). Like Watchlist it's a **hub mode of the Home screen**, not a separate route — `handleHubNavSelect` → `navigate('home', { hub:'leavingSoon' })`; `homeScreen` dispatches `loadLeavingSoonHub()`. Icon = `P_CLOCK` (`leavingSoonIconSvg`, `navIcons.js`) — static shape, does not flip with active state.
- **Focus entry (2026-06-30, same parallel pass):** D-pad **Left crossing from main content into the rail always lands on the TOP item (Home)**, not the geometrically-nearest one — `spatialMove` (`src/ui/focus.js`) redirects to the first `.browsing-hub-item` when LEFT's best candidate is inside the sidenav and the source is content. (Left *within* the rail is unaffected; initial screen-mount focus still uses the active item via `focusSidebarHub`.)
- **Icon fill-on-select:** `refreshHubNavIcons` rewrites a glyph's SVG only when its filled-state actually flips (`data-icon-filled` gate) — every nav glyph swaps outlined↔filled on selection, but only the ≤2 buttons whose selection changed are re-parsed per navigation.
- **Open (IA, not styling):** the kit's own nav order is Search-first with items vertically centered; this app keeps Home-first, top-aligned under the brand. Revisit only if exact IA parity is wanted.

### Rail row

- **Status:** 📝 summary only — generic rail; the home carousel's full spec is the next entry (Home Rail)
- **Android TV guideline:** [Lists](https://developer.android.com/design/ui/tv/guides/components/lists) / [Immersive list](https://developer.android.com/design/ui/tv/guides/components/immersive-list)
- **Figma source:** `8689:24148` (Immersive list) · `8677:45429` (Lists)
- **Code:** `.row-section` / `.row-label` / `.row-scroll` in `src/styles/app.css`; `src/ui/components/virtualRow.js`
- **Resolved spec:** horizontal scroll, hidden scrollbar; card gap `--row-card-gap 16`; ≤30 cards in active viewport window. Library/detail rails **center** the focused card.

### Home Rail (carousel row + card focus motion)

- **Status:** ✅ to-spec · 2026-06-18 (behaviour/motion; no static kit frame)
- **Android TV guideline:** [Layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts) (overscan/margins) + [Focus system](https://developer.android.com/design/ui/tv/guides/styles/focus-system) (scale values)
- **Figma source:** none — behaviour/motion spec aligned to Google guidance + JetStreamCompose `MoviesRow`
- **Code:** `.home-feed` / `.row-section` / `.row-scroll` / `.media-card` (`src/styles/app.css`); `src/ui/focus.js` (`scrollFocusedIntoView` home branch, `scrollHomeRailAnchored`, `railPitch`, `NAV_SCROLL_MS`)
- **Anatomy:**
  ```
  .home-feed                 ← vertical scroller (overflow-y auto, overflow-x hidden)
    .row-section             ← one rail (label + scroll)
      .row-label
      .row-scroll            ← horizontal carousel, bleeds into L/R gutters
        .media-card          ← focusable; vertical 2:3 (NOT 16:9)
          .card-poster-wrap  ← the element that scales on focus
  ```
- **Resolved spec / values:**
  - Card focus grow (home): **`--gt-focus-scale: 1.03`** (3%), overridden in `.screen-home .home-feed` — the full 1.1× clips against neighbours given the tight immersive-overlap spacing (Google allows scale to vary 1.025/1.05/1.1).
  - First-card focus origin: **`transform-origin: left center`** on the first card's `.card-poster-wrap` — leftmost card is flush against the `overflow-x:hidden` clip; a centred scale clips its left edge, so it grows inward only.
  - Rail headroom: `.row-scroll` padding-y **22px**; `.home-feed` padding-top **28px** / bottom **26px** — clears the focus grow without clipping at scroll edges.
  - Gutter bleed: **full-bleed row + contentPadding** (JetStream model): `.row-scroll` spans physical screen edges (`width:auto` + negative `--safe-x` margins) and insets content with `--safe-x` padding; cards peek past both edges. Must NOT use `width:100%`.
  - Cards: **every rail** (normal / `--compact` On Deck / `--sparse`) locked to `flex:0 0 var(--home-hub-poster-w)` + `max-width:none` so all rails share one pitch (248px card + 40px gap → 6 = 1688 = `--content-max`). (Root-cause of a past misalignment: `.row-scroll--sparse` clamped `max-width:240px`.)
- **Horizontal movement (anchored slot):** within a rail the selector pins to a **fixed 3rd column** (`ANCHOR_SLOT = 2`); cards 1–3 at `scrollLeft 0`, from the 4th on the rail shifts left in whole card-pitch steps (`(idx-2)*railPitch`). Home-only; other screens center.
- **Vertical movement (anchored rails):** moving down keeps the ring in a fixed vertical slot; the feed scrolls so the new rail slides into it (`scrollHomeRailAnchored`).
- **Motion timing (`NAV_SCROLL_MS`):** a short RAF ease-out-cubic glide on **every engine incl. webOS4/Chromium 53** — **`150ms`** (down from 220). Gliding was always viable on Chromium 53 (rAF since Chrome 24; Enact glided via GPU transforms); only the declarative `scroll-behavior: smooth` CSS was post-53. In-flight glides cancel so a held d-pad chases focus. If the per-frame `scrollLeft`/`scrollTop` reflow ever stutters on the B8, the period-correct upgrade is a `translate3d` track (Enact approach). Focus transition `--focus-motion-dur 0.1s`, transform-only.
- **Platform notes:** focus motion (`html.caps-motion`) is **enabled for webOS 4+ incl. the B8** (`app.js` `applyMotionCapabilityClass`: `osMajor >= 4 || dev`); the scale grow DOES run on the B8 and stays smooth because only transform/opacity animate. The hard focus ring is the always-on primary cue. (Historic bug: firmware-number misread once enabled a janky grow + big-blur shadow — see [[caps-motion-gate-bug]]; now strict OS major + transform-only.) Chrome53 ignores `scrollIntoViewOptions` (manual math). No `:focus-within`.
- **Default rails declutter (2026-06-30):** "Leaving Soon" is **no longer a default home rail** — `composeHomeRows` (`homeFeed.js`) filters out the Plex "expiring"/"leaving" promoted hub via `isLeavingSoonHub`. It now lives in its own sidebar destination (see the Nav-item entry's Leaving Soon note), which reuses the same `/hubs/promoted` data via `loadLeavingSoonRows`.
- **"Up Next" rail (userQueue, 2026-06-30):** a dedicated Home rail for manually-queued items. **Source:** `getQueueItems(activeHomeUser || user)` (`src/playback/userQueue.js`) → `queueToHubRow` (`src/watchlists/resolve.js`, mirrors `watchlistToHubRow`: `displayVariant:'compact'`, `hubIdentifier:'home.userqueue'`, title "Up Next"). Renders through the SAME `renderHubRow`/`createMediaCard` path as every other rail, so vertical 2:3 cards, 1.03 caps-motion focus grow, anchored-slot scroll, poster priming and detail-on-select all come for free (no per-instance CSS, no `:focus-within`). **Placement:** injected in `pinContinueWatchingFirst` immediately AFTER Continue Watching / On Deck (or first when there's no resume rail), ahead of algorithmic recommendation rails — a manual queue is a deliberate "watch next" signal. **Empty state:** empty queue → `buildUserQueueRow` returns null → NO rail (never an empty row). It can be the ONLY content on Home; the "No recommendations yet" empty-state copy is guarded to not clobber a rendered `.row-section`. **Injection guard:** only added on the fresh (non-append) render (`pinContinueWatchingFirst(rows, !append)`) so the deferred-rows append can't duplicate it. **Live refresh:** `homeScreen` listens on `window` for `xplay:userqueue-changed` (`USERQUEUE_CHANGED_EVENT`); when in `home` hub mode and the event's `detail.profile` matches the active profile, it re-runs `loadHomeHub()`. Listener removed in `destroy()` (no leak). Chrome53-safe (plain `addEventListener`; dispatcher feature-detects `CustomEvent`).
- **Loading skeletons / empty rails:** `renderRowSkeletons` paints 3 grey placeholder rails while loading. A non-append (fresh) render in `renderRowsIntoFeed` **must clear them even when its `rows` are empty** — otherwise the initial phase resolving empty (e.g. brand-new user: empty On Deck + Recently Added/promoted still deferred) leaves the skeletons, the deferred rows append below them, and the leftover grey boxes clip under the immersive hero once a card is focused. Truly-empty rows never render a section (`renderHubRow` early-returns on `!items.length`).

### Library / browse grid (Films & TV overview)

- **Status:** ✅ to-spec · 2026-06-20 — rebuilt to the JetStream `categories-details` layout, reconciled to platform.
- **Android TV guideline:** [Cards](https://developer.android.com/design/ui/tv/guides/components/cards) + [Layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts)
- **Figma source:** JetStream community file `YP3cp4DjvPKyDexIoeyOF0` node `3:503` (reference layout — adopted the even card grid + centered title, **dropped** the 40%-opacity backdrop image: standard flat bg per user). Cards = kit Card `219:1934` (2:3, radius 12). Caption title = Title Medium `8661:31904` (TV Design Kit).
- **Code:** `libraryScreen()` (`src/ui/screens/libraryScreen.js`); `.library-layout`/`.library-main`/`.library-title`/`.library-toolbar`/`.media-grid` in `src/styles/app.css`; cards via `createMediaCard({layout:'grid'})`; season count from `mapLibraryItem.childCount` (`src/plex/library.js`).
- **Anatomy:**
  ```
  .library-layout (overflow: visible — rail bleeds into the gutter)
    nav.browsing-hub-nav-host        ← collapsed OVERLAY rail in the left safe-gutter (Home pattern); expands on focus
    .library-main (full --content-max width)
      h1.screen-title.library-title  ← CENTERED screen title = library name (Films / TV)
      .library-toolbar               ← filter chips (left) · Scan button (right)
        .library-filter-bar > .library-filter-chip × N
        .library-scan-btn
      .library-grid-host             ← vertical virtual-scroll viewport
        .media-grid[data-cols=6]     ← flex-wrap, 6 cards/row
          .media-card                ← 2:3 poster + 2-line caption
  ```
- **Resolved spec / values:**
  - **Full-width reclaim ("better use of space"):** the nav rail collapses into the gutter as an overlay (was a 308px in-flow sidebar squeezing the grid); `.library-main` width 100% → grid spans `--content-max`.
  - **Cards:** `--row-poster-w/h` (248×372, 2:3, radius `--radius-lg` 12) = the kit Card footprint (124×186dp ×2), **6 per row** (was dense `--grid-poster-*` 180px).
  - **Gutter:** margin-based, never `gap:` (webOS4). `.media-grid margin:-14px -14px` + card `margin:14px` → 28px between cards + 16px ring-clearance inset; 6×248 fits inside content-max with slack (a 20px half-gutter overflows the row to 5).
  - **Caption (Plax extension of the kit Card text-stack):** `.card-title` = Title Medium (Roboto Medium `--gt-weight-title`, +0.15 `--gt-ls-title`, on-surface); `.card-meta` = Label Medium (Roboto Medium `--gt-weight-label`, on-surface-variant). Films → `item.year`; shows → "N Seasons" from `item.childCount` (fallback episode count → year).
  - **Title:** centered, `.screen-title` scale (`--font-title` 52); no text-shadow (flat bg, no backdrop image).
  - **Filter chips → kit Chip `2506:17644`:** transparent + 1px outline `rgba(142,145,143,.35)` rest, radius 8, padding 8/16, label on-surface-variant Medium; selected `--active` = `--gt-secondary-container` #004A77 fill + `--gt-on-secondary-container` #C2E7FF; focus = shared control INVERSION (light fill + dark text, group rule), no ring. (Reconciles the Chip 🚧 fix-list for these instances.)
  - **Scan button → kit Button (Outline):** pill `--gt-radius-button`, 1px outline, focus = INVERSION (`--focus-fill`/`--focus-on-fill`) — deliberately NOT the recorded-broken `.btn-outline:focus`.
- **Focus:** cold landing moves to the first grid card (`focusFirstGridCardIfNeeded`, mirrors Home); sidebar tagged `data-initial-focus` so it yields. Card focus = 3px blue ring (`--border-focus`) **plus** the shared `html.caps-motion` poster scale (`--gt-focus-scale`) — which **is enabled on webOS 4+ incl. the B8** (`app.js applyMotionCapabilityClass`: `osMajor >= 4 || osMajor === 0 || dev`), so the focus glide DOES apply on the B8. It stays smooth on Chromium 53 because the animation is transform-only (no layout/paint).
  - **Virtual-scroll reconcile (`renderWindow`):** windowed grid (`GRID_COLS` 6, `BUFFER_ROWS` 3) over a `topSpacer`/`bottomSpacer` scroll extent. On a scroll shift it **reconciles incrementally** — cards still inside the window are kept (their loaded posters survive), only the cards that left are removed and the ones that entered are inserted in item-index order. A full rebuild every scroll (the original) restarts every poster from its dark placeholder → the whole grid flashes black on each row step. A `displayDirty` flag (set in `applyFilterSort`) forces a full clear when the dataset itself changes (filter/sort/load), since the item *at* each index moved; pure scrolling reuses.
    - **Scroll-back is cache-instant:** a card scrolled out of the window is destroyed and re-created on return, but the poster *bytes* stay cached (`posterImages.loadedUrls` + HTTP cache; no re-fetch). `createMediaCard` binds the poster at creation when `isPosterLoaded(url)` even if it would otherwise be deferred, so the returning card reveals from cache immediately instead of placeholder→fade. (IDB blob cache is off on B8, so this is session-scoped.)
  - **D-pad nav coupling (critical):** when the node set changes, `renderWindow` **must call `invalidateFocusableCache()`** (focus.js caches focusables per container). Omitting it = the geometric nav keeps scoring detached cards, so DOWN falls through to the always-cached bottom rail item and you can't get back into the grid. Regression-tested in `test/focus-nav-library.test.js`.
- **Platform deviations (ratified):** 2:3 not 16:9; blue focus accents; type up-scaled for 10-foot; no JetStream backdrop image (standard bg); `overflow:visible` on `.library-layout` so the negative-left rail shows (the screen + `.library-grid-host` clip their own overflow).
- **Resolved 2026-06-22:** added `position: relative; z-index: 1` to `.media-grid .card-text` — caps-motion `transform: scale(1.1)` on `.card-poster-wrap` creates a compositing layer that painted over the caption text (scaled poster's bottom edge extended ~3px into the title line). The z-index brings the text above the transformed poster wrap.
- **Tests:** `test/webos4-css-compat.test.js` — "library grid uses margin gutters not gap" (`-14px -14px` / `14px 14px`) and "library grid uses the standard 2-col card dimensions" (`--row-poster-w/h`).

### Player overlay

- **Status:** ✅ to-spec · 2026-06-22 — kit anatomy + JetStream layout pulled, reconciled to platform, and the seek-bar fix-list **applied** (commit `d9db401`): track → `--player-seek-track-h` 6px + `--progress-track-color` dark scrim + `--progress-radius`; played fill → blue `--accent`; subtitle/time tokenized to `--font-meta`/`--font-body`; thumb kept white. Earlier 📝 summary-only entry superseded.
- **Android TV guideline:** [Design for TV — Foundations](https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv) (10-ft sizing, D-pad nav, communal device) + [Focus system](https://developer.android.com/design/ui/tv/guides/styles/focus-system). The page has no dedicated "transport controls" section; the canonical transient-transport pattern is taken from JetStream (`VideoPlayerOverlay`/`VideoPlayerControls`): bottom-anchored vertical scrim, controls slide in on activity, auto-hide on idle, focus requested on show.
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `8842:27004` ("Player UI"). **NB:** this kit node is a **low-fidelity wireframe** (grey "Block" placeholders, 844×86, `bg-white` @5–20% opacity — `get_design_context` returns no real tokens beyond `neutral100 #FFFFFF`). It encodes **anatomy + geometry/ratios**, not styled tokens; colors/type are resolved from the reconciled component entries it composes (Button `169:1649`, Progress bar `719:6043`, List Item `561:3969`, Modal drawer `4498:31402`). Child node-ids (from `get_metadata`):
  - `8842:26355` — title line — x0 y0 **w200 h24**
  - `8842:26354` — subtitle line — x0 y36 **w120 h16**
  - `8842:27007` / `27006` / `27005` — right-side action icons — y16 **36×36**, x = 702 / 754 / 806 (52px pitch → **16px gap**); leftmost (`27007`) @20% = focused
  - `8842:27001` — elapsed time — x0 y76 **w48 h10**
  - `8842:27003` — total time — x796 y76 **w48 h10**
  - `8842:27002` — seek track — x60 y79 **w724 h4**
  - `8842:27008` — seek played fill — x60 y79 **w360 h4** (≈50%)
  - Derived: label↔track gap **12px** (label right-edge 48 → track left 60); seek row sits **27px** below the title/actions row (y52 → y79).
- **Code:** `src/ui/screens/playerScreen.js` (overlay markup ~L217/L241–321; `OVERLAY_HIDE_MS = 3000` L110; `scheduleOverlayHide`/`setOverlayVisible` L664–714) — overlay classes in `src/styles/app.css` (`.player-overlay` L3277; `.player-bottom` L3428; `.player-meta-header` L3440; `.player-actions` L3461; `.player-seek-row` L3567; `.player-seek-*` L3633–3703; `.player-controls-row`/`.player-transport` L3744–3769; `.player-time` L4069).

- **Anatomy (parts → slot), kit `8842:27004` + JetStream-mapped:**
  ```
  .player-overlay                      ← fixed bottom scrim band (kit: full-bleed gradient)
    .player-bottom (flex column, rhythm --space-4 / 16px)
      .player-meta-header              ← JetStream "Info" row: title block LEFT, action cluster RIGHT, bottom-aligned, ABOVE seek
        .player-meta-header__info      ← title block = kit VideoPlayerMediaTitle
          .player-now-playing-title    ← kit title line 8842:26355  (JetStream headlineMedium)
          .player-now-playing-subtitle ← kit subtitle line 8842:26354 (JetStream bodyLarge, " • " joined)
          .player-status / .player-retry-btn / .player-next-up  ← Plax additions (status, retry, up-next)
        .player-actions                ← kit right icons 8842:27005-07 (JetStream CC/audio/settings cluster)
          .player-stream-pill--icon ×3 ← Subtitles · Audio · Quality (open track-selector drawer)
      .player-seek-row                 ← kit time+track row (JetStream VideoPlayerSeeker)
        .player-time--elapsed          ← kit 8842:27001 (left)
        .player-seek-wrap > .player-seek-bar
          .player-seek-track           ← kit 8842:27002 (track)
            .player-seek-played        ← kit 8842:27008 (played fill, JetStream VideoPlayerIndicator)
            .player-seek-thumb         ← Plax/JetStream handle (kit wireframe has none)
        .player-time--total            ← kit 8842:27003 (right)
      .player-controls-row > .player-transport  ← transport cluster (JetStream Media-actions Row)
        prev · -10s · play/pause · +30s · next · stop  (6 .player-control-pill--icon)
    [overlay siblings, not in .player-bottom]
    .player-skip-intro-prompt          ← bottom-center pill (kit Button 169:1649) — see its own row below
    .player-track-modal                ← track-selector side-panel drawer (own registry entry)
    .player-info-panel / .player-autoplay-panel / .player-subtitle-delay  ← Plax aux overlays
  ```
  **Layout deviation from kit/JetStream (ratified):** JetStream stacks `[title] → [actions+CC+settings Row] → [seeker]` and has **no transport row** (its `more`/play-pause live inline). Plax splits this into **meta-header (title L / 3-icon actions R)** then **seek row** then a **dedicated centered transport cluster** below — a richer 10-ft layout where play/pause/skip get large dedicated targets. Kept.

- **Variant / State axes:**
  - `Visibility = Shown | Hidden` — `.player-overlay--hidden` (opacity→0 + delayed `visibility:hidden`). Auto-hide after **3000ms** idle (`OVERLAY_HIDE_MS`); any key/activity re-shows and re-arms.
  - `Mode = Normal | TrackModal | PlaybackError | SkipPromptActive` — class modifiers `--track-modal` / `--playback-error` / `--skip-intro-active` retarget pointer-events/visibility per region.
  - Per-control `State = Default | Focused` — focus = the shared control **inversion** (light fill + dark glyph) on pills/buttons; seek bar focus = thumb scale-up + dark halo (see table).

- **Per-element spec** — kit value · as-built (`src/styles/app.css`) · resolution:

  | Element | Kit (node `8842:27004` / composed) | As-built | Resolution |
  |---|---|---|---|
  | **overlay scrim** | full-bleed gradient (JetStream vertical black 0.1→0.8, top→bottom) | `linear-gradient(180deg, transparent 0%, rgba(10,10,15,.92) 40%, rgba(10,10,15,.98) 100%)`; `position:fixed; bottom/left/right:0`; padding `--space-7 / --pad-screen-x / --space-9` (28 / 116 / 40px) | ✅ **to-spec** — bottom-anchored gradient + safe-x gutter. Darker tail than JetStream (ratified: legibility over bright 1080p video). `--pad-screen-x` = `--safe-x` 116px ≈ kit's 56dp overscan ×2. |
  | **show/hide** | JetStream slide-in/fade-in, focus requested on show | **M3 asymmetric Fade** (2026-06-30): enter `opacity var(--dur-short4) var(--ease-emphasized-decelerate)` (200ms, emphasized-decelerate); exit `opacity var(--dur-short3) var(--ease-emphasized-accelerate)` (150ms, emphasized-accelerate) + delayed `visibility 0s linear var(--dur-short3)`. Transport/meta toggled by class. | ✅ **to-spec for platform** — opacity-only transition is Chrome53-safe; the slide is intentionally dropped (ratified — class toggle, transform/opacity only, no layout anim). Retimed from `0.22s ease` symmetric to M3 asymmetric (exit shorter than enter — M3 rule); ungated (runs on all engines, compositor-cheap). Focus defaults to play/pause on open (`focusOverlayDefault`). |
  | **title** | line `w200 h24` (`26355`); JetStream `headlineMedium` | `.player-now-playing-title` `--font-title` **52** / `--gt-weight-display` 400 / `--gt-ls-display`, 1.1, ellipsis nowrap | ✅ **to-spec** — display size + regular weight (kit ratio 24/86 ≈ 0.28 of band → up-scaled to 10-ft display). |
  | **subtitle** | line `w120 h16` (`26354`); JetStream `bodyLarge` | `.player-now-playing-subtitle` **20px** / 1.25 / `--text-secondary`, ellipsis | ⚠️ **minor** — works, but 20px is a bare literal; closest token is `--font-meta` (22) = the app's body/large up-scale. **Proposed:** `font-size: var(--font-meta)` for token alignment. Low priority. |
  | **up-next** | (Plax) | `.player-next-up` **18px** / `--text-secondary`, ellipsis | ➕ Plax extension (no kit slot). Acceptable; if tokenized → `--font-small`. |
  | **action icons (CC/audio/quality)** | 3× `36×36` @ 16px gap, right-aligned (`27005-07`) | `.player-actions` flex row, `margin-left --space-6` from title block, items `margin-left --space-3` (12px); pills `.player-stream-pill--icon` (`--player-icon-btn` 80px target) | ✅ **to-spec** — count/order/right-alignment match kit; targets up-scaled to the 80px 10-ft icon-button floor (kit 36dp glyph inside). Inter-icon gap 12px vs kit 16 — within tolerance; the larger pill targets already exceed kit pitch. |
  | **seek row layout** | elapsed (L) · track (mid) · total (R), label↔track gap **12px** | `.player-seek-row` flex, `> * + * { margin-left: 20px }`; `.player-seek-wrap` flex:1 min-width 320 | ✅ **to-spec** — elapsed→bar→total order matches kit/JetStream. Gap 20px vs kit 12 (ratified 10-ft breathing room). Margin-based rhythm (no `gap`), Chrome53-safe. |
  | **seek track** | `h4`, radius 2 (`27002`); Progress-bar kit `719:6043` = white@20% | `.player-seek-track` height `--player-seek-track-h` **6px**, `var(--progress-track-color)` (dark scrim), radius `var(--progress-radius)` 2 | ✅ **RESOLVED** (`d9db401`) — aligned to the Progress-bar tokens; 6px (new seek-specific token) chosen over the 4px base so it doesn't read thin under the 28px thumb. Now a *richer* Progress-bar variant, not a divergent control. |
  | **seek played fill** | `h4` white (`27008`); Progress-bar `--accent` blue ratified | `.player-seek-played` `var(--accent)`; `--scrubbing` also `var(--accent)`, radius `var(--progress-radius)` | ✅ **RESOLVED** (`d9db401`) — played fill is now blue `--accent`, matching every other progress surface + JetStream `primary`. Thumb stays white (white-on-blue scrub affordance). |
  | **seek handle/thumb** | none in kit wireframe; JetStream indicator is line-only | `.player-seek-thumb` **28×28** white circle, rests `scale(0.643)`, focus→`scale(1)` + `0 0 0 4px rgba(0,0,0,.35)` halo; `transition transform/box-shadow .12s` | ✅ **to-spec (ratified Plax richer control)** — kit/JetStream omit a thumb; a 10-ft scrub bar needs a grabbable handle. Transform-only focus cue (no blue ring) — Chrome53-safe. Keep, but the resting **white** thumb should stay white even after the fill goes blue (white-on-blue handle is the intended scrub affordance). |
  | **elapsed/total time** | `w48 h10` (`27001`/`27003`), flank track | `.player-time` **24px** / weight 500 / tabular-nums; `--elapsed` right-aligned min 7.5ch, `--total` `--text-secondary` left min 7.5ch | ⚠️ **minor** — 24px = `--font-body` literal; **proposed** `font-size: var(--font-body)` for token alignment. Total in `--text-secondary` (de-emphasized) is a sensible Plax refinement over kit's equal-weight blocks. tabular-nums = good. |
  | **transport cluster** | (Plax — kit/JetStream have no dedicated row) | `.player-controls-row` flex column (rhythm `--space-3`), `.player-transport` centered flex row, items `margin-left --space-3` (12px = JetStream `spacedBy(12.dp)` ✅); 6 `.player-control-pill--icon` (`--player-icon-btn` 80px) order prev·-10·play/pause·+30·next·stop | ✅ **to-spec** — 12px inter-button spacing matches JetStream exactly; one centered sequential focus zone (LEFT/RIGHT walks the chain). Margin-based, no `gap`. Dedicated row is the ratified 10-ft enrichment. Glyphs = inline SVG paths (`ICON_*` in `playerScreen.js`) traced from the Android TV kit icon set. **Stop glyph = filled square** (kit `Icon / 03` node `8677:41596`, Material `stop`; `M6 6h12v12H6z` in a 24 viewBox) — swapped 2026-06-26 from the prior hollow-square ring per user request. |
  | **skip intro/credits prompt** | composes kit Button Filled `169:1649` | `.player-skip-intro-prompt` bottom-center pill, `--button-container` fill, `--gt-radius-button`, label `--font-meta`/`--gt-weight-label`; selected(auto-focus)=light-pill inversion via `.btn:focus`; credits countdown = `transform:scaleX` fill overlay | ✅ **to-spec** (reconciled 2026-06-20). Auto-focused when shown → renders inverted ("selected"); OK-hint flips dark-on-light. Countdown anim is transform-only. **Data dep:** markers require `getMetadata` `includeMarkers=1`/`includeChapters=1` AND server-generated markers. |

- **Auto-hide / Back behavior (resolved):**
  - Idle auto-hide **3000ms** (`OVERLAY_HIDE_MS`); suppressed while a menu/info/media-info/autoplay panel is open or the motion cursor is visible (`scheduleOverlayHide` guards). On hide, if a skip prompt is active it takes focus.
  - **Layered Back dismissal** (ratified, extended 2026-06-30): a short Back closes the topmost layer first — track-modal → media-info → info-panel → autoplay-countdown → overlay-visible → **previous episode in queue** → exit player — rather than quitting outright (`handlePlayerBack`).
  - **Back → previous episode (added 2026-06-30):** once everything dismissable is closed, if `queue.hasPrevious()` a short Back steps to the prior episode (`playPreviousInQueue` → `stopPlaybackForQueueAdvance` → `loadAndPlay`) instead of exiting. This mirrors the explicit `btn-prev` transport pill. At the queue start (or single-item/no queue) Back **exits** the player as before, so the user is never trapped. The forward direction stays explicit (`btn-next` / autoplay) — Back is rewind-only by design.
  - **Long-press Back still quits the app:** `handlePlayerBack` early-returns on `e.repeat` (held key), letting the held Back bubble to the router's global 700ms long-press handler (`core/router.js`, `BACK_HOLD_MS`). The player consumes only the *first* (non-repeat) Back, so the global Exit = long-press Back convention is preserved from inside the player; this also fixed a latent bug where held Back was previously swallowed by the player.

- **Platform deviations (ratified):**
  - **Material 3 blue, not kit white/purple:** played fill + accents = `--accent #A8C7FA` (see fill fix); surfaces `#1E1F20`/`#131314`; status text `--accent`.
  - **Type up-scaled for 10-ft:** kit/JetStream mobile sizes → display title `--font-title` 52, body `--font-meta` 22, time `--font-body` 24 (kit 14→22 ratio family). Do not shrink.
  - **Chrome53/webOS4 safe:** all rhythm is margin-based (`> * + * { margin-* }`), **no `gap`**; **no `:focus-within`** (modal/active state driven by JS classes + `--track-modal`/`--skip-intro-active` modifiers); show/hide + thumb + countdown animate **transform/opacity only** (no width/height/layout, no big-blur shadow); focus motion under `html.caps-motion` (webOS 4+ incl. B8), hard focus cue (inversion / thumb-scale) always on as the primary signal.
  - **Richer than kit (kept):** dedicated transport row; grabbable seek thumb; up-next/status/retry/subtitle-delay aux slots — all Plax 10-ft enrichments with no kit slot.

- **Fix-list — ✅ ALL APPLIED 2026-06-22 (`d9db401`):**
  1. ✅ `.player-seek-track` height 12 → `--player-seek-track-h` (6px); `rgba(255,255,255,.22)` → `var(--progress-track-color)`; radius → `var(--progress-radius)`.
  2. ✅ `.player-seek-played` `#fff` → `var(--accent)` (incl. `--scrubbing`); thumb kept white.
  3. ✅ Tokenized: subtitle 20 → `--font-meta`; time 24 → `--font-body`.

### Modal drawer (canonical — pulled from kit 2026-06-20, resolved 2026-06-22)

> **The one overlay primitive.** Every transient overlay (options/selection list,
> confirm dialog, info panel) is a Modal drawer with two forms selected by the kit
> `Direction` axis: **Side panel** (`Left`/`Right`) and **Action dialog** (`Top`/`Bottom`).
> Migration intent: kill the bespoke per-screen modals (`detail-modal`/`gt-modal`
> picker, `player-track-modal-sheet`, `player-media-info`, resume-choice).

- **Status:** ✅ to-spec · 2026-06-22 — **one overlay primitive, complete.** **Action-dialog form ✅** (kit `Bottom`, `openActionDialog`; resume-choice + watchlist delete-confirm). **Side-panel form ✅** (commit `61cc0e1`): the shared `openSidePanel()` factory (`.gt-side-panel*`, reusing kit `.player-menu-option` rows) powers detail Subtitles/Quality/Episode pickers (single-select radio) **and** the watchlist bookmark picker (**multi-select checkbox** variant). Bespoke `openModal()` + `.gt-modal-option*` **deleted**; the Chrome53 no-op `gap` removed. The only retained `.detail-modal*` rules serve `openTextInputModal` (a distinct ratified Text-field surface). (Player track-selector + media-info kept their well-tested static markup; they share the row anatomy.)
- **Multi-select variant (`openSidePanel({ multiSelect: true })`):** rows become `role=checkbox` / `group`, `aria-checked` toggled **in place** (panel stays open); control = `.player-menu-option-check--checkbox` (24px, square radius-6, accent-fill + tick drawn from `::after` via `rotate(45deg) scale()` — transform/opacity only, Chrome53-safe; focused+checked inverts to dark box/light tick). Footer supports multiple actions (`footerActions` with `keepOpen`) laid out via the flex `.gt-side-panel-footer` (margin gap, no flex `gap`). Used by `watchlistBookmark.js` (toggle add/remove per list + New list + Done).

- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) (Modal variant — overlays content, scrim required for readability, active indicator shows current destination) + Foundations (transient overlays). The kit side panel is the modal-drawer overlay form, not the standard push-aside rail.
- **Reference (JetStream):** JetStream's video player (`videoPlayer/components/*`) has **no audio/subtitle/quality selection overlay at all** — only transport composables (`NextButton`/`PreviousButton`/`RepeatButton`/`VideoPlayerSeeker`/`VideoPlayerOverlay`). Its only overlay primitive is `tvmaterial/Dialog.kt` → `StandardDialog` / `FullScreenDialog` / base `Dialog` (scrim + `RoundedCornerShape` + `widthIn` container; icon → title → text → `DialogFlowRow` of buttons), used for profile confirms (`AccountsSectionDeleteDialog`). That maps 1:1 to our **action-dialog** form and confirms the **side-panel** form is kit-derived, not JetStream-derived.
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / Modal drawer component `4498:31402` (variant axis `Direction=Top|Bottom|Left|Right`). Side-panel `Right` detail node `4616:28363`; rows = List Item `561:3969`; kit menu list `8842:26171`.
- **Code (as-built):**
  - Action dialog → `openActionDialog()` in `src/ui/components/controls.js` (`.gt-dialog` / `.gt-dialog-sheet` / `.gt-dialog-text` / `.gt-dialog-heading` / `.gt-dialog-desc` / `.gt-dialog-actions`, `src/styles/app.css:3102+`). Self-contained UP/DOWN + Back D-pad; body-level overlay so `attachFocusNav` never sees it.
  - Player side panels (bespoke, kit-styled) → `src/ui/screens/playerScreen.js`: `.player-track-modal` / `.player-track-modal-sheet` / `.player-track-modal-header` / `.player-menu-list` / `.player-menu-option` (`app.css:3940+`, `:4099+`); media-info `.player-media-info-modal` / `.player-media-info-sheet` / `.player-media-info-body` (`app.css:4246+`). Player focus/key JS (`data-focus-zone` trap) kept intact; only the presentation is the drawer.
  - **NOT migrated** (still bespoke off-kit picker) → `openModal()` in `controls.js` (`.detail-modal`/`.gt-modal` overlay, `.detail-modal-sheet`/`.gt-modal-sheet`, `.detail-modal-option`/`.gt-modal-option`, `.detail-modal-cancel`; `app.css:3081+`, `:3171+`, `:3220+`, `:5360+`). Callers: `detailScreen.js` Subtitles / Quality / Episode pickers (lines 425/457/803) and `watchlistScreen.js:83`.
  - Resume-choice → `src/ui/resumeChoice.js` (`showResumeOrStartModal` calls `openActionDialog`; bespoke `.detail-modal` markup deleted).
  - Tokens (`src/styles/app.css:138+`): `--modal-sheet-max-w 420` (side width cap, 10-ft up-scale of kit 280) · `--drawer-side-w 280` · `--drawer-side-min-h 320` · `--drawer-edge-gap --space-6 (24)` · `--drawer-player-bottom 280` · `--drawer-dialog-h 200` · `--drawer-actions-w 268` · `--z-player-overlay 1002`.

#### Form A — Side panel (`Direction=Left|Right`) — selection / info list

Kit container (node `4498:31402` Right / detail `4616:28363`): `bg #1E1F20` (surface-container), `drop-shadow dark/3` (`0 1px 3px #0000004D, 0 4px 8px 3px #00000026`), `h-full`, `p-20`, `radius-16`, `w-280`, `gap-16`; scrim black @60%; edge-anchored. Body = a **List**: `List/Header` then **List Items**.

- **Variant axes:** `Direction=Left|Right`; row `State=Default|Selected|Focused|Pressed|Disabled` (List Item `561:3969`).
- **Anatomy (parts → slot):** `scrim` (black @60%) · `panel` (surface-container, radius 16, shadow dark/3) → `List` → `List/Header` (title) + N× `List Item` (`icon?` / `content`[`title`, `subtitle?`] / `control?`).

| Element | Kit value (`4498:31402` / `561:3969`) | As-built (player sheets) | Ratified deviation |
|---|---|---|---|
| panel bg | `#1E1F20` surface-container | `--bg-surface` #1E1F20 ✅ | — |
| panel radius | 16 | `--radius-xl` 16 ✅ | — |
| panel padding | 20 (p-20) | `--space-5` 20 ✅ | — |
| panel shadow | dark/3 `0 1px 3px #0000004D, 0 4px 8px 3px #00000026` | identical ✅ | — |
| panel width | 280 | `--modal-sheet-max-w` **420** | up-scaled ×1.5 for 10-ft / 1080p |
| panel height | `h-full` | content-sized: `min-height --drawer-side-min-h 320`, `max-height 100%`; list is the flex scroll region (`flex:1 1 auto; min-height:0; overflow-y:auto`) | **ratified** — `h-full` leaves dead space below short track lists; content-sized + scroll |
| position | edge-anchored L/R, `h-full` | floats in from right `--drawer-edge-gap` 24 inset, **bottom-anchored** (`align-items/justify-content:flex-end`) resting `--drawer-player-bottom` 280 above the trigger cluster | **ratified** — button-launched in player; not full-height/centred |
| scrim | black @60% | `rgba(0,0,0,0.6)` ✅ | — |
| header | `List/Header` pt-8 pb-16 px-16, **no divider**, title 22/28 Regular `#E3E3E3` (title/large) | `.player-track-modal-header` `--space-2 --space-4 --space-4` (8/16/16), borderless ✅; title `--font-body` 24 (kit 22 up-scaled), `--gt-weight-title` 500, centred + ‹ › category chevrons | title up-scaled 22→24; chevrons = ratified player addition (step Subtitles↔Audio↔Quality without closing) |
| list item box | `gap-8 px-16 py-12 radius-8`, height **64** | `.player-menu-option`: `padding --space-3/--space-4` (12/16), `radius-md` 8, `min-height --list-item-h` 64 ✅ | — |
| item icon | leading 24 @80% (`showIcon`) | omitted | **ratified** — a track choice needs no leading icon at 10-ft |
| item content | `title` 16/24 Med +0.15 `#E3E3E3` + `subtitle?` 12/16 Reg @80% | single-line `label` only (`--font-body` 24, ellipsis, flex-1) | **ratified** — single-line radio choice; title up-scaled 16→24, no subtitle/overline |
| item control | trailing 24 radio/check (`control`) | `.player-menu-option-check` 24px radio (`--icon-md`); inner dot revealed via `::after scale()` (transform/opacity only) ✅ | — |
| item Selected | light fill `#E3E3E3` + dark text `#131314` | `--active` = soft `rgba(227,227,227,.16)` + filled `--accent` radio (current); `:focus` = full light-fill inversion `--focus-fill`/`--focus-on-fill` (cursor) | **ratified** — two-tier: "current" (soft) vs "focused" (inverted); blue `--accent` radio dot is the M3-blue expression of kit Selected |
| selected/active cue | `:focus-within`-driven in kit | **JS classes** (`--active` / element `:focus`) | **required** — Chrome53 discards any rule using `:focus-within` |
| slide-in | — | `@keyframes gt-drawer-right-in` (opacity + `translateX(24px)→0`) under `html.caps-motion`; else instant show. **M3 enter timing** (2026-06-30): `var(--dur-medium1)` 250ms `var(--ease-emphasized-decelerate)` (replaced M2-legacy `0.2s cubic-bezier(0.4,0,0.2,1)`). Scrim/container fade `gt-overlay-in` retimed to `var(--dur-short4)` 200ms emphasized-decelerate; bottom-sheet `gt-sheet-in` (translateY 14px) likewise `medium1`/emphasized-decelerate. Kept ≤300ms (no M3 450–600ms longs on TV). | **required** — transform/opacity only; instant on webOS4 without caps-motion |
| slide-out (exit) | — | **none — instant DOM removal** (`removeChild` in `controls.js` `close()`/`openSidePanel`, playerScreen `overlay.remove()`). Entrance-only; no symmetric exit keyframe. | **ratified** — dismissal is instant; no exit anim invented (would over-engineer). Scrim untouched (`rgba(0,0,0,0.6)` ✅). |

Media-info panel (`.player-media-info-sheet`) reuses the same panel box (bg/radius/padding/shadow/min-h identical); body `.player-media-info-body` is the flex scroll region. **Player-only footer** (`.player-track-modal-footer` Cancel = `.btn .btn-outline .btn--sm`) is a ratified addition — the kit side panel has no footer; it is borderless.

#### Form B — Action dialog (`Direction=Top|Bottom`) — confirm / prompt  ✅ RESOLVED

Kit container (node `4498:31402` Bottom `4624:28709`): `bg #1E1F20`, `h-200`, `flex gap-20 items-center justify-center px-34 py-24 radius-16 w-full`, edge-anchored top/bottom, scrim @60%. Body = **Text** column + **Actions** column.

- **Variant axes:** `Direction=Top|Bottom`; action `State` inherited from Button (`169:1649`).
- **Anatomy (parts → slot):** `scrim` · `dialog` (surface, radius 16) → `Text`[`Heading`, `Description?`] + `Actions`[`Primary`, `Secondary?`].

| Element | Kit value | As-built (`.gt-dialog*`) | Note |
|---|---|---|---|
| dialog bg | `#1E1F20` | `--bg-surface` ✅ | — |
| dialog height | 200 | `min-height --drawer-dialog-h` 200 ✅ | min, not fixed (content can grow) |
| dialog radius | 16 | `--radius-xl` 16 ✅ | — |
| dialog padding | py-24 px-34 | `--space-6 --space-8` (24/32) | px 34→32 (nearest token; ratified) |
| dialog shadow | (node) `0 4px 4px #00000026, 0 1px 1.5px #0000004D` (≈ dark/2) | identical ✅ | matches the node's drop-shadow string |
| dialog width | `w-full` (capped by frame) | `width 100%; max-width --content-max` ✅ | — |
| anchor | top/bottom edge | `align-items:flex-end; justify-content:center` (Bottom) ✅ | — |
| scrim | black @60% | `rgba(0,0,0,0.6)` ✅ | — |
| layout gap | `gap-20` (text↔actions) | `.gt-dialog-text { padding-right --space-8 }` + `.gt-dialog-actions { margin-left --space-5 }` | **required** — flex `gap` no-ops on Chrome53; replaced with margin/padding |
| heading | 28/36 Regular `#E3E3E3` (headline/medium) | `--font-row-label` 30, `--gt-weight-headline` 400, `--text-primary` | kit 28→30 up-scaled |
| description | 16/24 Reg @80% +0.25 `#E3E3E3` (body/large) | `--font-body` 24, `--text-secondary`, `margin-top --space-4` | kit 16→24 up-scaled |
| actions col | `w-268 gap-12` | `width --drawer-actions-w 268` ✅; `.btn + .btn { margin-top --space-3 }` (12) | gap→margin (Chrome53) |
| Primary | Button Filled — `#E3E3E3` fill, `#303030` label, radius 12 | `.btn-primary` (always-blue filled, kit-reconciled; light-fill inversion on focus) | **ratified** — one blue primary per dialog; see Button entry |
| Secondary | Button — `#444746` @40% fill, `#E3E3E3` label, radius 12 | `.btn` (surface-variant `#444746 @80%` fill, kit-reconciled; inverts on focus) | rest fill @80% vs kit's @40% secondary — matches the ratified canonical `.btn`; ratified |
| slide-in | — | `@keyframes gt-sheet-in` (opacity + `translateY(14px)→0`) under `html.caps-motion`; else instant | **required** — transform/opacity only |

- **Mapping:** resume-choice (✅ migrated, Primary=Resume / Secondary=Start) → action dialog. Player track-selector (audio/subtitle/quality) + media-info → side panel. Detail Subtitles/Quality/Episode pickers + watchlist → **should be** side panel (currently bespoke — see fix-list).

#### Ratified exception — autoplay / Up-Next is NOT a modal drawer
It is a *passive prompt shown over still-playing video* during credits (`.player-autoplay-panel` toast). A scrimmed, focus-trapping modal would dim the video and trap focus (UX regression). Intentionally kept non-modal. No action.

#### Platform reconciliation (applied)
- **Engine Chromium 53 / webOS 4:** no flex `gap` (margin/padding rhythm — `> * + * { margin-top }` on sheets, `.btn + .btn`/`.gt-dialog-text padding-right`/`.gt-dialog-actions margin-left`); no `:focus-within` (JS `--active` / element `:focus` drive selected/focused); no `inset` shorthand (sheets use explicit `top/right/bottom/left:0`); slide-in is transform/opacity only under `html.caps-motion`, else instant class toggle.
- **Theme M3 blue:** selected/active accents use blue `--accent #A8C7FA` / `--accent-soft` (radio dot, current-row tint), NOT literal kit purple. Focus inversion uses `--focus-fill #E3E3E3` / `--focus-on-fill #303030` (kit inverse-surface pair). Surface `--bg-surface #1E1F20`.
- **Type up-scaled for 10-ft:** header 22→`--font-body` 24; row label 16→`--font-body` 24; dialog heading 28→`--font-row-label` 30; dialog desc 16→`--font-body` 24.
- **Rows / actions reuse shipped components:** side-panel rows = the ✅ Player-track-selector row (kit List-Item-correct); dialog actions = `.btn` / `.btn-primary` / `.btn--sm`.

#### Fix-list — ✅ ALL APPLIED 2026-06-22 (`6e553b2`/`9325c68`/`61cc0e1`)
1. ✅ **`openModal()` pickers migrated to the side panel.** `detailScreen.js` Subtitles/Quality/Episode + `watchlistScreen.js` call `openSidePanel()` (single-select); the off-kit `.detail-modal-option` rows (min-height 50 / radius-0 + left bar / ✓ glyph) are gone, replaced by the kit `.player-menu-option` rows (64 / radius-8 / 12-16 / 24px radio) + a `.btn .btn-outline .btn--sm` cancel. `openModal()` + `.gt-modal-option*` CSS **deleted**.
2. ✅ **Shared `openSidePanel({ title, options, onPick | onToggle, footerActions, multiSelect })` factory** in `controls.js` (`.gt-side-panel*`, reusing the shipped `.player-menu-option` anatomy). Single-select (radio) **and** multi-select (checkbox) modes. Player track-selector + media-info kept their well-tested `attachFocusNav` markup but share the row styling.
3. ✅ **Chrome53 `gap` nit cleared** — removed the no-op `gap: var(--space-2)` on `.player-menu-option`.
4. ✅ **Multi-select checkbox variant** — `watchlistBookmark.js` migrated off `.detail-modal` to `openSidePanel({ multiSelect: true })` (see the Multi-select variant note at the top of this entry); watchlist **delete-confirm** also moved to `openActionDialog`. The only retained `.detail-modal*` rules serve `openTextInputModal` (a distinct ratified Text-field surface).

✅ **Resolved 2026-06-22 — one overlay primitive, all consumers conforming.** Remaining bespoke modal markup is only the Text-field input surface (`openTextInputModal`), which is intentionally distinct.

#### Platform deviations (ratified — no action)
- Side panel: width 280→`--modal-sheet-max-w` 420; `h-full`→content-sized 320..100% w/ scrolling list; player sheet bottom-anchored above the trigger + 24px right float (button-launched, not full-height/centred); player-only borderless Cancel footer; no leading icon / no subtitle on track rows; blue `--accent` radio + two-tier current/focused.
- Action dialog: px 34→32; blue `.btn-primary`; `.btn` rest fill `#444746 @80%` (canonical) vs kit @40% secondary.
- Autoplay/Up-Next stays a non-modal toast.
- All focus inversion + slide-in are M3-blue / transform-only / JS-class-driven per the Chrome53 + theme constraints above.

#### Verification
Built + launched in the webOS 26 simulator; full suite green except the pre-existing unrelated hub-poster-prefetch failure. Action dialog (resume-choice) and player side panels eyeballed in-sim; the off-kit `openModal()` picker (fix-list #1) confirmed against `app.css:3220+` and the four callers above. Interactive D-pad behaviour to be re-checked on B8.

### List item  (kit reference — pulled 2026-06-19)

- **Status:** 📐 kit reference (not a standalone shipped component; rows reuse this)
- **Android TV guideline:** [Lists](https://developer.android.com/design/ui/tv/guides/components/lists)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `561:3969` (states) · `561:3970` (Default)
- **Anatomy (parts → slot):**
  - `container` — required; flex row, `gap 8`, `padding 12/16`, `radius 8`, width 280, height 64
  - `background` — required; fill layer (carries state)
  - `icon` — optional (`showIcon`); 24px, opacity 80%, leading
  - `content` — required; vertical block, flex-1:
    - `overline` — optional; Roboto Medium 11/16, +0.1, opacity 60%
    - `title` — required; Roboto Medium 16/24, +0.15, `#E3E3E3`
    - `subtitle` — optional; Roboto Regular 12/16, +0.2, opacity 80%
  - `action` — optional; trailing text, Roboto Medium 14, `#8E918F`
  - `control` — optional; 24px checkbox / radio / switch
- **Variant axes:** `State=Default|Selected|Focused|Pressed|Disabled`, `showIcon`, `overline`, `subtitle`, `action`, `control`
- **App instances:** `.gt-list-item` (Settings rows) reuses this — see Settings screen entry.

### Player track-selector sheet  ✅ reconciled to List Item

- **Status:** ✅ reconciled 2026-06-20 to the kit List Item spec (was 🚧 documented 2026-06-19)
- **Android TV guideline:** [Lists](https://developer.android.com/design/ui/tv/guides/components/lists) (rows) + [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) (panel)
- **Figma kit refs:** Menu `8842:26165` · Modal drawer `4498:31402` · rows = List Item `561:3969`
- **Code:** `.player-track-modal-sheet` → `.player-menu-list` (`role=radiogroup`) → `.player-menu-option` (`role=radio`) in `src/ui/screens/playerScreen.js` (sheet ~line 298–306; row builder ~line 1262–1280) + `src/styles/app.css:3840+`
- **Anatomy (resolved):** `sheet` (title + prev/next category chevrons + list + Cancel) ; `row` (`.player-menu-option`) = single-line `label` (ellipsis, flex-1) + trailing 24px radio `control` (`.player-menu-option-check`); container flex row, **gap 8, padding 12/16, radius 8, min-height 64** (kit-correct). Active = light fill (`rgba(227,227,227,.16)`) + filled accent radio; focus = light-fill inversion (no `:focus-within` — JS `--active`/`:focus` classes); control dot revealed via `::after scale()` (transform/opacity only).
- **Ratified 10-foot deviations** (kept, documented): no leading `icon` slot; no `overline`/`subtitle` (a track choice is a single-line radio); selection rendered as tint + accent radio = our token-system expression of the kit `Selected` state.
- **Resolved deviations** (reconciled toward kit): row `min-height 48 → 64`; `radius 999px → 8`; `padding 8/18 → 12/16`; bare `✓` glyph → proper 24px **radio `control`** (single-select is radio-correct). Single builder feeds audio/subtitle/quality selectors, so all three are consistent.

### Progress bar  ✅ reconciled 2026-06-20 — consolidated to one token-driven bar

- **Status:** ✅ to-spec (with ratified 10-ft deviations) · 2026-06-20
- **Android TV guideline:** Foundations (no dedicated page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / `719:6043` (40% variant `719:6044`)
- **Anatomy (canonical kit):** `track` (height **3**, radius 2, white **@20%**) + `fill` (white solid, radius 2) + optional `handle` dot (16px, seek bars)
- **Resolved as-built (one definition):** shared base `.progress-track` (height `--progress-track-h`, bg `--progress-track-color`, radius `--progress-radius`, `overflow:hidden`, `pointer-events:none`) + `.progress-fill` (full height, bg `--progress-fill-color`, radius `--progress-radius`, width set inline by JS). Tokens in `:root` (`src/styles/app.css:15+`):

  | Token | Value | vs kit |
  |---|---|---|
  | `--progress-track-h` | **4px** | kit 3 — 3px reads too thin over poster art @1080p (ratified 10-ft) |
  | `--progress-track-color` | `rgba(0,0,0,0.55)` | kit white@20% — opaque dark scrim is more legible over artwork (ratified) |
  | `--progress-fill-color` | `var(--accent)` (blue `#A8C7FA`) | kit white — **ratified**: blue `--accent` is the app's Material 3 progress/seek color, used everywhere |
  | `--progress-radius` | 2px | = kit |

- **Variants (positioning only, all extend the base):** `.media-card .card-progress` (bottom of poster, corner radius `0 0 var(--radius-md)…`); `.detail-progress-bar` (corner radius `0 0 16px 16px`); `.detail-episode-progress` (square). The seek bar (`.player-seek-*`, playerScreen) is a separate richer control (track + played + handle) and out of scope for this badge-bar consolidation.
- **Code (as-built):** `.progress-track`/`.progress-fill` + variants `src/styles/app.css:1596+`, `:2207+`, `:2640+`; render sites `src/ui/components/mediaCard.js` (card), `src/ui/screens/detailScreen.js` ×2 (movie + episode). JS sets `fill.style.width = pct + '%'` — width contract unchanged.
- **Platform:** Chrome53-safe — no `inset`/`calc`-division/`gap`; explicit edges + `width` style only. Passes `webos4-css-compat` + full suite (600).

### Text field (search input, log-sink URL, any text input)

- **Status:** ✅ to-spec for the **outlined modal field** (`openTextInputModal` / settings) AND the inline **search input** · 2026-06-20
- **Android TV guideline:** Foundations + Layout (no dedicated page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / `3815:25016` (default `3816:24930`); focused `3815:25032`, active/typing `3984:26492`
- **Anatomy (canonical):** column `gap 6` → `label` (14/20 Medium `#C4C7C5`) + `field` (`gap 8`, `padding 12/16`, bg `#303030`, **radius 8**, optional `leading icon` 24, `input` 16/24 Medium `#E3E3E3`, optional `trailing icon` 24) + optional `supporting text` (12/16 `#C4C7C5`)
- **Resolved as-built — outlined field** (`.gt-text-input-wrap` → `.tv-text-input-label` + `input.tv-text-input`; used by `openTextInputModal`):

  | Property | Rest | Active (keyboard open) |
  |---|---|---|
  | Label color | `#C4C7C5` | `#A8C7FA` (toggled via JS `--active` class — **no `:focus-within`**) |
  | Field bg | `#303030` | transparent |
  | Border | 1px `#8E918F` | 2px `#A8C7FA` |
  | Radius | 8px | 8px |
  | Padding | 14×18 (scaled from kit 12×16 for 10-ft) | same |
  | Input text | `#E3E3E3` 24px/500 (scaled from 16) | same |
  | Caret | `#A8C7FA` | same |

- **Resolved as-built — inline search input** (`input#search-input.search-input`; live on-screen `<input type="search">`, not routed through `openTextInputModal` — keyboard/input contract unchanged) · 2026-06-20: mirrors the `.tv-text-input` field box — bg `#303030`, 1px `#8E918F` rest border, **radius 8**, padding 14×18 (kit 12×16 scaled), input `#E3E3E3` 24px/500 (kit 16 up-scaled, ratified), caret `#A8C7FA`, active = own `:focus` → 2px `#A8C7FA` + transparent bg. No label/wrap (bare input), so field-box rules are inlined rather than shared with the wrap class. Active is the element's real `:focus` (NOT `:focus-within` on a parent) — Chrome53-safe. Search-specific: `width 100% / max-width 980px / min-height 56px`.
- **Code (as-built):** outlined modal field `.gt-text-input-wrap`/`.tv-text-input` (`src/ui/components/controls.js`, `src/styles/app.css:5142+`); inline `#search-input`/`.search-input` (`src/ui/screens/searchScreen.js`, `app.css:4624`); the **log-sink URL** field uses the Inline Edit-Toggle pattern (next entry).
- **Keyboard/input contract (inline native inputs):** while a live `<input>`/`<textarea>` is the active field, the on-screen-keyboard editing keys act on the FIELD, not the app — **Left/Right move the cursor, Back/Backspace deletes a char, Enter/OK commits/submits**; Up/Down (and Back on an empty field) leave the field. Enforced centrally in `src/ui/focus.js` via a `window` capture-phase guard (`onEditableKeydown`) that claims these keys with `stopImmediatePropagation` before the geometric d-pad engine *and* the router's global Back handler (`src/core/router.js`) can hijack them; it tracks the active field so the contract survives the webOS keyboard pulling DOM focus to `<body>`. **Enter/commit detail:** when the webOS keyboard has stolen DOM focus to `<body>`, the Enter handler in `onEditableKeydown` re-dispatches a synthetic `keydown(13)` to the tracked input element so its screen-level handler fires (e.g. `searchScreen.js` runs the search immediately). In the normal case where the field truly owns DOM focus, the event falls through to the element's own handler directly — no double-dispatch. The modal field (`openTextInputModal`) has its own `document` capture-phase handler that also handles Enter and is unaffected (it fires before `window` capture, not after, and handles its own tracked reference). Regression history: the original per-screen handling was silently dropped when the d-pad engine was rewritten (`a72371d`, zone-graph → geometric); cursor/delete restored generically 2026-06-26; Enter/commit fixed 2026-06-26 using the same focus-stolen guard pattern.
- **Deviations / fix-list:** none — both fields reconciled to spec.

### Login / Auth field  (Plax variant of Text field — full-screen sign-in)

- **Status:** ✅ to-spec · 2026-06-20 — Plax variant; larger than the base **Text field** for focused full-screen auth (provider picker, Jellyfin login). Reconcile note: this is the home for the larger 18×24 sizing (base Text field stays kit-scaled 14×18).
- **Android TV guideline:** Foundations + Layout (no dedicated text-field page)
- **Figma source:** `mociiAKRCHeosHwEl586wx` — **login layout example** `8736:19388` (kit composes the *standard* Text Field `3815:25016` into a centered sign-in column; there is **no distinct login field in the kit** — this variant is our own 10-ft up-scale). Active/typing field `3984:26492`.
- **Why a variant:** the kit reuses the base field on its login screen (`px16/py12`, 16/24 input, 6px gap, ~268px col @540p ≈ 560px @1080p). For a 10-foot, remote-driven sign-in we scale that field **×1.5** so the target and label read across the room — distinct from fields buried in a settings list (which stay at the base Text-field size).
- **Anatomy (parts → slot):** identical structure to **Text field**, scaled — column `gap 9` → `label` (21/30 Medium) + `field` (`padding 18×24`, bg `#303030`, **radius 8**, border 1px `#8E918F` rest / 2px `#A8C7FA` active, `input` 24/36 Medium `#E3E3E3`, caret `#A8C7FA`) + optional `supporting text`.
- **Resolved as-built values (×1.5 from kit base):**

  | Property | Value | Kit base ×1.5 |
  |---|---|---|
  | Label | 21px / lh 30 / ls 0.1, `#C4C7C5` (→ `#A8C7FA` active) | `label/large` 14/20 |
  | Field padding | 18px × 24px | 12 × 16 |
  | Label↔field gap | 9px | 6 |
  | Input text | 24px / lh 36 / 500w, `#E3E3E3` | `title/medium` 16/24 |
  | Field bg / border / radius | `#303030` / 1px `#8E918F` (2px `#A8C7FA` active) / 8px | same as base |
  | Column width | ~560px | ~268px @540p |

- **Code (as-built):** connect-page fields `.jellyfin-login .login-field` (`__label` + `__btn`) in `src/styles/app.css`; they open `openTextInputModal({ variant: 'auth' })`, which adds `.gt-text-input-wrap--auth` so the modal field (`.tv-text-input`) matches this variant's sizing — and **only** on auth screens (settings/watchlist callers omit `variant` and stay at the base Text field size). `.login-fields` column ≈ 560px.
- **Gating:** the ×1.5 lives in `.gt-text-input-wrap--auth { gap; label; input }` overrides; base `.tv-text-input*` stays kit-scaled. Auth callers (jellyfinLoginScreen ×3, jellyfinUserPickerScreen ×2) pass `variant:'auth'`.
- **States:** rest (bg `#303030`, 1px `#8E918F`) · active/typing (border 2px `#A8C7FA`, label → `#A8C7FA`, toggled via JS `--active` class — **no `:focus-within`**) · placeholder `#8E918F`.
- **Platform notes:** Chrome53 — active state via JS class, not `:focus-within`. Text entry routed through `openTextInputModal` (dedicated surface; avoids buried-field keyboard occlusion). Brand-neutral; usable by Plex pairing too.

### Inline Edit-Toggle Field (full-width read row → inline editor)

- **Status:** ✅ to-spec · 2026-06-20
- **Reuses:** `createSettingsActionRow` (read row) + the outlined **Text field** spec (editor input). No new Figma node.
- **When to use:** a rarely-edited single value (e.g. a URL) where text entry should be gated behind an explicit select so the webOS keyboard only opens on purpose.
- **Code:** `wireLogSinkField()` in `src/ui/screens/settingsScreen.js`; `.gt-settings-editor*` + read row `.gt-list-item`/`.gt-settings-*` in `src/styles/app.css`.
- **Anatomy:**
  ```
  #log-sink-block
    button.gt-list-item.gt-settings-item#log-sink-row     ← READ row (full-width, focusable): label + value/"Not set" + chevron
    .gt-settings-stacked.gt-settings-editor#log-sink-editor[hidden]   ← EDIT mode: label + input.tv-text-input + .gt-settings-editor__actions (Save · Cancel · Test) + hint
  ```
- **State machine:** Read = read row visible, editor `[hidden]`, only the read row is a focus stop. Editing = editor visible, read row hidden, focus contained input↔Save/Cancel/Test. Transitions: select row → reveal editor + focus/select-all input (raise keyboard) · Enter/Up/Down on keyboard → focus Save · Save → commit + back to read · Cancel/Back/Esc → revert + back to read.
- **Why a full-width read row (D-pad):** the geometric nav penalises cross-axis offset ×8, so a short input + right-aligned CTA below full-width rows got skipped on **Down**. A full-width read row sits on the travel column (offset 0) → Down always lands on it.
- **Key trapping (critical):** while editing, a **document capture-phase** `keydown` intercepts so the screen's `attachFocusNav` can't steal focus. Input: `461`/`8`=delete · `37`/`39`=cursor · `13`/`38`/`40`=close-kbd→Save · `27`=cancel. Buttons: `37`/`39` cycle Save/Cancel/Test · `38`=re-open keyboard · `40` swallowed · Back/Esc=cancel · Enter=native click. Hide the read row only AFTER focusing the input (else focus collapses to `<body>` and trips the focus watchdog).
- **Platform notes:** editor `[hidden]` keeps its buttons out of the nav while reading. Test pings the value currently in the editor.

### Settings screen (grouped cards)

- **Status:** ✅ to-spec · 2026-06-26 — **applied to `main`** (ported from `feat/settings-redesign`; live code now matches this spec). The flat `.settings-row` screen is gone.
- **Pattern:** single vertical scroll of overline-titled **cards**, each holding **list-item rows**; keeps the global left sidebar (no second rail). Built on `.gt-list-item` (= List item) + M3 blue tokens. Replaces the old flat `.settings-row` list, native `<select>`s, and the on-screen Back button.
- **Code:** `settingsScreen()` + `renderPlaybackSettings` / `renderNetworkSettings`; row factories in `src/ui/components/controls.js`; `.gt-settings-*` / `.gt-switch` in `src/styles/app.css`.
- **Layout:**
  ```
  .settings-layout → nav.browsing-hub-nav-host (global sidebar) + .settings-main
    h1.screen-title · #settings-content
      p.settings-status                       ← inline feedback line
      section.gt-settings-group × N → h2.gt-settings-group__title (UPPERCASE overline) + .gt-settings-card (surface-container, radius-lg, 1px outline; hairline row dividers)
      .gt-settings-footer                      ← Sign out (destructive action row)
  ```
  Cards: Account (info) · Plex Home · Watchlists (cond.) · Playback · Network · Developer · Sign-out footer.
- **Row vocabulary (factories in `controls.js`):**
  | Factory | Element | Use | Focus |
  |---|---|---|---|
  | `createSettingsInfoRow` | `div.gt-settings-info` | read-only label + value | **not** focusable (D-pad skips) |
  | `createSettingsPickerRow` | `button.gt-list-item` | 3+ choices → `openModal` picker; trailing value + chevron | focusable |
  | `createSettingsSwitchRow` | `button.gt-list-item` `role=switch` | binary on/off; Enter flips `.gt-switch` | focusable |
  | `createSettingsActionRow` | `button.gt-list-item` | runs `onSelect`; optional hint + chevron; `destructive` tints label | focusable |

  Rules of thumb: **2 states → switch**, **3+ → picker (modal)**, navigation/one-shot → action row, immutable → info row.
- **Tokens:** card bg `--bg-surface #1E1F20`; border/dividers `--border #444746`; radius `--radius-lg 12`; overline `--font-small 19/600` uppercase `--text-secondary`; row focus inherits `gt-list-item:focus` (`--focus-fill #E3E3E3` / `--focus-on-fill #303030`); switch off `--text-muted`, on `--accent`.
- **Platform notes:** switch has no transition (Chrome53-safe); no on-screen Back (remote-only); the destructive footer action has no confirm dialog (parity with prior behaviour — revisit if accidental triggers occur).
- **Account / Profiles / Forget (current, grouped-card form):** Account card carries a **"Switch server"** `createSettingsActionRow` (→ `server-picker {_from:'settings'}`, non-destructive cross-provider jump) + the build-stamped App-version info row. The Profiles card's **"Switch profile"** action is provider-aware (`jellyfin-users` vs `profile-picker`) and the Plex Home roster only fetches for Plex. The footer card holds the destructive **"Forget server"** action row (`gt-settings-item--destructive`): removes **only the current saved link** (`removeSavedLink` keyed by `'plex:'+clientId` or `'jf:'+serverId`) + `clearActiveSession()`, then routes to `server-picker` if other links remain, else `provider-picker`. See [Server picker](#server-picker-cross-provider-saved-link-chooser).
- **✅ Drift resolved 2026-06-26:** the 2026-06-23 code/registry drift (live screen was still the flat `.settings-row` layout) is **closed** — the grouped-card redesign was ported onto current `main` (`controls.js` `createSettings*` factories adapted to the current `openSidePanel` API; `.gt-settings-*` CSS with flex `gap`→margin for Chrome53; `networkSettings.js`/`playbackSettings.js` taken from the branch; screen rewritten as grouped cards preserving Switch/Forget server + Jellyfin awareness). Source branch `feat/settings-redesign` retired.

### Appearance / Theme picker (Settings sub-screen)  ✅ rebuilt to-spec 2026-06-30

- **Status:** ✅ rebuilt to-spec · 2026-06-30 — implemented as `src/ui/screens/appearanceScreen.js` (route `appearance`, registered in `app.js`; entered via Settings → Appearance card → "Theme & appearance" `createSettingsActionRow` → `navigate('appearance')`). **Rebuild note:** the prior 2026-06-30 build was a single inline-styled strip — labels overlapped the sample components, there was no editor column, and **no `.appearance-*` layout CSS existed** at all (everything rode inline styles + `--role-*` indirection vars). That was a defect; this entry now records the reconciled **fixed two-column** screen and supersedes it. **As-built design (vs the 📐 target below — they now agree):** a real `.appearance-*` CSS layout in `src/styles/app.css` (no inline-style fallback); a **left live-preview column** rebuilt PER screen from **real component classes** (`.btn`/`.btn-primary`, active chip, `.gt-switch--on`, progress fill, focus ring) with selectable `[data-slot]` target buttons, and a **right editor column** (Role picker + Tone ramp + contrast warning + Save). Screen tabs (Home/Detail/Player/Settings) swap the left mock. **As-built reconciliations:** (1) overrides are stored & read via `src/settings/appearancePrefs.js` (`getAppearancePrefs`/`setOverride`/`getOverrideContrast`) and applied through the `--palette-<role>-<tone>` ramp vars — NOT the old ad-hoc `--role-*` indirection vars (removed); (2) the unified **Theme** + **Contrast** segmented controls and the role picker use `.appearance-segmented__chip` / `.appearance-role` (purpose-built `.appearance-*` classes, not `.detail-setting-chip`) — active chip → native `disabled` (focus engine `isNavFocusable` skips it) plus a CSS `:disabled` dim rule that now exists; (3) the live colours still cascade through the real component rules already wired in app.css (`.btn-primary` L1039, chip-active L5346/5499, `.gt-switch--on` L5645, `--progress-fill-color` L23, `--border-focus` L34) because the mocks use those classes directly. Anatomy + zones otherwise match the target below.
- **Android TV guideline:** [Settings](https://developer.android.com/design/ui/tv/guides/components) — full-screen sub-screen reached from Settings; D-pad select-then-adjust across two focus zones (no pointer dependency).
- **Figma source:** none dedicated. Reuses kit Chip `2506:17680` (theme chips + role picker, segmented), Tabs `17:848` / tab item `17:849` (screen-tab row), List item `561:3969` (list-shaped preview/editor rows), Modal drawer `4498:31402` framing patterns (split body). File `TLtknC3rZXQqWe3uIivt94`.
- **Code (as-built):** shell `src/ui/screens/appearanceScreen.js` (signature `(root, params, navigate)`; keeps the existing focus/destroy pattern) — owns the header (title + unified Theme & Contrast segmented + Reset/Save footer), the `.appearance-tabs` screen-tab row, and the two-column `.appearance-body`; event-delegates click/ENTER on `.appearance-stage [data-slot]` to toggle `.appearance-target--selected` and call `renderEditor`. Left preview mocks: `src/ui/components/appearance/{previewHome,previewDetail,previewPlayer,previewSettings}.js` — each exports one builder (`buildHomePreview` / `buildDetailPreview` / `buildPlayerPreview` / `buildSettingsPreview`) returning a recognizable mock of that screen from real component classes + `.appearance-chrome` decoration, with focusable `<button class="appearance-target" data-slot="…">` targets. Right editor: `src/ui/components/appearance/appearanceEditor.js` — `renderEditor(container, slotKey, { onChange })` (slot title + Role picker `.appearance-role` + Tone ramp `.appearance-swatch` + contrast note + persists via `setOverride`) and `renderEditorEmpty(container)`. Override store + contrast math: `src/settings/appearancePrefs.js` (unchanged; pre-existing). CSS `.appearance-*` section in `src/styles/app.css`.
- **Anatomy (parts → slot):**
  - `theme-picker` — required; unified **segmented** `.appearance-segmented` of **4 `.appearance-segmented__chip`** (Default, Cyan, Gold, Teal) following the kit Chip / segmented pattern; selecting calls `setTheme(k)`; the **currently-active** theme chip renders **Disabled** (native `disabled` + `:disabled` dim — kit Chip `State=Disabled`).
  - `contrast-control` (rebuilt 2026-06-30) — sibling unified **segmented** `.appearance-segmented` **Contrast: Standard / Medium / High** in the header (`.appearance-segmented__chip`, same purpose-built class as the theme picker — NOT `.detail-setting-chip`). Selecting calls `setContrast(level)` (applies live) then re-renders; active read from `getAppearancePrefs().contrast`. For `theme==='default'` the Medium/High chips render **Disabled** (native `disabled` + `:disabled` dim, focus engine skips) with a hint — the blue default theme ships no medium/high tonal blocks.
  - `screen-tabs` — required; `.appearance-tabs` row of `.appearance-tab` (+`--active`) pills (Home / Detail / Player / Settings) selecting which preview mock shows; rebuilds `.appearance-stage` with the chosen `buildXPreview()` mock. Reuses the kit Tabs pill pattern.
  - `body` — required; **fixed split-column** `.appearance-body` (left ~60% `.appearance-preview`, right ~40% `.appearance-editor`; Chrome53-safe gap via margins/padding):
    - `preview` (LEFT) — `.appearance-preview` > `.appearance-stage` holding the active screen mock, built from **real component classes** + `.appearance-chrome` decorative bits (hero block, 2:3 poster rail, nav rail, seek bar, settings rows). Customize targets are focusable `.appearance-target` buttons carrying `data-slot`, with the `.appearance-target__label` placed BELOW/BESIDE the sample (never overlapping — the old strip's defect) and a `--selected` accent ring. Per-screen slots: Home = primaryButton (hero Play) / focusAccent (poster) / progressFill (continue bar) / selectedChip (nav item); Detail = primaryButton (Play) / selectedChip (genre/season) / focusAccent (cast/related); Player = progressFill (seek) / primaryButton (skip-intro) / focusAccent (transport); Settings = switchOn (toggle) / selectedChip (picker value) / focusAccent (list row). Mocks attach NO handlers — the shell event-delegates on `[data-slot]`.
    - `editor` (RIGHT) — `.appearance-editor` (+`--empty` hint "Select an element in the preview…"); **always-visible** column (NOT a `:focus-within`-revealed panel — Chrome53). `renderEditor` builds:
      - `role-picker` — primary / secondary / tertiary / neutral `.appearance-role` chips (current `--active`).
      - `tone-ramp` — `.appearance-tone-ramp` wrap row of `.appearance-swatch` squares, each `style background = --palette-<role>-<tone>` hex off the active theme's tonal ramp; current marked.
      - `contrast-warning` — inline badge under the tone ramp on every role/tone change. Calls `getOverrideContrast(slotKey)` (try/catch-guarded; skipped if absent/throws); when `level !== 'pass'`: `large-only` → `.appearance-warning` muted "OK for large text only", `fail` → `.appearance-warning--fail` (`--danger`) "Low contrast — may be hard to read". Semantic tokens only, no hardcoded hex.
  - `footer` — required; `.appearance-actions`: **Reset to default** (`.appearance-reset` → `resetAppearance`) + a transient **"Saved ✓"** affordance (`.appearance-save`) shown after any theme/contrast/override change (overrides auto-persist; this is user-trust only).
- **Variant axes:** `Theme=Default|Cyan|Gold|Teal` (active → chip `Disabled`); `Screen=Home|Detail|Player|Settings`; `Role=primary|secondary|tertiary|neutral`; `Tone=<tonal-ramp steps>`; `State=Rest|Focus|Press` (derived, not authored).
- **Customization model:** per-component-**class** override of **role × tone** (the 5 slots `primaryButton` / `selectedChip` / `switchOn` / `progressFill` / `focusAccent`), persisted in `appearancePrefs.js` and applied through the `--palette-<role>-<tone>` ramp vars; editing a slot recolors it on **every** screen (the per-screen mocks just show each slot in context). Defaults: primaryButton/switchOn/progressFill/focusAccent = primary/80, selectedChip = secondary/40. Selecting a preview target (`.appearance-stage [data-slot]`) then adjusting role/tone in the right editor is the **select-then-adjust** D-pad flow across the two columns; `onChange` rebuilds the preview so the recolor shows live.
- **Per-element spec (reuse, do not re-derive):** theme/contrast segmented chips + role picker = `.appearance-segmented__chip` / `.appearance-role` on the kit Chip pattern (8/16 padding, radius 8, 1px `#8E918F @35%` outline, label `--font-meta` 22, active = `--gt-secondary-container` fill, focus = shared control inversion) — see Chip entry. Screen tabs = `.appearance-tab` on the `.gt-tab` pill pattern (min-height `--target-min` 52, radius 24, selected filled pill, focus inversion) — see Tabs entry. Preview targets/sample surfaces and editor rows follow `.gt-list-item` rhythm (radius 8, focus `--focus-fill`/`--focus-on-fill`). Disabled chip = kit Chip Disabled treatment.
- **Platform deviations (ratified):** Chrome53 / webOS4 — **no `:focus-within`** (editor column is always rendered; active-target binding driven by JS classes, not `:focus-within`); no `color-mix`/relative-color (per-slot colours read straight off `--palette-<role>-<tone>` hex; `rgba(var(--x-rgb),a)` lines end `/* chrome53-ok */`); focus motion transform/opacity-only under `html.caps-motion` (webOS5+); targets/chips are real `<button>` so the focus engine picks them up; vertical 2:3 cards in the mocks (never 16:9); M3 **blue** token base with per-class role×tone overrides layered on top (not the old gold); chip label up-scaled to 22px (Plax 10-ft rule).

### Splash screen  📐 reference (2026-06-26)

- **Status:** 📐 reference — app-specific; no Figma kit component. Spec is the task brief.
- **Code:** `src/ui/splashScreen.js` (`createSplash()`) · CSS `.splash-screen` / `.splash-screen--out` / `.splash-logo` in `src/styles/app.css` (end of file).
- **Anatomy:**
  ```
  .splash-screen   ← position:fixed inset:0 background:#000 z-index:9999
    .splash-logo   ← 440px wide, color:#fff, contains plaxWordmarkSvg() inline SVG
  ```
- **Behaviour:** injected into `document.body` synchronously in `startApp()` before the first `navigate()` call. Dismissed (fade-out 0.4s opacity transition, then DOM removal) via `onFirstMount()` callback in `src/core/router.js` — fires once after the first screen factory returns (line after `entry.instance = routes[...](host, ...)` in `render()`). One-shot: `firstMountCallback` is nulled on first invocation.
- **Logo:** `plaxWordmarkSvg()` from `src/ui/brand/plaxLogo.js` — the full "plax" wordmark SVG (viewBox 216×100, `currentColor` letters + purple→blue gradient right-arm on the "x"). Host element is `color:#fff` so the wordmark renders white on black.
- **Chrome53 notes:** uses `-webkit-` flex prefixes; `transition: opacity` on a `position:fixed` element is supported on Chromium 53. No `inset` shorthand (explicit `top/right/bottom/left: 0`).

---

### Status badges  (app-specific — audited 2026-06-19)

- **Status:** ✅ app convention (no direct kit component; nearest = Tag `4212:27233`)
- **Code:** `.badge-watched` (30×30, top-right) · `.badge-progress` (`--accent-soft`/`--accent`) · `.badge-unwatched` (`--success` green) `src/styles/app.css:1456+`
- **Anatomy:** small dot/pill on the poster, semantic color only; keep inside poster bounds, no focus-ring overlap.
- **Note:** not from the kit — a Plax convention; kept deliberately. No reconciliation needed.

### Plax brand logo  (app-specific — added 2026-06-23)

- **Status:** ✅ app brand asset (no kit component — this is the product wordmark, not a Material element).
- **Single source of truth:** `src/ui/brand/plaxLogo.js` exports `plaxWordmarkSvg()` (full "plax") + `plaxMarkSvg()` (compact "x"). The launcher-icon rasteriser `scripts/generate-icons.cjs` mirrors the same geometry — edit both together.
- **Figma source:** wordmark node `51-57` (viewBox content 76 157→1090 623, shifted to `0 0 1015 466` via `translate(-76,-157)`); mark node `51-56` (viewBox `98 55 297 284`). File `JZ0qDjpVZrGhgxHDHgsBCZ`.
- **Anatomy (wordmark):** "pla" = bezier letterforms; "x" = gradient left chevron (on top of "a" per Figma z-order) + amber gold upper + lower shapes. Both gradient polygons rendered (one behind, one above letters) for depth.
- **Brand colors:** gradient `#AA5CC3` (purple, top) → `#00A4DC` (blue, bottom); gold `#EBAF00`. Hard-coded as `PLAX_GRAD_*` / `PLAX_GOLD` in `plaxLogo.js`.
- **Color usage:** "pla" letters use `currentColor` (white `--gt-text` on dark TV UI). x mark colors are fixed.
- **Nav drawer sizing:** mark = `40×40px` (collapsed icon-only rail). Wordmark = `height: 40px; width: auto` (peek/expanded) — matches mark height so the lockup occupies the same vertical space in both states.
- **Hosts:** nav drawer brand lockup — full wordmark on **peek/expanded** rail, compact "x" mark when **collapsed** (`.browsing-hub-brand__mark` / `__wordmark`, `src/styles/app.css:1524+`, built in `browsingHubNav.js`). Launcher tiles `assets/icon.png` (80×80) + `assets/icon-large.png` (130×130).
- **webOS compliance:** icons are 80/130 px full-bleed square RGBA PNGs, solid `#0a0a0f` background, no pre-rounded corners. `appinfo.json` `iconColor: #0a0a0f`.
- **Platform notes:** SVG `linearGradient`/`currentColor` render on Chrome 53. Collapse/expand driven by JS `--expanded`/`--peek` host classes (not `:focus-within`).

### Tabs (season selector)  ✅ reconciled 2026-06-20

- **Status:** ✅ to-spec · 2026-06-20 — adopted the kit pill Tabs. Was the largest divergence in the registry (bare text links → before that, a text-tab + sliding-underline variant); now a filled-pill tab row.
- **Android TV guideline:** [Tabs](https://developer.android.com/design/ui/tv/guides/components/tabs)
- **Figma source:** Tabs strip `17:848`; **tab item** `17:849` (default) — states `17:849` Default · `2536:16789` Inactive · `21:860` Selected · `17:778` Focused; types Primary/Secondary. Tab Row `8689:34922`.
- **Anatomy (canonical):** `tab` (flex, **height 32**, `padding 6/16`, **radius 16** pill) + `label` (Roboto Medium **14/20**, +0.1, `#C4C7C5`) + optional `leading icon`; states `Default|Inactive|Selected|Focused` × `Primary|Secondary`; Selected = filled pill.
- **Code (as-built):** `createTabs()` in `src/ui/components/controls.js` renders `.gt-tabs[data-focus-zone]` (role=tablist) → `button.gt-tab` (role=tab) × N, `.gt-tab--active` for selected; `setActive(id)` repaints. Season selector wires it in `detailScreen.js` (`#detail-season-tabs`, zone `detail-season-tabs`); CSS `.gt-tab*` in `src/styles/app.css`.
- **Resolved spec:** pill — `border-radius:--radius-pill` (24; kit 16), `padding:--space-3/--space-4` (12/16), `min-height:--target-min` (52), Default `background:transparent` / label `--gt-text-2`. **Selected = filled pill** `--gt-secondary-container` fill + `--gt-on-secondary-container` label (Material 3 blue; mirrors the ✅ Library filter chip active state). **Focused** = shared control inversion (`--focus-fill` / `--focus-on-fill`, `.gt-tab:focus`) — no `:focus-within`, no ring.
- **Ratified deviations:** label kept at `--gt-body` (ratified 10-ft size, not kit 14/20); pill geometry up-scaled for 10-ft — `min-height 52` + `12/16` padding + `radius 24` (vs kit `32` / `6/16` / `16`), matching the established Library-filter-chip up-scale ratio. The old `underline` variant (text tabs + `.gt-tabs__indicator` sliding bar) and its `positionIndicator` machinery were removed — no consumer remained.
- **Focus/selection wiring (preserved):** d-pad LEFT/RIGHT/DOWN unchanged — tabs are still focusable `.gt-tab` buttons inside the `[data-focus-zone="detail-season-tabs"]` host; `onSelect` → `loadShowEpisodes`; first tab auto-focused on load. Only the visual treatment changed.

### Profile picker screen + Profile card ("Select User" / "Who's watching?")

- **Status:** ✅ to-spec · 2026-06-22 — canonical spec captured and the 3-bug fix-list **applied** (commit `97d7566`): (1) avatar now **circular** via new token `--profile-avatar-radius: 50%`; (2) focus-scale fixed `--focus-scale-med` (undefined, was a silent no-op) → `--gt-focus-scale-med` (1.05), transform-only + caps-motion-gated; (3) lock badge re-anchored to the round avatar's top-right (14%/14%). Shared verbatim by the Jellyfin user picker. Invariants preserved (`:not(.profile-card)` non-inversion; blue focus ring / white selected ring).

- **Android TV guideline:**
  - [Cards](https://developer.android.com/design/ui/tv/guides/components/cards) — 1:1 square ratio is the documented ratio for "cast/crew, logos" (people/identity); selectable tiles get a focus state + adequate padding so the focus grow never overlaps neighbours.
  - [Layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts) — overscan safe margins (48dp L/R, 24dp T/B), N-card layouts (4-card = 196dp tiles, 20dp gutter), reading-order focus path (top-left first).
  - [Focus system](https://developer.android.com/design/ui/tv/guides/styles/focus-system) — focus ring is the always-on primary cue; scale 1.025–1.1.

- **Reference (JetStream):** JetStream (android/tv-samples `JetStreamCompose`) has **no full-screen profile *picker* grid**, but it *does* have the analog primitives, which were used:
  - `…/screens/dashboard/UserAvatar.kt` — a **circular `Surface` (`CircleShape`)**, `focusedScale = 1f` (NO scale on focus), focus border = `JetStreamBorderWidth` @ `onSurface` (white), **selected border = `primary`**, content = Material `AccountCircle` icon `fillMaxSize()`. This is the exact "selectable circular avatar tile" analog → validates: circular avatar, ring-based focus, distinct *selected* (primary/accent) vs *focused* border.
  - `…/screens/profile/AccountsSelectionItem.kt` — account list tile: `fillMaxWidth().aspectRatio(2f)` rounded-rect (`shapes.extraSmall`), 8dp outer + 16dp inner padding, `titleSmall` 15sp title + `labelMedium` @75% subtitle, `focusedScale = 1f`. (A 2:1 settings-list tile, not the picker; used only for label/padding rhythm.)
  - No dedicated PIN pad in JetStream — PIN pad falls back to the kit Button + a 3×4 grid (10-foot numeric keypad convention).

- **Figma source (composed — no dedicated "user picker" kit component):** `TLtknC3rZXQqWe3uIivt94`
  - **Avatar+name = `Account Switch` `557:3895`** (the kit's profile-switcher row, the nearest avatar/identity pattern; variants `State=Default|Focussed`, `Expanded`). **Avatar is a CIRCLE** (`rounded-[40px]` on a 32px box), fill `primary-container #0842A0`, **rest border 1px `outline #8E918F`**; **Focussed = avatar scales 32→40px (≈1.25×) + 2px `primary #A8C7FA` ring**; name = `title/medium` (Roboto Medium 16/24, +0.15, on-surface `#E3E3E3`), secondary = `body/small` (Roboto Regular 12/16, +0.2, @80%). The expanded-row Focussed light-pill (`#e3e3e3` fill + `#303030` text) is the **nav-drawer row** inversion and is *not* adopted for the full-screen tile.
  - **Tile geometry = Card `337:1709`** (2:3 variant `219:1934`) — radius 12, `title/medium`; the picker overrides ratio to **1:1 circular** (see deviations).
  - **PIN pad key = kit Button `169:1649`** (Filled): rest fill `surface-variant #444746 @80%`, label Roboto Medium, focus = invert to light fill `#E3E3E3` + dark label `#303030`.
  - **Tokens pulled (Account Switch):** `primary #A8C7FA`, `primary-container #0842A0`, `outline #8E918F`, `on-surface #E3E3E3`, `inverse-surface #E3E3E3`, `inverse-on-surface #303030`, `title/medium`, `body/small`.

- **Code:**
  - Plex: `src/ui/screens/profilePickerScreen.js` (`profilePickerScreen`, `appendProfileAvatar`, `renderProfiles`, `renderPinPad`/`addPinKeyButton`, `enterPinMode`/`exitPinMode`).
  - **Jellyfin reuses this DOM/CSS verbatim:** `src/ui/screens/jellyfinUserPickerScreen.js` (`makeCard`/`render`) builds the same `.profile-card`/`-avatar`/`-name`/`-lock` markup + a `.profile-card--other` "+" tile; no PIN pad (Jellyfin auth = password via `openTextInputModal`). (See the Jellyfin user picker entry below — it points back here.)
  - PIN entry model: `src/ui/pinEntry.js` (`createPinEntry`).
  - Styles: `.profile-picker-screen` / `.profile-picker-row` / `.profile-card*` / `.pin-*` in `src/styles/app.css:4530–4825`; focus groups (note `.profile-card` is **excluded** from the control-inversion group) at `src/styles/app.css:360,383,419,455`.

- **Anatomy (parts → slot):**
  - `.profile-picker-screen` — root; sets `--profile-picker-cols` (1–4, from Plex `homeSize` / Jellyfin card count via `clampProfilePickerCols`) and the derived `--profile-picker-max-w`.
  - `.profile-picker-header` — required; `h1.profile-picker-title` ("Select User" → "Enter PIN" in PIN mode; Jellyfin: "Who's watching?") + inline `.plax-spinner` (loading / signing-in).
  - `.profile-picker-status` — optional; error/progress line (`watch-status-error` modifier on error).
  - `.profile-picker-row[data-focus-zone]` — required; flex-wrap, centered, **margin-based gutter** (no `gap`). Holds the tiles.
  - `button.profile-card.card` — the selectable tile (×N). Parts:
    - `.profile-card-avatar` — **required**; the circular identity tile (img via `--img` modifier, else 2-letter initials). **This is the element that carries the focus ring + scale.**
    - `.profile-card-name` — required; single-line name label below the avatar.
    - `.profile-card-lock` — optional (gated: Plex `u.hasPin`; Jellyfin `hasPassword && !cachedToken`); 🔒 glyph, top-right overlay.
    - `.profile-card--other` — Jellyfin-only variant; "+" avatar + "Other user" → manual username entry.
  - `.profile-picker-pin` (Plex only) — PIN sub-screen, shown in PIN mode:
    - `.pin-display` — masked digit readout (tabular-nums, wide tracking).
    - `.pin-error` — error line (`--visible` modifier; triggers `pin-shake` on the display via `.profile-picker--pin-error`).
    - `.pin-pad` → `.pin-pad-grid` → `.pin-pad-row` × 4 → `button.pin-pad-btn.btn` (1–9, then spacer · 0 · Delete). **PIN pad key = kit Button.**

- **Variant / State axes:**
  - **Picker mode** (`screen` class): `browsing` (default) ↔ `pinEntry` (`.profile-picker--pin-mode`: row collapses to the single selected tile, PIN panel revealed). Also `--loading`, `--awaiting-size` (chrome hidden until `homeSize` resolves so column count doesn't jump).
  - **Card state:** `Default` → `Focused` (`:focus`) → `Selected` (`.profile-card--selected`) → (Jellyfin) `--other`, `--admin`.
  - **PIN-pad key state:** `Default` → `Focused` (`:focus`) → key variants `--zero`, `--delete`.

- **Per-element spec — kit value vs as-built vs ratified deviation:**

  | Element | Property | Kit value (`557:3895` / `169:1649`) | As-built (`app.css`) | Verdict |
  |---|---|---|---|---|
  | tile (`.profile-card`) | container | flex column, transparent, no own border | `flex column`, transparent, `border-radius:0`, `padding:0` | ✅ to-spec (avatar carries the ring, not the tile) |
  | tile | width / column | 4-card = 196dp; pitch from `--profile-picker-cols` | `--profile-card-min` **160px**, `margin 12px` (24px gutter), `flex:0 0 160` | ✅ ratified (160 + 24 gutter, max 4 cols = 712px) |
  | avatar (`.profile-card-avatar`) | **shape** | **CIRCLE** (`rounded-40` on 32px) | **circular** `border-radius: var(--profile-avatar-radius)` (50%) | ✅ **RESOLVED** (`97d7566`) — circular via new token; matches kit `Account Switch` avatar + JetStream `CircleShape`. |
  | avatar | size | 32→40 on focus (row context) | `width:100%` of 160 tile, `height:--profile-card-min` (160px square) | ✅ ratified (up-scaled to a 10-foot 160px tile; keep 1:1) |
  | avatar | rest fill / border | `primary-container #0842A0`, 1px `outline #8E918F` | `--bg-elevated #1B1B1B`, `--focus-w 3px transparent` (ring target) | ✅ ratified (dark elevated surface + transparent ring slot; app does not tint identity tiles blue at rest — neutral surface reads better behind photos/initials) |
  | avatar | initials | (kit shows photo) | 44px / weight 700, `--text-primary` | ✅ ratified (10-foot initials fallback) |
  | avatar | **focus ring** | **2px `primary #A8C7FA`** | `border-color: var(--accent)` + `--focus-shadow` (blue glow + dark halo) | ✅ to-spec (blue accent ring = the always-on primary cue) |
  | avatar | **focus scale** | 32→40 ≈ **1.25×** (kit row); app cards 1.03–1.06 | `transform: scale(var(--gt-focus-scale-med))` (1.05) under `html.caps-motion` | ✅ **RESOLVED** (`97d7566`) — was `--focus-scale-med` (undefined → silent no-op); now `--gt-focus-scale-med`, transform-only, caps-motion-gated, webOS 4+. |
  | name (`.profile-card-name`) | type | `title/medium` 16/24 Medium +0.15 on-surface | `--font-body` **24px**, `--gt-weight-label` 500, `--gt-ls-label`, `--text-secondary #C4C7C5`, single-line ellipsis | ✅ ratified (kit 16 → 24 for 10-foot; secondary at rest is intentional — it brightens on focus) |
  | name | gap to avatar | (kit row gap 12) | `margin-top: var(--space-3)` (12px) | ✅ to-spec |
  | name | **focus color** | (row inverts wholesale) | `:focus` → `--accent` blue; `--selected` → `--text-primary` white | ✅ ratified — see "selected vs focused" below |
  | lock (`.profile-card-lock`) | — | (no kit lock in `557:3895`) | absolute **top/right 14%**, 18px, opacity .8, 🔒 | ✅ **RESOLVED** (`97d7566`) — re-anchored to 14%/14% so it sits on the round avatar's top-right edge, inside bounds, clear of the focus ring. |
  | **selected** (`.profile-card--selected`) | border / label | kit row Focussed = light pill `#e3e3e3`+`#303030`; JetStream `UserAvatar` selected = `primary` border | white ring `0 0 0 3px --text-primary` + white name | ✅ ratified — **distinct from focus**: focus = blue (`--accent`), selected = white (`--text-primary`), declared after focus so it wins when both. Marks the chosen profile during PIN entry / no-PIN bootstrap. |

- **PIN pad (`.pin-pad-btn`) → kit Button `169:1649` (sub-component):**

  | Property | Kit Button (Filled) | As-built | Verdict |
  |---|---|---|---|
  | class | — | `.pin-pad-btn.btn` (composes the canonical Button) | ✅ inherits Button fill/focus |
  | size | container from content + consistent padding | fixed **84×64px** key, `margin 6px` (12px gutter), 3-col grid | ✅ ratified (fixed-pitch 10-foot numeric keypad; Chrome53-safe explicit rows, no flex-wrap miscount) |
  | rest fill | `surface-variant #444746 @80%` (`--button-container`) | inherited from `.btn` | ✅ to-spec |
  | label | Roboto Medium 14/20 | `--font-body` 24px (Delete = `--font-meta` 22) | ✅ ratified 10-foot up-scale |
  | radius | 40 (pill) | inherited `--gt-radius-button` 999 | ✅ to-spec (pill) |
  | **focus** | invert → light fill `#E3E3E3` + dark label `#303030` | shares the control-inversion group (`.pin-pad-btn:focus`, `app.css:392`) → `--focus-fill`/`--focus-on-fill` | ✅ to-spec (light-pill inversion; note PIN keys **DO** invert, unlike `.profile-card` which is excluded) |
  | focus scale | 1.1× (kit) | `scale(var(--focus-scale))` 1.06 under caps-motion (`app.css:428/464`) | ✅ ratified (transform-only, webOS 4+) |
  | display readout | — | `.pin-display` 36px, `letter-spacing .35em`, tabular-nums | ✅ ratified |
  | error | — | `.pin-error` `--danger`; `pin-shake` translateX keyframe on display | ✅ ratified (transform-only animation, Chrome53-safe) |

- **Deviations from kit — fix-list ✅ ALL APPLIED 2026-06-22 (`97d7566`):**
  1. ✅ **Avatar circular** — `.profile-card-avatar border-radius` → `var(--profile-avatar-radius)` (new `:root` token = 50%). Matches kit `Account Switch` avatar + JetStream `CircleShape`.
  2. ✅ **Focus-scale token fixed** — `var(--focus-scale-med)` (undefined → silent no-op) → `var(--gt-focus-scale-med)` (1.05); transform-only, caps-motion-gated.
  3. ✅ **Lock re-anchored** — `top/right` `--space-3` (square corner) → `14%/14%` so it sits on the round avatar's edge.

- **Platform deviations (ratified — keep):**
  - **Circular 1:1 avatars**, not the kit Card's 2:3 — people/identity tiles are round by 10-foot convention (kit's own `Account Switch` avatar is circular; cards elsewhere stay 2:3).
  - **`.profile-card` is excluded from the generic control focus-inversion group** (`:not(.profile-card)` at `app.css:360/383/419/455`). It must **NOT** invert to a light pill like Buttons/Chips — it's a card, not a control. Its focus = blue avatar ring + 1.05× avatar scale + name → `--accent`. (The PIN-pad keys are controls and **do** invert.)
  - **Two-tier state:** Focus = blue (`--accent`), Selected = white (`--text-primary`) — mirrors JetStream's split (focus `onSurface` vs selected `primary`); the app maps selected→white, focused→blue to read against the Material 3 blue theme.
  - **Focus motion** (avatar scale + PIN-key scale) runs only under `html.caps-motion` (webOS 4+, incl. B8); transform/opacity only; the ring is the always-on cue.
  - **Type up-scaled for 10-foot:** name 16→24, PIN key 14→24, PIN display 36.
  - **Margin-based rhythm, no `gap`** on `.profile-picker-row` / `.pin-pad-grid` / `.profile-picker-pin` (Chrome53). Explicit `.pin-pad-row`/`.pin-pad-grid` columns avoid the webOS 4 flex-wrap miscount. Selected/PIN-mode state via **JS classes**, never `:focus-within`. `pin-shake` is transform-only.
  - **Column count is data-driven** (`--profile-picker-cols` 1–4, clamped); `--awaiting-size` hides chrome until `homeSize` resolves so the grid doesn't reflow on load.

- **Token map (current → target):**
  - Reuse: `--accent` (focus ring/name), `--text-primary` (selected), `--text-secondary` (rest name), `--bg-elevated` (avatar surface), `--font-body`/`--font-meta`, `--gt-weight-label`/`--gt-ls-label`, `--space-3`, `--gt-radius-button`, `--button-container`, `--focus-fill`/`--focus-on-fill`, `--focus-shadow`, `--gt-focus-scale-med`, `--focus-scale`.
  - **Propose new:** `--profile-avatar-radius: 50%` (so the circular shape is one token, globally controllable) — none of the existing radius tokens express a circle for a square box (`--gt-radius-card` 12, `--radius-pill` 24, `--gt-radius-button` 999 would also round it but is semantically "button"; a dedicated avatar token is clearer).

---

## Jellyfin backend (app screens — feat/jellyfin-backend)

### Provider-picker card (first-run backend chooser)

- **Status:** ✅ to-spec · 2026-06-20 (app-specific; no kit selection-card component)
- **Figma source:** none — built on the app `.card` base + foundation tokens (superseded an earlier low-contrast tile design per user feedback)
- **Code:** `providerPickerScreen()`; `.provider-card*` in `src/styles/app.css`
- **Anatomy:**
  ```
  .provider-cards                          ← flex row, gap --space-7, centered
    button.provider-card.card  × 2         ← data-provider + data-brand=plex|jellyfin
      span.provider-card__media → svg.provider-card__logo   ← branded gradient bg + official brand mark
      span.provider-card__desc             ← how this backend connects
  ```
- **Brand marks (single source of truth):** `src/ui/brand/providerMarks.js` — `plexMarkSvg`/`jellyfinMarkSvg` (official Plex 2022 wordmark + Jellyfin icon, supplied by user). Shared with the [Server picker](#server-picker-cross-provider-saved-link-chooser); the old hand-drawn `<text>`-based inline logos were removed (looked low-res). Logos sized **per-brand** to fill the media band: Plex wordmark `width:78%`/`max-height:96px`; Jellyfin square icon `height:150px`/`width:auto`. Plex media sets `color:--text-primary` so the wordmark letters render white (chevron stays gold `#EBAF00`); Jellyfin mark keeps its own purple→blue gradient.
- **Tokens:** card bg `--bg-elevated #1B1B1B` + soft shadow; 1px `--border` / `--radius-lg 12`; 420px wide, media 200px tall; brand media — Plex radial gold `rgba(229,160,13,.18)`, Jellyfin radial purple→blue `rgba(123,92,230,.20)`→`rgba(0,164,220,.06)`; desc `--space-5 --space-6 --space-6`, `--gt-body`, `--text-secondary`→`--text-primary` on focus; focus = `border-color:--accent` + `--focus-shadow` + **deeper brand gradient** (Plex `.18→.30` / `.04→.08`; Jellyfin `.20→.34` / `.06→.12`).
- **Platform notes:** ring only, no scale (caps-motion gate). Brand: Plex gold `#E5A00D`, Jellyfin gradient `#AA5CC3→#00A4DC`.
- **Resolved 2026-06-26 (focus light-fill leak):** the focused card showed a **white band** where the description sits (light desc text vanished on white). Cause: `.provider-card` carries the `.card` class, so it matched the generic control focus inversion `.card:not(.media-card):not(.profile-card):focus { background:--focus-fill }` (and the caps-motion scale group) — both painting the card light. Fix: added `:not(.provider-card)` to those two generic groups (`app.css` ~L388 inversion + ~L459 scale), mirroring the existing `:not(.profile-card)` exclusion. The card now keeps `--bg-elevated`; `.provider-card:focus` supplies the only focus chrome (ring + `--focus-shadow` + deeper brand gradient + desc→`--text-primary`). Honors "ring only, no scale".
- **Resolved 2026-06-26 (low-res logos):** the picker still used crude hand-drawn `<text>`-based inline SVG logos (font-rendered "PLEX"/"Jellyfin") — looked low-res/banded and undersized. Swapped to the official vector marks from `providerMarks.js` (already used by the Server picker), sized per-brand to fill the media band (Plex wordmark 78% width; Jellyfin icon 150px tall). Added `color:--text-primary` on the Plex media so the currentColor wordmark reads white.
- **Resolved 2026-06-22:** removed `filter: brightness(1.25)` on `.provider-card:focus .provider-card__media` — it was brightening the gradient to near-logo-color and reducing SVG logo contrast (Plex gold-on-gold, Jellyfin gradient-on-gradient). Replaced with explicit `:focus` gradient rules per brand that deepen the background opacity, keeping logo contrast intact. Ring + `--focus-shadow` remain the primary cue.

### Server picker (cross-provider saved-link chooser)

- **Status:** ✅ to-spec · 2026-06-23 (new screen — **card grid**, redesigned from the initial list version per user)
- **Figma source:** none — app-specific flow; card visuals reconcile to the ✅ **Provider-picker card** (brand-logo media) + ✅ **Profile card** (square tile, ring+scale focus, NOT the light-fill control treatment).
- **Android TV guideline:** [Cards](https://developer.android.com/design/ui/tv/guides/components/cards) (selection cards, single-select grid).
- **Purpose:** one screen to jump between **every saved Plex/Jellyfin link** without re-linking. Reached at launch (not signed in + ≥1 saved link) and from **Settings → Switch server** (`_from:'settings'`, which adds a Back button). Switching is **non-destructive** — only the active session is cleared; saved links + cached Jellyfin sessions survive.
- **Code:** `serverPickerScreen()` (`src/ui/screens/serverPickerScreen.js`); brand marks `src/ui/brand/providerMarks.js` (`plexMarkSvg`/`jellyfinMarkSvg`/`addServerGlyphSvg` — official Plex 2022 wordmark + Jellyfin icon, supplied by user); `.server-card*` in `src/styles/app.css`; route `server-picker` in `app.js`; routing in `startupRouting.js`.
- **Anatomy:**
  ```
  .screen.screen-center.server-picker-screen
    h1.screen-title          ← "Choose a server"
    p.screen-subtitle        ← "…switching never removes them."
    .server-card-grid        ← flex-wrap, centered, margin -12px (cancels card inset), ≤4/row
      button.server-card[data-brand=plex|jellyfin][data-link-id] × N
        span.server-card__media → svg.server-card__logo   ← square brand tile (radius-lg), brand radial tint
        span.server-card__label                            ← Plex: account name · Jellyfin: server URL
      button.server-card.server-card--add[data-add=1]
        span.server-card__media → svg.server-card__glyph   ← outlined circle + plus (no logo)
        span.server-card__label                            ← "Add a new server"
    button.btn.server-picker-back            ← "Back" (only when _from === 'settings')
  ```
- **NB — no `.card` base class:** `.server-card` deliberately does NOT carry `.card` (it leaks the generic light-fill focus inversion → white tile, same trap profile/provider cards avoid). All chrome is on `.server-card*` directly.
- **Card spec:** square media tile `--server-card-w` (240px) radius `--radius-lg`; logo `62%`/max-h `56%`; brand tints — Plex gold radial `rgba(229,160,13,.18→.04)` + media `color:--text-primary` (wordmark letters = currentColor white, chevron stays `#EBAF00`), Jellyfin purple→blue radial `rgba(123,92,230,.20)`→`rgba(0,164,220,.06)` (mark keeps its own gradient). Add tile = `--bg-elevated` + `--text-secondary` glyph. Label `--font-body`/`--text-secondary` → `--accent` on focus.
- **Focus (profile-card model):** ring `--accent` + `--focus-shadow` on the **media tile** + blue label; transform scale `--gt-focus-scale-med` under `html.caps-motion` (webOS 4+). No light-fill inversion.
- **Saved-links model** (`storage.js` — key `plax_savedLinks`, **survives `clearAuth`/`clearActiveSession`**):
  - Plex link `{ provider:'plex', id:'plex:'+clientId, name, authToken, ownerAuthToken, clientId, user }` — saved in `appBootstrap.runPlexBootstrap` once user + activeServer resolve (account/owner token stored so a switch-back can re-list Home + servers). `name` = account holder (`user.title||username`).
  - Jellyfin link `{ provider:'jellyfin', id:'jf:'+serverId, name, url, version, jfId }` — saved in `jellyfinLoginScreen.finalize` via `upsertJellyfinServer`.
  - Seeds from legacy `plax_jellyfinServers` / `plax_jellyfinServer` on first read. Back-compat adapters `getJellyfinServers/upsert/remove` map onto `savedLinks` filtered by provider.
- **Switch (select a card):** `clearActiveSession()` + cache/retention invalidate, then restore the link's session into state+storage and route — Plex → `profile-picker {_from:'switch',_alwaysChoose:true}`; Jellyfin → `jellyfin-users {_from:'switch'}` (server restored; user picker handles per-user auth). Add card → `provider-picker`.
- **Forget:** NOT on the cards — lives only in **Settings → Forget server** (removes the current link; see Settings entry). Cards are choose-only per user decision.
- **Routing** (`startupRouting.js`, pure — reads `persisted.savedLinks`): not signed in (any provider) + saved links → `server-picker`; signed-in Jellyfin without a server but with saved links → `server-picker`; first run with saved links → `server-picker`; otherwise `provider-picker`/`pairing`/`jellyfin-users` as before.
- **Platform notes:** no `flex gap` (Chrome53) — margin rhythm; vertical/square selection cards (not 16:9); `attachFocusNav` sequential. Verified via headless-Chrome harness screenshot (sim access was unavailable).

### Jellyfin login screen

- **Status:** ✅ to-spec · 2026-06-20
- **Reuses:** the outlined **Text field** via `openTextInputModal` for all text entry (server URL / username / password); Quick Connect code reuses `.pairing-code` (Plex PIN display); buttons `.btn`/`.btn-primary`.
- **Code:** `jellyfinLoginScreen()` (via the `pairing` route when `params.provider==='jellyfin'`); `.jellyfin-login *` in `app.css`.
- **Update 2026-06-23:** accepts `params.savedServer` to pre-fill the URL field (arriving from server picker); calls `upsertJellyfinServer(server)` in `finalize()` on every successful connect.
- **Anatomy:**
  ```
  .jellyfin-login (screen screen-center)
    h1.screen-title · p.screen-subtitle
    .login-step#step-server (.is-active)     ← server address (login-field__btn → modal)
    .login-step#step-quickconnect            ← primary: p.pairing-code#qc-code + status
    .login-step#step-password                ← fallback: username + password fields
  ```
  Steps toggle via `.login-step.is-active`. `.login-field` (`__label` + `__btn`) uses the **Login / Auth field** variant (label 21px, box 18×24, 9px gap); `.login-field__btn` opens `openTextInputModal`.
- **Platform notes:** text entry delegated to `openTextInputModal` (dedicated surface — avoids buried-field keyboard occlusion, reuses solved key-trapping); password masks to `••••`. Quick Connect primary, password fallback.

### Jellyfin user picker ("Who's watching?")

- **Status:** ✅ to-spec · 2026-06-20
- **Reuses:** the Plex profile-picker DOM/CSS verbatim — `.profile-picker-screen`, `.profile-picker-row`, `.profile-card` (+ `-avatar`/`-name`/`-lock`). No new component; only the data source + select-logic differ.
- **Code:** `jellyfinUserPickerScreen()`; reuses `.profile-*` in `src/styles/app.css`.
- **Anatomy:**
  ```
  .profile-picker-screen > .profile-picker-main
    h1.profile-picker-title         ← "Who's watching?"
    .profile-picker-row[data-focus-zone=jellyfin-users]
      button.profile-card × N       ← avatar (PrimaryImageTag img or initials) + name + 🔒 (if password & no cached token)
      button.profile-card--other    ← "+" avatar → username/password entry
  ```
- **Behavior (not visual):** lists `GET /Users/Public` merged with cached sessions (`storage.jellyfinSessions`); cached token → instant switch; `HasPassword=false` → instant `AuthenticateByName(name,'')`; passworded → `openTextInputModal` once then cached. Doubles as bootstrap host (→ Home).

---

## Maintenance

Keep this file current when: a component is built or re-specced, the kit is
re-versioned (refresh the node-id index), or the Android TV guidelines restructure.
Referenced by the root and `src/styles` / `src/ui` `AGENTS.md` Design Decision
Protocol sections, and by the `.claude/hooks/design-protocol*.sh` hooks.

### Living user-flow reference

**Figma:** https://www.figma.com/design/WI3ps729HoHyWQKfEG3XSH/XPlay-%E2%80%94-App-User-Flow-Reference
**Source of truth:** `docs/design-system/flow/flow.yaml` (manifest) → reconciled into Figma by `docs/design-system/flow/sync.mjs`.
**Mermaid preview:** `docs/design-system/flow/flow.mmd` (generated; renders in GitHub).
**Workflow + inventory:** `docs/design-system/user-flow.md`.

When a flow or screen changes: edit `flow.yaml` → `sync.mjs mermaid` → `sync.mjs render <screen>` if needed → `sync.mjs scan` + `plan` + `apply` (idempotent diff against the live board). Identity survives via per-node shared-plugin-data stamps (`xplayflow:key`) — `flow.lock.json` is a fast cache.

**⚠️ This file is untracked-prone — commit it.** It has been lost twice to branch
operations while uncommitted (2026-06-19 reduced to one entry; reconciled back
2026-06-20 from four divergent worktrees). Commit registry + `AGENTS.md` + `.claude/`
changes so they survive checkouts/resets.

### Open reconciliations (2026-06-22 anatomy pass + applied fixes — Player overlay / Profile picker / Modal drawer / Button)

Anatomy pulled from the kit + JetStream, reconciled to platform, and the fixes **applied** (5 parallel worktree agents, merged in dependency order button→player→profile→modal). Full suite 599/600 (the 1 failure is the pre-existing `collectHubPrefetchPosterUrls` width=180/210 test, unrelated); webOS4 CSS gates green; build compiles.

- ✅ **Player overlay** (was 📝 summary) → **✅ to-spec** (`d9db401`): seek track → `--player-seek-track-h` 6px + `--progress-track-color` dark scrim + `--progress-radius`; played fill → blue `--accent`; subtitle/time tokenized; thumb kept white.
- ✅ **Profile picker / Profile card** (was absent) → **✅ to-spec** (`97d7566`): circular avatar via new `--profile-avatar-radius`; fixed the undefined `--focus-scale-med` → `--gt-focus-scale-med` (focus grow was a silent no-op); lock re-anchored to 14%/14%. Lands on the Jellyfin user picker too (shared CSS).
- ✅ **Button family** (gold-standard) → **re-pulled + consolidated** (`ab51cf7`): `.btn` is now the single source of truth; added `.btn--icon`/`.btn--lg` (kit Icon button `911:6945`) + an Icon button sub-entry; deleted the `.detail-modal-cancel` + `.detail-secondary-actions .btn` bespoke overrides; reconciled `.detail-watchlist-btn` focus to the shared inversion; recorded a per-variant×size×state model + full app-class map.
- ✅ **Modal drawer** (both forms specced) → **✅ complete** (`6e553b2`/`9325c68`/`61cc0e1`): shared `openSidePanel()` factory (single-select radio **+ multi-select checkbox**); all pickers migrated; watchlist delete-confirm → `openActionDialog`; `openModal()` + `.gt-modal-option*` deleted; `gap` nit cleared. Only `openTextInputModal` retains `.detail-modal*` (distinct Text-field surface).
- ✅ **Button reconciliation round 2** (`5234ef9`/`4778954`): audit triaged **3 reconcilable / 8 ratified-distinct**. Reconciled `.player-media-info-btn` (killed its `:hover` + accent-tint focus → `.btn .btn-icon` + shared inversion), `.library-scan-btn` (→ `.btn .btn-outline .btn--sm`), `.player-skip-intro-prompt` (→ `.btn`). **Specced the hover/motion-cursor + scale state** (the prior gap): cursor = `cursor:pointer` only, focus inversion is the single cue; scale 1.06 caps-motion for icon-only controls, text buttons don't scale.

> **Merge-base gotcha (logged):** worktree-isolated agents branch from `main` (`5fab651`), not the feature-branch HEAD, so each batch starts blind to prior merged commits. The round-2 modal agent therefore rebuilt the whole migration; integration took its superset for the modal-owned files and real-merged `app.css`/`detailScreen.js`. For future incremental batches, rebase agent branches onto HEAD first or feed them the current state.

**Button-audit follow-ups still open** (lower priority, not yet actioned): `.gt-chip` is a **dead factory** (no callers) + `.user-chip` is unused — delete both rather than reconcile; the only live chip is `.library-filter-chip` (library filter bar) + `.detail-setting-chip`/`.detail-genre-pill` (detail). Also: ratify the text-link family (`.watchlist-row-link`/`.detail-link`/`.detail-season-link`) + a `.provider-card` Card entry; player pills (`.player-control-pill`/`.player-stream-pill`) are documented-but-duplicate `.btn`.

> Scratch specs under `docs/design-system/specs/` were folded into the entries above (then removed); the entries here are authoritative.

### Resolved (from the 2026-06-20 merge)

- ✅ ~~**Button rest fill** `#303030` vs kit `#444746 @80%` (node `169:1649`)~~ — resolved 2026-06-20: adopted kit `#444746 @80%`.
- ✅ ~~**`.btn-outline:focus`** broken (light-on-light)~~ — resolved 2026-06-20: now inverts correctly; focusable outline buttons safe.
- ✅ ~~Chip (pill vs 8px)~~ — resolved 2026-06-20: all chip instances reconciled to 8px rounded-rect / 8-16 padding / 1px `#8E918F` outline / shared inversion focus; 22px label ratified.
- ✅ ~~**Player track-selector sheet** rows (height 48, radius 999px, padding 8/18, ✓ glyph)~~ — resolved 2026-06-20: reconciled to List Item (`561:3969`) — height 64 / radius 8 / padding 12/16 / 24px radio `control`; no-icon + single-line ratified.
- ✅ ~~**Progress bar** (3 impls, height/colour)~~ — resolved 2026-06-20: consolidated to one token-driven base (`.progress-track`/`.progress-fill` + `--progress-*` tokens); height ratified to 4 (kit 3), blue `--accent` fill + dark scrim track ratified as the app's progress theme.
- ✅ ~~**Tabs (season selector)** (text links / underline variant vs kit pill)~~ — resolved 2026-06-20: adopted the kit pill Tabs (`createTabs` pill, filled blue Selected mirroring the Library filter chip, shared-inversion focus); underline variant + indicator removed. 10-ft up-scale (label `--gt-body`, `radius 24`, `52`/`12-16`) ratified.
- ✅ ~~**Search input** (inline Text field — off-spec bg/padding/radius/type)~~ — resolved 2026-06-20: reconciled to the base **Text field** spec, mirroring `.tv-text-input` (bg `#303030`, radius 8, padding 14×18, 1px `#8E918F` rest / 2px `#A8C7FA` `:focus`, input 24px/500 `#E3E3E3`, caret `#A8C7FA`).
