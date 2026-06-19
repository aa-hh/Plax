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
