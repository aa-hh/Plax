# Google TV Design Kit — real tokens (pulled from Figma via MCP)

Source: TV Design Kit (Community), file `QTpml0AjioTrnZrJQZvxMo`, via Figma MCP
`get_variable_defs` + page metadata. These are the **actual** Google values — use them to
replace the approximated `--gt-*` layer in `src/styles/app.css`.

> NOTE: Google's default token namespace is **Material 3 `TV Compose/sys/dark/*`**. Their
> default **primary is a desaturated BLUE (#A8C7FA) on near-black surfaces**, NOT amber/gold.
> Decision pending: adopt Google's blue system wholesale, or keep the Plax brand accent mapped
> into the `primary` role while adopting Google's surface/outline/type/focus structure.

## Dark color scheme (TV Compose/sys/dark) — exact

| Role | Hex |
|---|---|
| primary | #A8C7FA |
| on-primary | #062E6F |
| primary-container | #0842A0 |
| on-primary-container | #D3E3FD |
| secondary | #7FCFFF |
| on-secondary | #003355 |
| secondary-container | #004A77 |
| on-secondary-container | #C2E7FF |
| tertiary | #6DD58C |
| on-tertiary | #0A3818 |
| tertiary-container | #0F5223 |
| on-tertiary-container | #C4EED0 |
| error | #F2B8B5 |
| on-error | #601410 |
| error-container | #8C1D18 |
| on-error-container | #F9DEDC |
| surface / surface-dim | #131314 / #131313 |
| surface-bright | #37393B |
| surface-container-lowest | #0E0E0E |
| surface-container-low | #1B1B1B |
| surface-container | #1E1F20 |
| surface-container-high | #282A2C |
| surface-container-highest | #333537 |
| on-surface | #E3E3E3 |
| on-surface-variant | #C4C7C5 |
| outline | #8E918F |
| outline-variant | #444746 |
| inverse-surface | #E3E3E3 |
| inverse-on-surface | #303030 |
| inverse-primary | #0B57D0 |
| scrim | #000000 |
| shadow | #000000 |

## Type scale (Roboto) — from Styles-page frame names + variable fonts
Material 3 roles at base dp (TV scales up for 10-foot; apply our TV multiplier):
- Display Large — Roboto 57/64
- Display Medium — Roboto 45/52
- Body Large — Roboto 16/24 (+0)
- Body Medium — Roboto 14/20
- Body Small — Roboto 12/16
- headline6 — Roboto 18/24, weight 400, ls 0
- label/small — Roboto 11/16, weight 500, ls 0.1
(Headline/Title rows present on the Styles page — pull exact values when rate limit resets:
node 8661:31894 Display, 8661:31898 Headline.)

## Focus indicators (from Styles-page frame names; node 9062:12216 — pull exact when un-limited)
- **Three focus-scale tiers: 1.025x, 1.05x, 1.1x** (small/medium/large items).
- Border tokens: "1dp width • 4dp inset secondary", "2dp width", "2dp width • 2dp inset",
  "4dp width • tertiary".

## Spacing (dp tokens seen on Styles page): 2, 4, 8, 16, 24 dp.

## Elevation: Light + Dark elevation sets, levels 1–5 (nodes 8661:34942 dark group).

## Key node IDs (for follow-up pulls once rate limit resets / plan upgraded)
- Dark theme color scheme: 8661:32084 (pulled ✓), scheme 8661:32253, surfaces 8661:32360
- Focus indicators: 9062:12216
- Type: Display 8661:31894, Headline 8661:31898
- Content grid: 9:1031 ; Components page: 22:532

## Type scale (Roboto) — exact, from variable defs
- display/large — 57/64, weight 400, ls -0.25
- display/medium — 45/52, 400, 0
- display/small — 36/44, 400, 0
- headline6 (material-theme) — 18/24, 400, 0
- title/medium — 16/24, 500, ls 0.15
- body/large — 16/24, 400, ls 0.25
- body/small — 12/16, 400, ls 0.2
- label/large — 14/20, 500, ls 0.1
- label/small — 11/16, 500, ls 0.1
(These are base dp; our app renders larger TV sizes — keep our `--font-*` scale but mirror
the weights/letter-spacing and role intent.)

## Elevation (dark) — exact drop shadows (use sparingly on B8; big blur is costly)
- dark/1: `0 1 2 0 #0000004D, 0 1 3 1 #00000026`
- dark/2: `0 1 2 0 #0000004D, 0 2 6 2 #00000026`
- dark/3: `0 1 3 0 #0000004D, 0 4 8 3 #00000026`
- dark/4: `0 2 3 0 #0000004D, 0 6 10 4 #00000026`
- dark/5: `0 4 4 0 #0000004D, 0 8 12 6 #00000026`

## FOCUS & SELECTED treatment (CRITICAL — from buttons/lists screenshots)
Google TV does NOT use a colored ring for controls. Instead:
- **Focused** button / chip / tab / list-row / menu-row = **light fill** `inverse-surface
  #E3E3E3` + **dark text/icon** `inverse-on-surface #303030` (the "white pill"). This IS the
  focus indicator — no extra ring.
- **Selected** (within a list/picker, distinct from focus) = **blue container fill**
  (secondary/primary-container, e.g. `#004A77`/`#0842A0`) + **trailing checkmark ✓**.
- **Posters/cards** on focus = border + 1.1× scale + elevation (image, so scale is sharp).
- Focus-scale tiers: 1.025 (dense), 1.05 (medium), 1.1 (large/cards).
- Focus border tokens (alt indicator): 2dp width, 2dp inset; 4dp width tertiary; 1dp width
  4dp inset secondary.
⇒ ACTION: revise our current focus (blue ring + bg lift) → **light-fill inversion** for
buttons/chips/tabs/list-items; keep ring+scale only for posters. Selected = blue + check.

## Component dimensions (from Components page metadata, node ids)
- **Buttons** (8677:41929): Button/.Image base = **240×64** → button height ~64. Pill shape.
  Variants: Filled, Outline, Icon (circular), Outline-icon, Long (Title+Subtitle, left-icon),
  Image (Title/Subtitle + thumb). Detail CTA row example: Watch(filled) · Add to watchlist ·
  More info · Report + circular icon btn.
- **Chips** (8689:42422): Chips Row 592×36 → chip height ~36 (base dp).
- **Tabs** (8689:27815): Tab Row 536×32 / Tabs 444×24 → slim top tabs.
- **Nav**: Navigation drawer 8689:43720; Nav Item 9:161 (368×208); Navigation bar 792:7597
  (960×80, top bar).
- **Lists** (8677:45429): List Item 561:3969 (328×416 incl. art), Dense List Item 2709:21889
  (296×377); List/Header 4104:25929 (h52), Subheader (h32), Divider (h16). Row = leading icon
  + Title + Subtitle.
- **Cards** (8689:37296): variants Standard / Classic / Compact / Wide-standard / Wide-compact.
  Portrait card present: Card/.Embed 233:4289 & Card/.Scrim 237:2709 = **228×394** (portrait).
  Landscape Card/.Image 219:1927 = 898×544 (16:9). Card = art + Title + Subtitle below;
  focus = border/elevation. (We keep PORTRAIT per user.)
- **Immersive list** (8689:24148, 1628×1364): preview/backdrop = **960×540 (16:9)**, subject
  framed right, scrim over left, content block (Title + meta + description) bottom-left, content
  grid of cards below with focused card highlighted. Featured Carousel 8686:20059 (Immersive FC
  960×540 + Card FC 844×656).
- **Picker (upward panel)**: see Lists screenshot bottom-right — panel with ‹ back + category
  title ("Quality"), vertical rows, **selected row = blue fill + ✓**, focused = light fill.

## Saved visual references (docs/figma-refs/)
immersive-list.png, buttons.png, cards.png, lists.png, chips.png — pulled via MCP screenshot.

## Access
Figma now **Pro tier** (paid) — full MCP access, higher rate limits. File `QTpml0AjioTrnZrJQZvxMo`.
