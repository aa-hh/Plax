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

## Inline Edit-Toggle Field (read value + Set/Save/Edit CTA)

**Status:** done
**Reuses:** Text Field (outlined) spec for the field itself — only adds row layout
+ a read (disabled) state + a state machine. No new Figma node; composition of the
text field + a `btn-primary`.

### When to use

A single editable setting (e.g. a URL) where text entry is rare and the value is
mostly read. Gating entry behind an explicit CTA means the webOS on-screen
keyboard only opens on purpose — the standard TV pattern for text fields buried
in a settings list.

### Anatomy

```
.settings-row--stacked#log-sink-row          ← gets --typing while keyboard up
  label[for]                                  ← turns primary (#A8C7FA) while typing
  .gt-inline-field                            ← flex row: input grows, CTA + Test fixed right
    input.tv-text-input.gt-inline-field__input ← disabled in read state
    button.btn.btn-primary.gt-inline-field__cta ← Set | Save | Edit (the one primary action)
    button.btn.gt-inline-field__test           ← Test: secondary, pings the saved sink
  .settings-hint                              ← helper text
```

### Optional Test action

A single inline field may carry a secondary `.btn.gt-inline-field__test`
alongside the primary CTA when the value addresses a remote endpoint worth
verifying (the log-sink URL). It POSTs a small ping (5s-timeout `XMLHttpRequest`)
to the **saved** value and reports Sent ✓ / Failed ✗ / timeout through the
screen's status line (`setStatus`) — the same channel `commit()` uses, not a
local status span. It is a no-op while editing (and unreachable then anyway,
since focus is contained between the input and the Save CTA). Read state exposes
two focus stops: CTA, then Test (the disabled input is still skipped by nav).

### State machine

| State | Input | CTA label | Focus stop |
|---|---|---|---|
| Read, empty | `disabled`, placeholder | **Set** | CTA only (disabled input skipped by nav) |
| Read, has value | `disabled`, shows value | **Edit** | CTA only |
| Editing | enabled, focused, select-all, keyboard up | **Save** | input (keyboard) ↔ CTA |

Transitions: CTA(Set/Edit) → enter edit · Enter/Up/Down on keyboard → unselect
(close keyboard) + focus Save · Save → commit, re-disable, CTA→Edit/Set · Back/Esc
→ cancel (revert) · LEFT from Save → re-open keyboard.

### Key trapping (critical)

While editing, a **document capture-phase** `keydown` listener intercepts so the
screen's `attachFocusNav` never steals focus:
`461`/`8`=delete · `37`/`39`=move cursor · `13`/`38`/`40`=unselect→Save ·
`27`=cancel. Character keys flow through to the input. With the Save CTA focused,
arrows are swallowed (focus contained); Enter commits via the button's native click.

### Read-state tokens

| Property | Value |
|---|---|
| Disabled bg | `#303030` (inverse-on-surface) |
| Disabled text | `#C4C7C5` (on-surface-variant) + `-webkit-text-fill-color` (Chrome53 legibility) |
| Disabled border | 1px `#5F6368` (dimmer than active outline) |
| Active/focus | inherits `.tv-text-input:focus` (2px `#A8C7FA`, transparent bg) |

### Platform notes

- Real `disabled` (not `readonly`) so `isNavFocusable()` skips the box and the CTA
  is the only focus stop in the row.
- **Layout / D-pad reachability:** the input is fixed at `flex: 0 1 380px` (not
  `1 1 auto`). A full-width input pushed the CTA to the far right; the geometric
  nav penalises horizontal offset ×8, so vertical travel from the row above skipped
  the CTA and landed on the centred Sign-out below. Shortening the input pulls the
  CTA near the row centre (where the travel column is) so it's reached. Buttons are
  `flex: 0 0 auto` — full `.btn` padding, never shrink.
- **CTA is `btn` (neutral), not `btn-primary`** — no permanent blue fill; rest =
  `--bg-surface-hover` (visible on the card), focus = light inversion via `.btn:focus`.
- Keyboard-key trapping is the same logic as `openTextInputModal` — reuse, don't
  re-derive, if this graduates to a shared factory.
- **Verify on B8:** when the field sits low in a scrolling list, the webOS keyboard
  can occlude it. If that happens, prefer `openTextInputModal` (dedicated surface).

**Impl:** `wireLogSinkField()` in `src/ui/screens/settingsScreen.js`; CSS
`.gt-inline-field*` in `src/styles/app.css`.

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
