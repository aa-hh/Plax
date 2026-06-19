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
- **No focus scale/motion** on webOS4; gated to webOS5+/dev (`motionCursor.js`).
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
- **Platform deviations (ratified):** <2:3 not 16:9; no focus scale webOS4; etc.>
```

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
  - text-stack `margin-top --space-5`; title `--font-card-title 18/1.25 w600`, subtitle 16, meta 14, all single-line
  - focus: ring via transparent border; scale webOS5+ only
- **Platform deviations (ratified):** vertical 2:3 (not 16:9); title weight 600 vs kit 500; meta line is app-specific. No action.

### Button  ⭐ gold-standard reference entry

- **Status:** ✅ to-spec · 2026-06-19 (full per-element pull)
- **Android TV guideline:** [Buttons](https://developer.android.com/design/ui/tv/guides/components/buttons)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `169:1649`
- **Code:** `.btn` / `.btn-primary` in `src/styles/app.css`
- **Anatomy (parts → slot):** `container` + `background-layer` (fill/outline + focus halo) + `icon` (optional, `Show icon`) + `label`
- **Variant axes:** `Type=Filled|Outline`, `State=Default|Focused|Pressed`, `Enabled`, `Show icon`
- **Per-element spec — kit reference values** (node `169:1649`):

  | Element | Default (Filled) | Focused | Pressed | Disabled |
  |---|---|---|---|---|
  | radius | 40 | 44 | 40 | 44 |
  | padding (y/x) | 10/16 | 9/14.4 | 10/16 | — |
  | icon↔label gap | 6 | 6.6 | 6 | — |
  | fill | `#444746` @80% | `#E3E3E3` solid | `#E3E3E3` solid | `#444746` @40% |
  | label color | `#E3E3E3` @80% | `#303030` | `#303030` | `#E3E3E3` @40% |
  | label type | Roboto Med 14/20 +0.1 | 15.4/22 +0.11 | 14/20 | 14/20 |
  | icon size | 18 @80% | 19.8 | 18 | 18 @40% |
  | outline (Outline type) | border `#C4C7C5` 1.5px @40% | bg `#E3E3E3` + border `#8E918F` 1.65px | border `#8E918F` 1.5px | border `#C4C7C5` @20% |
  | focus ring | — | fill extends `-2/-3.2px` beyond box | — | — |

  Kit focus = **invert (light fill + dark text) + ~1.1× scale**.
- **App reconciliation:** `.btn`/`.btn-primary`; radius `--radius-pill 24`; label scaled to `--font-meta 22` for 10-foot; focus = white-on-focus (commit `b3c55d6`) + ring `--border-focus` / `box-shadow 0 0 0 1px --accent-soft`.
- **Platform deviations (ratified):** blue `--accent` ring; type up-scaled; kit's 1.1× focus scale gated to webOS5+.

### Chip  ⚠️ audited 2026-06-19 — diverges

- **Status:** 🚧 diverges (recorded spec is the target)
- **Android TV guideline:** Foundations + Layout (no dedicated chip page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / node `2506:17680` (default `2506:17644`)
- **Anatomy (canonical):** `container` (flex, `gap 8`, `padding 8/16`) + `background` (border `#8E918F` 1px **@20%**, **radius 8**) + `leading icon` (opt) + `label` (Roboto Medium **14/20**, +0.1, `#C4C7C5` @80%) + `trailing icon`/`image` (opt); states `Default|Focused|Pressed|Active`
- **Code (as-built):** `.detail-setting-chip` / `.library-filter-chip` / `.user-chip` group + `.browsing-hub-item`; focus group `src/styles/app.css:314`
- **Deviations from kit (fix-list):** app uses **pill `--radius-pill` (24)** vs kit **8px rounded-rect**; label `--font-meta` (22) vs kit 14 (10-foot up-scale → ratify as a Plax rule); verify border opacity (kit 20%) + selected treatment.

### Nav item (browsing-hub sidebar)  ⚠️ audited 2026-06-19 — diverges

- **Status:** 🚧 diverges (recorded spec is the target)
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / Nav item `9:161` (default `9:873`) · drawer `563:4331`
- **Anatomy (canonical):** `container` (flex, **height 48**, `padding-x 16`, `gap 12`) + `content` (leading `icon` **24px**) + `label` (when `Expanded=True`) + `badge` (opt, top-right); states `Default|Focused|Selected` × `Expanded`
- **Code (as-built):** `.browsing-hub-nav` / `.browsing-hub-item` (+ `__icon`) `src/styles/app.css:693+`
- **Per-element:** `min-height --target-min` = 48 ✅; **icon box 40×40 vs kit 24** ⚠️; expand/collapse via JS classes ✅ (Chrome53-correct)
- **Deviations from kit (fix-list):** icon 40 vs 24 (reconcile or ratify); confirm `padding-x 16` / `gap 12`.
- **Contract (unchanged):** nav order Home · Library · Search · Settings.

### Rail row

- **Status:** 📝 summary only — behaviour captured, **anatomy not yet pulled from kit** (rows reuse Media card; item spec = List item)
- **Android TV guideline:** [Lists](https://developer.android.com/design/ui/tv/guides/components/lists) / [Immersive list](https://developer.android.com/design/ui/tv/guides/components/immersive-list)
- **Figma source:** `8689:24148` (Immersive list) · `8677:45429` (Lists)
- **Code:** `.row-section` / `.row-label` / `.row-scroll` in `src/styles/app.css`; `src/ui/components/virtualRow.js`
- **Resolved spec:** horizontal scroll, hidden scrollbar; card gap `--row-card-gap 16`; ≤30 cards in active viewport window.

### Player overlay

- **Status:** 📝 summary only — layout/behaviour captured, **anatomy not yet pulled from kit** (menu rows = Player track-selector)
- **Android TV guideline:** Foundations (transient transport controls)
- **Figma source:** `8842:27004` (Player UI)
- **Code:** `src/ui/screens/playerScreen.js`; overlay classes in `src/styles/app.css`
- **Resolved spec:** bottom-anchored gradient; rows = title/next-up → seek (`elapsed → bar → total`) → actions; auto-hide 3s; layered Back dismissal.
- **Platform deviations (ratified):** show/hide is class toggle, not animated.

### Sheet / menu

- **Status:** 📝 summary only — pattern captured, **anatomy not yet pulled from kit** (instances: Player track-selector, `.detail-modal-sheet`)
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) + Foundations
- **Figma source:** `8842:26171` (Menu list) · `4498:31402` (Modal drawer)
- **Code:** player menus / info panel in `src/ui/`; elevated-sheet classes in `src/styles/app.css`
- **Resolved spec:** elevated dark panel, border + `--radius-lg`, title top / list below, width capped; `--z-player-overlay 1002`.

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

### Player track-selector sheet  ⚠️ as-built, diverges from spec

- **Status:** 🚧 documented 2026-06-19, **not reconciled** to the List Item spec
- **Android TV guideline:** [Lists](https://developer.android.com/design/ui/tv/guides/components/lists) (rows) + [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) (panel)
- **Figma kit refs:** Menu `8842:26165` · Modal drawer `4498:31402` · rows = List Item `561:3969`
- **Code:** `.player-track-modal-sheet` → `.player-menu-list` → `.player-menu-option` in `src/ui/screens/playerScreen.js` (~line 298–308) + `src/styles/app.css:3715–3786`
- **Anatomy (as built):** `sheet` (title + prev/next category chevrons + list + Cancel) ; `row` (`.player-menu-option`) = `label` (single-line, ellipsis) + `check` (20px, `--accent` when active); `min-height 48`; active = bg tint + accent check; focus = light-fill inversion
- **Deviations from kit List Item (fix-list):** no leading `icon` slot; no `overline`/`subtitle` (single line); checkmark glyph instead of kit `control`; row `min-height 48` vs kit 64; selection via tint+accent vs kit `Selected` state. *May be intentional 10-foot simplifications — flagged for a decision.*

### Progress bar  ⚠️ audited 2026-06-19 — diverges + 3 impls

- **Status:** 🚧 diverges (and inconsistent across the app)
- **Android TV guideline:** Foundations (no dedicated page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / `719:6043` (40% variant `719:6044`)
- **Anatomy (canonical):** `track` (height **3**, radius 2, white **@20%**) + `fill` (white solid, radius 2) + optional `handle` dot (16px, seek bars)
- **Code (as-built):** `.detail-progress-bar`/`.detail-progress-fill` (height **6**, fill `--accent`) `src/styles/app.css:2090`; **also** `.detail-episode-progress(-fill)` and the card progress badge — **3 separate implementations**
- **Deviations / fix-list:** height 6 vs kit 3; fill `--accent` (blue) vs kit white; **consolidate the 3 impls into one token-driven bar.**

### Text field (search input, log-sink URL, any text input)  ⚠️ audited 2026-06-19

- **Status:** 🚧 verify against as-built
- **Android TV guideline:** Foundations + Layout (no dedicated page)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / `3815:25016` (default `3816:24930`)
- **Anatomy (canonical):** column `gap 6` → `label` (14/20 Medium `#C4C7C5`) + `field` (`gap 8`, `padding 12/16`, bg `#303030`, **radius 8**, optional `leading icon` 24, `input` 16/24 Medium `#E3E3E3`, optional `trailing icon` 24) + optional `supporting text` (12/16 `#C4C7C5`)
- **Code (as-built):** `#search-input` / `.search-input` (`src/ui/screens/searchScreen.js`; `src/styles/app.css:4468`); also the **log-sink URL** field in settings + any other `<input>`.
- **Deviations / fix-list:** reconcile field padding (12/16) / radius (8) / bg (`#303030`) + type scale against as-built (likely 10-foot up-scaled — ratify); confirm a leading icon slot. Applies to every text input, not just search.

### Status badges  (app-specific — audited 2026-06-19)

- **Status:** ✅ app convention (no direct kit component; nearest = Tag `4212:27233`)
- **Code:** `.badge-watched` (30×30, top-right) · `.badge-progress` (`--accent-soft`/`--accent`) · `.badge-unwatched` (`--success` green) `src/styles/app.css:1456+`
- **Anatomy:** small dot/pill on the poster, semantic color only; keep inside poster bounds, no focus-ring overlap.
- **Note:** not from the kit — a Plax convention; kept deliberately. No reconciliation needed.

### Tabs (season selector)  ⚠️ audited 2026-06-19 — diverges hard

- **Status:** 🚧 diverges (recorded spec is the target)
- **Android TV guideline:** [Tabs](https://developer.android.com/design/ui/tv/guides/components/tabs)
- **Figma source:** Tabs strip `17:848`; **tab item** `17:849` (default) — states `17:849` Default · `2536:16789` Inactive · `21:860` Selected · `17:778` Focused; types Primary/Secondary. Tab Row `8689:34922`.
- **Anatomy (canonical):** `tab` (flex, **height 32**, `padding 6/16`, **radius 16** pill) + `label` (Roboto Medium **14/20**, +0.1, `#C4C7C5`) + optional `leading icon`; states `Default|Inactive|Selected|Focused` × `Primary|Secondary`; Selected = filled pill
- **Code (as-built):** `.detail-season-tabs` (container) → `.detail-season-link` (`src/styles/app.css:2588`) — a **bare `--accent` text link**: `padding 0`, no background, no radius, `font-weight 600`
- **Deviations from kit (fix-list):** app rows are **plain text links, not pill tabs** — no `height 32` / `padding 6/16` / `radius 16` pill, no Selected-fill / Inactive treatment. Largest divergence in the registry; decide whether to adopt the kit pill Tabs or ratify the text-link pattern.

---

## Maintenance

Keep this file current when: a component is built or re-specced, the kit is
re-versioned (refresh the node-id index), or the Android TV guidelines restructure.
Referenced by the root and `src/styles` / `src/ui` `AGENTS.md` Design Decision
Protocol sections, and by the `.claude/hooks/design-protocol*.sh` hooks.

**⚠️ This file is untracked-prone — commit it.** It was lost once (2026-06-19) to
branch operations because it was uncommitted. Commit registry + `AGENTS.md` + `.claude/`
changes so they survive checkouts/resets.
