# XPlay UI foundation — Google TV / Android TV design system

The redesign adopts **Google's TV design language** (Android TV / Google TV) as the spec, implemented
in XPlay's existing Chrome-53-safe vanilla stack. We adopt the *design system* (tokens, component
anatomy, behavior) — not Google's *code* (Compose/`androidx.tv.material3`), which can't run on webOS.

Sources: the full Google TV design guide (foundations, styles, components) + the TV playback-controls
training doc. Exact hex/type tokens live in Material 3 + the [TV Design Kit Figma](https://goo.gle/tv-desing-kit)
(needs Figma Dev Mode to extract); until then we use TV-scaled M3 defaults and swap in exact kit values later.

> Why this exists: the previous overhaul's complaints were "navigation not thought through," "no grid
> system to play with," "didn't look modern," "homemade/inconsistent." This doc is the single agreed
> spec so every screen is built from one system, not per-screen guesses.

## Principles (foundations)
- **10-foot, leanback, D-pad-first.** Large targets, minimal reading, instant focus feedback.
- **Axis discipline:** vertical D-pad = move between rows/categories; horizontal = items within a row.
  Reach every focusable; predictable direction; never trap focus; no deep nested hierarchies.
- **Back = remote only.** No on-screen back button. Fixed Home start destination; Back always walks
  toward Home; no exit gating / confirmation loops. Use a `Cancel` button only inside confirm/destructive dialogs.
- **Dark, high-contrast, sRGB.** Avoid white backgrounds; design for Standard picture mode; avoid harsh
  gradients (banding) — prefer solid/subtle fills + scrims.

## Token system

### Layout & grid — REUSE (already Google-compliant)
| Token | Current | Google spec (×2 of dp) | Action |
|---|---|---|---|
| `--safe-x` / `--safe-y` | 96px / 54px | 48dp / 27dp | keep |
| `--layout-cols` | 12 | 12 | keep |
| `--layout-col-w` | 104px | 52dp | keep |
| `--layout-gutter` | 40px | 20dp | keep |
| `--space-1..10` | 4–48px | 4dp baseline | keep |

Card widths from the column system (×2 of Google dp): 5-up `248px`, 4-up `392px`, 3-up `536px` (16:9 wide cards).
Poster (2:3) tiles stay token-driven via `--grid-poster-w/h`; the "grid you can play with" = change column
count / gutter / ratio in one place and every shelf + grid follows.

### Color — map current palette to Material roles, add tonal elevation
Current palette is already a dark, high-contrast, gold-accented set (kept — "you already do color right").
Re-expressed as Google/Material **color roles** so components reference roles, not ad-hoc hex:

| Role | Token | Value (current) |
|---|---|---|
| primary (key actions, active state, focus) | `--gt-primary` | `#f0b533` (accent gold) |
| on-primary | `--gt-on-primary` | `#0a0a0f` |
| secondary (chips, less-prominent) | `--gt-secondary` | `#b3bfd3` |
| tertiary (accents, inputs) | `--gt-tertiary` | `#e50914` (brand red, sparingly) |
| background | `--gt-bg` | `#0b0d12` |
| surface +0 / +1 / +2 / +3 (tonal elevation) | `--gt-surface-0..3` | `#0b0d12` → `#141925` → `#1b2231` → `#232d41` |
| outline | `--gt-outline` | `#2c2c38` |
| text high / med / disabled | `--gt-text` / `--gt-text-2` / `--gt-text-muted` | `#f3f6ff` / `#b3bfd3` / `#7d889d` |

Surfaces lift via **tonal elevation** (+1..+5 = progressively lighter surface tint), per Google's focus/elevation model.

### Typography — Roboto, TV-scaled Material 3 roles
Adopt **Roboto** (Google's TV typeface; system-font fallback for the B8) with M3 roles, scaled up for 10-foot.
Proposed scale (maps current `--font-*` onto named roles):

| Role | Size / line-height / weight | Replaces |
|---|---|---|
| display-large | 52 / 60 / 500 | `--font-title` (52) |
| headline | 36 / 44 / 500 | `--font-title-compact` (36) |
| title (row labels) | 30 / 38 / 500 | `--font-row-label` (30) |
| body-large | 24 / 32 / 400 | `--font-body` (24) |
| body | 22 / 30 / 400 | `--font-meta` (22) |
| label | 19 / 24 / 500 | `--font-small` (19) |
| card-title / subtitle / meta | 18 / 16 / 14 | existing card fonts |

(Exact M3 letter-spacing + the kit's TV sizes to be swapped in from Figma later.)

### Radius & focus
- Radius: buttons fully rounded (pill); **wide/image buttons + cards = `--radius-lg` (12px ≈ 12dp)**; keep `--radius-sm/md`.
- **Focus (Google spec):** scale `1.1×` (large) / `1.05×` (medium) + **glow** (elevation 2–32dp → box-shadow) +
  **outline** (width + inset + color) + optional surface tonal lift.
  - webOS 5+ (`html.caps-motion`): animate scale + glow (evolve `--focus-scale` 1.06 → 1.1, add `--gt-focus-glow`, `--gt-focus-elev`).
  - webOS 4 / B8: **static outline + tonal lift only** (no motion) — keep existing strengthened ring.

## Component inventory (Google's 7 + Player)
Build as vanilla factory components over the tokens + the existing `focus.js` engine (reuse its selectors/zones).

1. **Navigation drawer** (left rail) — collapsed icon rail ↔ expands to labels on focus (pushes content);
   top = app/profile/search; 5–6 destinations with **active-indicator shape**; settings pinned bottom; all items have icons.
2. **Tabs** — **pill** indicator = primary/full-page sub-destinations (e.g. Movies/Shows); **bar** indicator =
   secondary separation within a content area. Top placement, horizontally scrollable, states default/focus/selected.
3. **Buttons** — filled (highest), wide/long, outline, icon, outline-icon, image. `1.1×` on focus; leading icon only;
   sentence case; no text wrap; one primary per screen and **focus lands on it first**; outline gains fill on focus.
4. **Cards** — ratios 16:9 / 2:3 / 1:1; variants standard/classic/compact/wide; **metadata below image** (compact
   overlays text w/ scrim); focus `1.1×` + glow + outline.
5. **Lists** — 1/2/3-line items (icon/overline/title/subtitle/control); items are **not** buttons (no container by
   default); selection via checkbox/radio/switch; don't put buttons inside list items.
6. **Featured carousel** — home top; immersive (full-width bg + scrim) or card; overline/title/description + CTA +
   pagination; bg relevant to focused item.
7. **Immersive list** (Detail/browse) — 16:9 backdrop, **subject top-right**, cinematic scrim, content block
   bottom-left, focused card `1.1×` that **drives the backdrop** (progressive disclosure).
8. **Player** — see "Player spec" below (built from the user's reference image, no Google component exists).

## Player spec (from reference image — source of truth)
Bottom-anchored, full-bleed; controls auto-hide and reappear on any key. Replaces the current app's
top-right secondary-controls pattern.
- **Backdrop:** full-bleed playing video / art; bottom gradient scrim only for legibility.
- **Title:** bottom-left, display size, regular weight (e.g. "Vikram Rana").
- **Seek bar:** full-width near bottom; elapsed time left (`21:59`), total/remaining right (`36:00`);
  translucent-white track, solid-white fill, circular thumb at the playhead.
- **No on-screen play/pause:** center = play/pause (Google D-pad). L/R = skip N s, hold = scrub,
  down = peek **Info** (bottom-center `⌄ Info` affordance).
- **Secondary control cluster:** bottom-right row of **circular icon buttons** — subtitles (CC),
  audio track, settings, PiP. Resting = translucent dark circle + light icon; **focused = filled light
  circle + dark icon**.
- **Menus open UPWARD** from the focused control: a dark rounded surface panel above the cluster.
  Header = category name flanked by `‹ ›` chevrons (move between categories, e.g. Subtitles ↔ Audio);
  list items below; **selected item = light pill + trailing checkmark**, others plain.

## Implementation plan
1. **Token layer** — add the `--gt-*` token block to `src/styles/app.css` (reuse layout/grid/spacing as-is;
   add color roles, type roles, focus/elevation), behind the existing webOS-capability gating.
2. **Core components** — `navDrawer`, `tabs`, `button`, `card`, `cardRow`/grid, `chip`, `listItem`, `modal` as
   vanilla factories returning DOM wired to `focus.js`. Replace per-screen bespoke markup.
3. **Screen conversion** — Library → Home (carousel + rows) → Detail (immersive) → Search/Settings/Watchlist.
4. **Player** — build from the reference image + the D-pad control spec.
5. **Verify on B8** at each step (package → ares-install → launch on 192.168.4.20).

## Open items
- Playback reference image (incoming) = Player source of truth.
- Exact color hex + TV type sizes from the TV Design Kit Figma (needs Dev Mode enabled + file open).
- Roboto delivery on webOS 4 (bundle subset vs system fallback) — decide during the token layer.
