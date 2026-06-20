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
  - info: title → `detail-meta` dot row (year · runtime · rating · IMDb) → **genre pills** (≤4, `--radius-pill`) → summary → **credits row** (Director / Writer / Studio, label+value cols) → actions.
  - actions: Play (primary) + **icon buttons** Subtitles (Radix chat-bubble) & Quality (Radix mixer) that open `openModal` drawers; label span shows current value. Then watchlist + mark watched/unwatched.
  - **Cast & Crew rail:** circular 104px avatars (JetStream uses 144dp portrait cards → swapped to circular 10-ft convention), name (2-line clamp) + character role; ≤12; display-only (actors not navigable), images via `bindPosterImage`.
  - episode: 16:9 still + series/title/meta/summary + credits + actions + Up Next + cast rail.
- **Data:** `item.genres/directors/writers/roles/studio`; `writers` added to Plex (`src/plex/library.js`) + Jellyfin (`mapItem.js`) mappers. Cast thumb: full URL passthrough, else `getThumbUrl(server, thumb, 200)`.
- **Platform deviations (ratified):** 2:3 poster vs JetStream backdrop; circular cast avatars vs portrait cards; flex `gap` retained (codebase convention). Subtitles/Quality kept per user request as icon-button drawer openers.

### Button  ⭐ gold-standard reference entry

- **Status:** ✅ · 2026-06-20 — fully reconciled to the kit Button (`169:1649`): rest fill adopts the kit `#444746 @80%`; `.btn-outline:focus` now inverts correctly (light fill + dark label). Earlier fix-list cleared.
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
- **Platform deviations (ratified):** label **`--font-meta` 22px** kept (kit 14 → 10-foot up-scale, ratified Plax rule, do not shrink); blue `--accent`/secondary-container active tokens; border `@35%` (the reconciled Library-grid value) rather than literal kit `@20%`; focus motion via `html.caps-motion` only.

### Nav item (browsing-hub sidebar)  ✅ reconciled 2026-06-20

- **Status:** ✅ to-spec · 2026-06-20 (reconciled to kit)
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer)
- **Figma source:** `TLtknC3rZXQqWe3uIivt94` / Nav item `9:161` (default `9:873`) · drawer `563:4331`
- **Anatomy (canonical):** `container` (flex, **height 48**, `padding-x 16`, `gap 12`) + `content` (leading `icon` **24px**) + `label` (when `Expanded=True`) + `badge` (opt, top-right); states `Default|Focused|Selected` × `Expanded`
- **Code (as-built):** `.browsing-hub-nav` / `.browsing-hub-item` (+ `__icon`) `src/styles/app.css:718+`
- **Resolved spec / per-element:**
  - icon box **24×24** = kit ✅ (was 40×40; reconciled 2026-06-20). Glyph `.hub-icon` also 24×24 (was 26) so it fills the kit box without overflow.
  - `padding-x` **16px** = kit ✅ (`var(--space-3) 16px`).
  - `gap` **12px** = kit ✅ (icon→label `margin-left: var(--space-3)`; was `--space-4`/16px).
  - container `min-height: var(--target-min)` = **52px** — ratified deviation from kit 48. `--target-min` is the global 10-foot focus/hit floor used app-wide; kept ≥48 rather than pinned to 48 for d-pad target consistency. Container is `display:flex; align-items:center` so glyph/label center within the 52px row.
  - expand/collapse via JS classes ✅ (Chrome53-correct, NO `:focus-within`).
- **Contract (unchanged):** nav order Home · Library · Search · Settings (Media / Search / System sections in `browsingHubNav.js`).
- **Hosts verified:** Home, Library, Settings, Search, Detail, Watchlist all mount `.browsing-hub-nav-host`; CSS-only change, 600/600 tests pass.

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
- **Tests:** `test/webos4-css-compat.test.js` — "library grid uses margin gutters not gap" (`-14px -14px` / `14px 14px`) and "library grid uses the standard 2-col card dimensions" (`--row-poster-w/h`).

### Player overlay

- **Status:** 📝 summary only — layout/behaviour captured, **anatomy not yet pulled from kit** (menu rows = Player track-selector)
- **Android TV guideline:** Foundations (transient transport controls)
- **Figma source:** `8842:27004` (Player UI)
- **Code:** `src/ui/screens/playerScreen.js`; overlay classes in `src/styles/app.css`
- **Resolved spec:** bottom-anchored gradient; rows = title/next-up → seek (`elapsed → bar → total`) → actions; auto-hide 3s; layered Back dismissal.
- **Skip Intro / Skip Credits prompt (`.player-skip-intro-prompt`) → kit Button (Filled, node `169:1649`):** bottom-center pill; reconciled 2026-06-20 from the old dark-pill-with-accent-border + `--accent` halo to the canonical filled Button — solid `--button-container` fill, pill `--gt-radius-button`, label `--font-meta`/`--gt-weight-label`, no border. **Selected state = light-pill inversion** (`--focus-fill`/`--focus-on-fill`) via the shared `.btn:focus` group rule (the prompt is auto-focused when shown, so it renders inverted = "selected/filled"); the "OK" hint flips to dark-on-light on focus. Credits-countdown fill overlay preserved. **Data dependency:** markers only exist when `getMetadata` requests `includeMarkers=1`/`includeChapters=1` (`src/plex/library.js`) AND the Plex server generated them — without the param the prompt never appears.
- **Platform deviations (ratified):** show/hide is class toggle, not animated.

### Modal drawer (canonical — pulled from kit 2026-06-20)

> **The one overlay primitive.** Every transient overlay (options list, confirm
> dialog, info panel) is a Modal drawer. Kills the bespoke per-screen modals
> (`player-track-modal-sheet`, resume-choice on `.detail-modal`, autoplay prompt,
> media-info). Migration target — see [migration plan](#modal-migration-plan).

- **Status:** 🚧 in progress · 2026-06-20 — action-dialog form built + resume-choice migrated; player modals pending.
- **Code (as-built):** `openActionDialog()` (kit Bottom dialog) in `src/ui/components/controls.js`; `.gt-dialog*` in `src/styles/app.css` (tokens `--drawer-dialog-h 200` / `--drawer-actions-w 268` / `--drawer-side-w 280`). Heading `--font-row-label`, desc `--font-body`, Primary=`.btn-primary` / Secondary=`.btn`, self-contained UP/DOWN + Back D-pad, body-level overlay.
- **Migrated:**
  - ✅ **resume-choice** → `openActionDialog` (kit Bottom dialog). Bespoke `.detail-modal` markup deleted.
  - ✅ **player track-selector** + **media-info** → kit **side panel** (Direction=Right): surface-container panel on the right edge, scrim @60%, margin-based rhythm (Chrome53-safe). Player focus/key JS kept intact (well-tested `data-focus-zone` trap); only the presentation became the drawer. Width up-scaled via `--modal-sheet-max-w` for 10-ft; category chevrons retained (ratified).
    - **Exact kit detail (node 4616:28363), all applied:** sheet **radius 16** (`--radius-xl`, floating panel — earlier builds dropped this); bg `--bg-surface` #1E1F20; inner padding `--space-5` (kit p-20); shadow **kit dark/3** (`0 1px 3px rgba(0,0,0,.3), 0 4px 8px 3px rgba(0,0,0,.15)`); **no header divider** (kit List/Header `pt-8 pb-16 px-16` = `--space-2 --space-4 --space-4`, borderless); list items radius 8 + 24px radio control (already kit-correct).
    - **Position (player, button-launched):** floats **in from the right** (`gt-drawer-right-in` translateX under caps-motion), right inset `--drawer-edge-gap` (24px kit float), **bottom-anchored** (`align-items:flex-end`) resting `--drawer-player-bottom` (232px) above the trigger button cluster — not full-height, not centred. The Cancel footer (ratified player-only addition; kit side panel has none) is borderless.
    - **Height (ratified deviation from kit `h-full`):** sheet **content-sized between `--drawer-side-min-h` (320px) and the available safe height** (`max-height:100%`); the **list (`.player-menu-list` / `.player-media-info-body`) is the flex scroll region** (`flex:1 1 auto; min-height:0; overflow-y:auto`, no fixed max-height) — overflow scrolls, header + footer stay pinned.
    - **Action dialog** (`.gt-dialog-sheet`) also uses kit radius 16 (`--radius-xl`) + dark/2 shadow.
- **Ratified exception — autoplay / Up-Next is NOT a modal drawer.** It's a *passive prompt shown over still-playing video* during credits; a scrimmed, focus-trapping modal would dim the video and trap focus (UX regression). Kept as the non-modal `.player-autoplay-panel` toast.
- **Verification:** built + launched in the webOS 26 simulator; 599/600 tests (pre-existing hub-poster-prefetch failure unrelated). Interactive drawer behaviour to be eyeballed in-sim / on B8.
- **Android TV guideline:** [Navigation drawer](https://developer.android.com/design/ui/tv/guides/components/navigation-drawer) + Foundations
- **Figma source:** `mociiAKRCHeosHwEl586wx` / `8736:25866` (Modal drawer page); component variants node `4498:31402` (Direction=Top|Bottom|Left|Right). Kit menu list `8842:26171`.
- **Two forms, selected by `Direction`:**
  - **Side panel (`Left`/`Right`)** — options/selection list. Container `bg #1E1F20` (surface-container), `drop-shadow dark/3`, `h-full`, `p-20`, `radius 16`, **`w-280`**, scrim black @60%, anchored to the L/R edge. Body = a **List**: `List/Header` (`pt-8 pb-16 px-16`, title 22/28 Regular = title/large `#E3E3E3`) then **List Items** (kit `561:3969`: `gap-8 px-16 py-12 radius-8`, leading `icon` 24 @80%, `content` = title 16/24 Medium +0.15 + optional subtitle 12/16 Regular @80%, optional trailing `control` 24 = radio/check). **Selected** item = light fill `#E3E3E3` + dark text `#131314`.
  - **Action dialog (`Top`/`Bottom`)** — confirm/prompt. Container `bg #1E1F20`, `h-200`, `flex gap-20 items-center justify-center px-34 py-24 radius-16 w-full`, anchored to top/bottom edge, scrim @60%. Body = **Text** column (heading 28/36 Regular = headline/medium `#E3E3E3` + description 16/24 Regular @80% = body/large) + **Actions** column `w-268 gap-12`: **Primary** (kit Button Filled — `#E3E3E3` fill, `#303030` label, radius 12) + **Secondary** (kit Button — `#444746` @40% fill, `#E3E3E3` label, radius 12).
- **Mapping to our use cases:** track-selector (audio/subtitle/quality radio lists) + media-info → **side panel**; resume-choice + autoplay/Up-Next → **action dialog**.
- **Platform reconciliation (to apply on migration):** Material 3 **blue** active/selected accents (not literal kit); type up-scaled to the app's 10-ft sizes (title `--gt-body` 22, etc.); **no `:focus-within`** — selected/active via JS classes; slide-in via transform-only (`html.caps-motion`) else instant class toggle; rows reuse the ✅ Player-track-selector row (already kit-List-Item-correct); actions reuse `.btn`/`.btn-primary`/`.btn--sm`; `--z-player-overlay 1002`; width via `--modal-sheet-max-w` (side) — add a `--drawer-side-w 280` / `--drawer-dialog-h 200` token on build.

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

- **Status:** ✅ to-spec · 2026-06-20
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
- **Platform notes:** switch has no transition (Chrome53-safe); no on-screen Back (remote-only); Sign out has no confirm dialog (parity with prior behaviour — revisit if accidental sign-outs occur).

### Status badges  (app-specific — audited 2026-06-19)

- **Status:** ✅ app convention (no direct kit component; nearest = Tag `4212:27233`)
- **Code:** `.badge-watched` (30×30, top-right) · `.badge-progress` (`--accent-soft`/`--accent`) · `.badge-unwatched` (`--success` green) `src/styles/app.css:1456+`
- **Anatomy:** small dot/pill on the poster, semantic color only; keep inside poster bounds, no focus-ring overlap.
- **Note:** not from the kit — a Plax convention; kept deliberately. No reconciliation needed.

### Tabs (season selector)  ✅ reconciled 2026-06-20

- **Status:** ✅ to-spec · 2026-06-20 — adopted the kit pill Tabs. Was the largest divergence in the registry (bare text links → before that, a text-tab + sliding-underline variant); now a filled-pill tab row.
- **Android TV guideline:** [Tabs](https://developer.android.com/design/ui/tv/guides/components/tabs)
- **Figma source:** Tabs strip `17:848`; **tab item** `17:849` (default) — states `17:849` Default · `2536:16789` Inactive · `21:860` Selected · `17:778` Focused; types Primary/Secondary. Tab Row `8689:34922`.
- **Anatomy (canonical):** `tab` (flex, **height 32**, `padding 6/16`, **radius 16** pill) + `label` (Roboto Medium **14/20**, +0.1, `#C4C7C5`) + optional `leading icon`; states `Default|Inactive|Selected|Focused` × `Primary|Secondary`; Selected = filled pill.
- **Code (as-built):** `createTabs()` in `src/ui/components/controls.js` renders `.gt-tabs[data-focus-zone]` (role=tablist) → `button.gt-tab` (role=tab) × N, `.gt-tab--active` for selected; `setActive(id)` repaints. Season selector wires it in `detailScreen.js` (`#detail-season-tabs`, zone `detail-season-tabs`); CSS `.gt-tab*` in `src/styles/app.css`.
- **Resolved spec:** pill — `border-radius:--radius-pill` (24; kit 16), `padding:--space-3/--space-4` (12/16), `min-height:--target-min` (52), Default `background:transparent` / label `--gt-text-2`. **Selected = filled pill** `--gt-secondary-container` fill + `--gt-on-secondary-container` label (Material 3 blue; mirrors the ✅ Library filter chip active state). **Focused** = shared control inversion (`--focus-fill` / `--focus-on-fill`, `.gt-tab:focus`) — no `:focus-within`, no ring.
- **Ratified deviations:** label kept at `--gt-body` (ratified 10-ft size, not kit 14/20); pill geometry up-scaled for 10-ft — `min-height 52` + `12/16` padding + `radius 24` (vs kit `32` / `6/16` / `16`), matching the established Library-filter-chip up-scale ratio. The old `underline` variant (text tabs + `.gt-tabs__indicator` sliding bar) and its `positionIndicator` machinery were removed — no consumer remained.
- **Focus/selection wiring (preserved):** d-pad LEFT/RIGHT/DOWN unchanged — tabs are still focusable `.gt-tab` buttons inside the `[data-focus-zone="detail-season-tabs"]` host; `onSelect` → `loadShowEpisodes`; first tab auto-focused on load. Only the visual treatment changed.

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
      span.provider-card__media → svg.provider-card__logo   ← branded gradient bg + brand logo
      span.provider-card__desc             ← how this backend connects
  ```
- **Tokens:** card bg `--bg-elevated #1B1B1B` + soft shadow; 1px `--border` / `--radius-lg 12`; 420px wide, media 200px tall (logo ≤96px); brand media — Plex radial gold `rgba(229,160,13,.18)`, Jellyfin radial purple→blue `rgba(123,92,230,.20)`→`rgba(0,164,220,.06)`; desc `--space-5 --space-6 --space-6`, `--gt-body`, `--text-secondary`→`--text-primary` on focus; focus = `border-color:--accent` + `--focus-shadow` + media `brightness(1.25)`.
- **Platform notes:** ring only, no scale (caps-motion gate). Brand: Plex gold `#E5A00D`, Jellyfin gradient `#AA5CC3→#00A4DC`.

### Jellyfin login screen

- **Status:** ✅ to-spec · 2026-06-20
- **Reuses:** the outlined **Text field** via `openTextInputModal` for all text entry (server URL / username / password); Quick Connect code reuses `.pairing-code` (Plex PIN display); buttons `.btn`/`.btn-primary`.
- **Code:** `jellyfinLoginScreen()` (via the `pairing` route when `params.provider==='jellyfin'`); `.jellyfin-login *` in `app.css`.
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

**⚠️ This file is untracked-prone — commit it.** It has been lost twice to branch
operations while uncommitted (2026-06-19 reduced to one entry; reconciled back
2026-06-20 from four divergent worktrees). Commit registry + `AGENTS.md` + `.claude/`
changes so they survive checkouts/resets.

### Open reconciliations (from the 2026-06-20 merge)

- ✅ ~~**Button rest fill** `#303030` vs kit `#444746 @80%` (node `169:1649`)~~ — resolved 2026-06-20: adopted kit `#444746 @80%`.
- ✅ ~~**`.btn-outline:focus`** broken (light-on-light)~~ — resolved 2026-06-20: now inverts correctly; focusable outline buttons safe.
- ✅ ~~Chip (pill vs 8px)~~ — resolved 2026-06-20: all chip instances reconciled to 8px rounded-rect / 8-16 padding / 1px `#8E918F` outline / shared inversion focus; 22px label ratified.
- ✅ ~~**Player track-selector sheet** rows (height 48, radius 999px, padding 8/18, ✓ glyph)~~ — resolved 2026-06-20: reconciled to List Item (`561:3969`) — height 64 / radius 8 / padding 12/16 / 24px radio `control`; no-icon + single-line ratified.
- ✅ ~~**Progress bar** (3 impls, height/colour)~~ — resolved 2026-06-20: consolidated to one token-driven base (`.progress-track`/`.progress-fill` + `--progress-*` tokens); height ratified to 4 (kit 3), blue `--accent` fill + dark scrim track ratified as the app's progress theme.
- ✅ ~~**Tabs (season selector)** (text links / underline variant vs kit pill)~~ — resolved 2026-06-20: adopted the kit pill Tabs (`createTabs` pill, filled blue Selected mirroring the Library filter chip, shared-inversion focus); underline variant + indicator removed. 10-ft up-scale (label `--gt-body`, `radius 24`, `52`/`12-16`) ratified.
- ✅ ~~**Search input** (inline Text field — off-spec bg/padding/radius/type)~~ — resolved 2026-06-20: reconciled to the base **Text field** spec, mirroring `.tv-text-input` (bg `#303030`, radius 8, padding 14×18, 1px `#8E918F` rest / 2px `#A8C7FA` `:focus`, input 24px/500 `#E3E3E3`, caret `#A8C7FA`).
- Standing 🚧 fix-lists: none open. (Search input, Tabs, Nav item, Player track-selector sheet, Progress bar ✅ reconciled 2026-06-20.)
