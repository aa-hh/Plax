# Component Registry

> Source of truth for resolved specs. Check here before pulling from Figma.
> Format: component name, status, Figma node-ids, anatomy, tokens, platform notes.

---

## Text Field (outlined)

**Status:** done  
**Figma nodes:** `3815:25032` (focused), `3984:26492` (active/typing) — file `TLtknC3rZXQqWe3uIivt94`

### Anatomy

```
.gt-text-input-wrap                  ← flex-col, gap 6px; gets --active class via JS
  .tv-text-input-label               ← label above field
  input.tv-text-input                ← outlined field
```

### Tokens / values

| Property | Rest | Active (keyboard open) |
|---|---|---|
| Label color | `#C4C7C5` (on-surface-variant) | `#A8C7FA` (primary) |
| Field bg | `#303030` (inverse-on-surface) | transparent |
| Border | 1px solid `#8E918F` (outline) | 2px solid `#A8C7FA` (primary) |
| Border-radius | 8px | 8px |
| Padding | 14px 18px (scaled from spec 12px 16px for 10-ft) | same |
| Input text | `#E3E3E3` (on-surface), 24px/500w (scaled from spec 16px) | same |
| Label text | 14px/500w, lh 20px, ls 0.1px | same |
| Caret | `#A8C7FA` (primary) | same |
| Box-shadow | none | none |

### Platform notes

- **No `:focus-within`** — Chrome 53 (webOS4) drops rules containing it. Active class
  (`gt-text-input-wrap--active`) toggled via JS `focus`/`blur` listeners on the `<input>`.
- Font scaled up from Figma spec (16px → 24px) for 10-foot viewing distance.
- Padding scaled proportionally (12/16px → 14/18px).

### Usage

```html
<div class="gt-text-input-wrap" id="my-wrap">
  <span class="tv-text-input-label">Label text</span>
  <input class="tv-text-input" type="text" />
</div>
```

```js
input.addEventListener('focus', () => wrap.classList.add('gt-text-input-wrap--active'));
input.addEventListener('blur',  () => wrap.classList.remove('gt-text-input-wrap--active'));
```

---

## Inline Edit-Toggle Field (full-width read row → inline editor)

**Status:** done
**Reuses:** `createSettingsActionRow` for the read row + Text Field (outlined)
spec for the editor input. No new Figma node.

### When to use

A single editable setting (e.g. a URL) where text entry is rare and the value is
mostly read. Selecting the full-width row reveals the editor, so the webOS keyboard
only opens on an explicit select — the standard TV pattern for text fields in a
settings list.

### Anatomy

```
#log-sink-block
  button.gt-list-item.gt-settings-item#log-sink-row     ← READ row (full-width, focusable)
    .gt-list-item__main (label + sublabel)
    .gt-list-item__trailing (.gt-settings-value = value / "Not set", + chevron)
  .gt-settings-stacked.gt-settings-editor#log-sink-editor[hidden]   ← EDIT mode
    label[for]
    input.tv-text-input#log-sink-url
    .gt-settings-editor__actions (Save · Cancel · Test)
    .settings-hint
```

### State machine

| State | DOM | Focus stops |
|---|---|---|
| Read | read row visible, editor `hidden` | the read row only |
| Editing | editor visible, read row `hidden` | input (keyboard) ↔ Save / Cancel / Test |

Transitions: select read row → enterEdit (reveal editor, focus + select-all the
input, raise keyboard) · Enter/Up/Down on keyboard → focus Save · Save → commit +
back to read · Cancel or Back/Esc → revert + back to read. Focus returns to the
read row on exit. Test pings the value **currently in the editor**.

### Why a full-width read row (D-pad reachability)

The geometric nav penalises cross-axis offset ×8, so a short input + right-aligned
CTA below full-width rows got skipped on **Down** (the centred Sign-out scored
better; you had to arrow sideways to reach it — illogical mid-list). A full-width
read row sits on the vertical travel column (**offset 0**), so Down always lands on
it. This replaced the earlier disabled-box + `flex:0 1 380px` CTA, which was fragile.

### Key trapping (critical)

While editing, a **document capture-phase** `keydown` listener intercepts so the
screen's `attachFocusNav` never steals focus. **Input focused:** `461`/`8`=delete ·
`37`/`39`=move cursor · `13`/`38`/`40`=close keyboard → focus Save · `27`=cancel;
character keys pass through. **Button focused:** `37`/`39` cycle Save/Cancel/Test ·
`38`=re-open keyboard · `40` swallowed · Back/Esc=cancel · Enter=native click. The
read row is hidden only AFTER the input is focused, so focus never collapses to
`<body>` (which would trip the screen's focus watchdog).

### Tokens

| Element | Value |
|---|---|
| Read row | `.gt-list-item` (focus = light inversion `#E3E3E3`/`#303030`); value = `.gt-settings-value` |
| Editor input | Text Field (outlined) spec (`.tv-text-input`, focus 2px `#A8C7FA`) |
| Editor buttons | `.btn` on `--bg-surface-hover` (visible on card), invert on focus |

### Platform notes

- Editor `[hidden]` keeps its buttons out of the nav while in read mode
  (`isNavFocusable` skips zero-size descendants of a hidden container).
- Keyboard-key trapping mirrors `openTextInputModal` — reuse if it graduates to a factory.

**Impl:** `wireLogSinkField()` in `src/ui/screens/settingsScreen.js`; CSS
`.gt-settings-editor*` + read row (`.gt-list-item` / `.gt-settings-*`) in `src/styles/app.css`.

---

## Settings screen (grouped cards)

**Status:** done
**Pattern:** single vertical scroll of overline-titled **cards**, each holding
**list-item rows**. Keeps the app's global left sidebar (no second rail). Built on
the documented `gt-list-item` + M3 blue tokens. Replaces the old flat
`.settings-row` list, native `<select>`s, and on-screen Back button.

### Layout

```
.settings-layout (home-layout)
  nav.browsing-hub-nav-host          ← global sidebar (unchanged)
  .settings-main
    h1.screen-title                  ← "Settings"
    #settings-content
      p.settings-status              ← inline status line (feedback channel)
      section.gt-settings-group  × N ← overline title + card
        h2.gt-settings-group__title  ← UPPERCASE overline, on-surface-variant
        .gt-settings-card            ← surface-container, radius-lg, 1px outline
          <rows…>                    ← hairline divider between adjacent rows
      .gt-settings-footer            ← Sign out (destructive action row)
```

Cards, in order: **Account** (info), **Plex Home**, **Watchlists** (conditional),
**Playback**, **Network**, **Developer**, then the **Sign out** footer.

### Row vocabulary (factories in `controls.js`)

| Factory | Element | Use | Focus |
|---|---|---|---|
| `createSettingsInfoRow` | `div.gt-settings-info` | read-only label + value | **not** focusable (D-pad skips) |
| `createSettingsPickerRow` | `button.gt-list-item` | multi-choice → opens `openModal` picker; trailing = current value + chevron | focusable |
| `createSettingsSwitchRow` | `button.gt-list-item` `role=switch` | binary on/off; Enter flips `.gt-switch` | focusable |
| `createSettingsActionRow` | `button.gt-list-item` | runs `onSelect`; optional hint + chevron; `destructive` tints label | focusable |

Rules of thumb: **2 states → switch**, **3+ states → picker (modal)**, navigation
or one-shot → action row, immutable → info row. Picker/action rows expose
`setSelected`/`setSublabel` for live updates (e.g. perf-trace counts, quality hint).

### Tokens

| Property | Value |
|---|---|
| Card bg | `--bg-surface` `#1E1F20` (surface-container) |
| Card border / dividers | `--border` `#444746` (outline-variant) |
| Card radius | `--radius-lg` 12px |
| Group overline | `--font-small` 19px / 600 / uppercase / +0.6px, `--text-secondary` |
| Row focus | inherits `gt-list-item:focus` → `--focus-fill` `#E3E3E3` bg, `--focus-on-fill` `#303030` text |
| Switch off track | `--text-muted` `#8E918F`; on track `--accent` `#A8C7FA`; knob `--surface-dim` |
| Destructive label | `--danger` |

### Platform notes

- Switch has **no transition** (instant) — safe on Chrome53/webOS4; focus motion
  still gated to webOS5+ via `html.caps-motion` elsewhere.
- Multi-line hints: `.gt-settings-item .gt-list-item__sublabel` overrides the base
  `nowrap`/ellipsis so help text wraps.
- **No on-screen Back** (foundation: Back = remote only). Sign out has no confirm
  dialog (parity with prior behavior) — revisit if accidental sign-outs happen.

**Impl:** `settingsScreen()` + sub-renderers `renderPlaybackSettings` /
`renderNetworkSettings`; factories in `src/ui/components/controls.js`; CSS
`.gt-settings-*` / `.gt-switch` in `src/styles/app.css`.

---

## Button

**Status:** done
**Figma:** TV Design Kit `TLtknC3rZXQqWe3uIivt94` — Buttons showcase `8677:41929`;
base `168:1226` (`ImageButton/Button/.Base`); component set `ImageButton`
`168:1182` (Default `168:1189` / Focused `168:1198` / Pressed).

### Kit spec (from `get_design_context`)

| Property | Kit value | Notes |
|---|---|---|
| Shape | **pill** (filled/outline text buttons fully rounded) | confirmed in showcase screenshot |
| Padding | `12px` vertical · `16px` horizontal (base) | M3; app's pill text `.btn` runs wider (see below) |
| Radius | image/wide buttons `12px`; text/icon buttons pill | per foundation doc |
| Gap (icon→label) | `12px` | leading icon only |
| Label | `label/large` — Roboto Medium 14 / lh 20 / ls 0.1px (`#FFFFFF`/`#E3E3E3`) | TV-scaled up for 10-ft |
| **Focus** | **invert to a light pill + dark label** (filled); outline gains fill | + `1.1×` scale & outline ring on the kit; B8 gets the inversion only (no motion) |

### Container — Android TV "button container" rules ([guideline](https://developer.android.com/design/ui/tv/guides/components/buttons#button-container))

> "Buttons display a container around content… Use **solid color containers for
> filled buttons**. Set container width based on content with consistent padding.
> Text/icon button containers have fully rounded corners. Label stays centered."

- **Filled rest container = solid `#303030`** (TV Compose `inverse-on-surface`),
  token **`--button-container`**. The kit's default filled button fills with this
  (node `168:1189`). It reads on **every** surface — the page (`#131313`), elevated
  cards (`#1E1F20`), etc. — so there is **no more per-surface bg hack**.
  Previously `.btn` used `--gt-surface-2` (`#1E1F20`), which vanished on a card
  (no visible container = the non-adherence this fixed).

### App mapping

- **`.btn`** = filled button: solid `--button-container` rest, **focus = light-pill
  inversion** (`background:--focus-fill #E3E3E3` + `color:--focus-on-fill #303030`)
  — the focus indicator. Pill radius `--gt-radius-button` 999px. Width hugs content,
  label centered.
- **Padding** `--space-5`/`--space-6` (**20px / 24px**) → button height ≈ **71px**.
  Scaled from the kit container proportion (py12/px16 against a 14px label) to our
  10-ft 22px label, so the solid container has real internal padding (it was
  12/28px → 52px, which read as a tight pill with no vertical breathing room).
- `.btn-primary` = always-blue filled (one primary per screen); still inverts on focus.
- `.btn-outline` = transparent + 1px outline. ⚠️ **`.btn-outline:focus` is broken**
  in this codebase (sets light text but the shared `.btn:focus` sets a light bg →
  light-on-light). Don't use outline buttons where they can be focused until fixed.

### Platform notes

- Focus scale/glow motion gated to webOS5+ (`html.caps-motion`); B8 = static
  inversion only.
- `min-height: var(--target-min)` (52px) for D-pad target size.
