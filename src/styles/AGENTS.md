# AGENTS.md — src/styles

## Purpose

Holds the entire stylesheet: a single `app.css` (PostCSS-extracted into `dist/`
at build). No Tailwind, no utility classes, no CSS-in-JS. All theming flows
through CSS custom properties.

*Keep this file up to date when:* the token system changes, the card aspect ratio
changes, or a new theme layer is introduced.

## Notable Patterns

- **Material 3 blue theme (adopted 2026-06-18), not the old gold.** Real
  `TV Compose/sys/dark` tokens were pulled from Figma. Key tokens:
  `--accent: #A8C7FA` (Google TV blue, = focus ring `--border-focus`),
  `--bg-base / --surface-dim: #131314/#131313`. A `--gt-*` semantic layer maps
  onto these (e.g. `--gt-primary: var(--accent)`). Tokens are defined at the top
  of `app.css`. See memory "Google TV blue theme adopted WHOLESALE" and
  [docs/google-tv-figma-tokens.md](../../docs/google-tv-figma-tokens.md).
- **Cards stay VERTICAL 2:3, not Google's 16:9.** Don't switch poster cards to
  landscape when matching Google TV references.
- **Single source of truth.** There is one `app.css`; edit tokens at the top
  rather than hardcoding colors deeper in rules.
- **Focus motion is gated** (webOS5+); CSS must degrade gracefully without it and
  must not rely on `:focus-within` (dropped on Chrome53 — see
  [../ui](../ui/AGENTS.md)).

## Related docs

- [docs/design-system/component-registry.md](../../docs/design-system/component-registry.md) — **single source of truth** for component specs + Figma node-ids. Before adding/changing a component, follow the Design decision protocol in the [root AGENTS.md](../../AGENTS.md) and record the result here.
- [docs/google-tv-figma-tokens.md](../../docs/google-tv-figma-tokens.md) — Material 3 blue token values.
- [docs/google-tv-foundation.md](../../docs/google-tv-foundation.md) — Google TV design-system adoption.
- [docs/design-system.md](../../docs/design-system.md) — component specs + 10-foot UX.
