---
description: Apply a design-system change (container sizing, spacing, radius, type) so it lands GLOBALLY through a single token + the component registry — never per-instance.
argument-hint: "<component> <property>=<value> | audit [component] | audit-containers"
allowed-tools: Read, Edit, Grep, Bash, mcp__figma__get_design_context, mcp__figma__get_variable_defs, mcp__figma__get_metadata
---

# /ckm:design-system

Single entry point for changing Plax's TV design system. The whole point of this
command: **a change is made in ONE place (a token) and the registry, so it applies
to every component instance at once.** We drift on container sizes precisely because
they get hardcoded per-component instead of flowing through a shared token.

## The one rule

> **Every container dimension is a named token in `:root` of `src/styles/app.css`.**
> Components reference the token; they never inline a px/vw container size. Changing
> the design = editing the token (global) + updating the registry entry (record).

"Container dimensions" = the box of a component: width, height, `min-height`,
padding, gap, `border-radius`, and the poster/media footprint. These are the values
that must match the [component-registry.md](docs/design-system/component-registry.md)
spec and must be consistent across every instance.

Canonical token groups already in `src/styles/app.css :root` (extend these, don't
invent parallel ones):

- Spacing: `--space-1..10` (4→48px)
- Radius: `--radius-sm|md|lg|pill`
- Layout/grid: `--safe-x/y`, `--layout-col-w`, `--layout-gutter`, `--content-max`
- Poster footprints: `--row-poster-w/h`, `--grid-poster-w/h`, `--poster-detail-w/h`, `--poster-ep-w/h`
- Targets/focus: `--target-min` (52px d-pad/hit floor), `--focus-w`, `--focus-ring-pad`
- Type: `--font-*`
- Component containers: `--button-container`, `--player-icon-btn*`, `--sidebar-w`, `--library-sidebar-w`, etc.

## Modes

`$ARGUMENTS` selects the mode.

### `audit-containers` — find drift (run this first if unsure)
Report every component whose container box is **hardcoded** instead of token-driven.
1. For each component in the registry's "Component specs", read its CSS class(es) in `app.css`.
2. Flag any literal `width/height/min-height/padding/gap/border-radius` that is a raw
   `px`/`vw`/`rem` value where a token exists or should exist. Exemptions: `0`, `100%`,
   `auto`, `1px`/`1.5px` hairline borders, values already wrapped in `var(--…)`.
3. Output a table: `component | class | property | literal value | nearest token | action`.
4. Do NOT edit. End by listing which fixes the user should approve.

### `audit [component]` — single-component spec check
Reconcile one component (or all, if omitted) against its registry spec: list where the
code's container box diverges from the recorded canonical spec. Report only; propose edits.

### `<component> <property>=<value>` — make a global change
e.g. `media-card radius=16`, `nav-item min-height=56`, `chip padding=8/16`.
1. **Registry first (MANDATORY).** Open [component-registry.md](docs/design-system/component-registry.md),
   find the entry. Output one line: `Registry: <entry> — <status>`. Honour status
   (✅ build to spec · 🚧 reconcile toward recorded spec, never copy off-spec code ·
   absent/📝/📐 → pull kit spec via Figma MCP, fileKey `TLtknC3rZXQqWe3uIivt94`,
   node-ids in the registry index).
2. **Find or create the token.** If a fitting token exists, change THE TOKEN (this is
   what makes it global). If none fits, add one to `:root` with a comment citing the
   kit node + value, then point the component's CSS at it.
3. **Make every instance reference the token.** Grep all classes/instances of that
   component; replace any inline literal with the token. After this, the component has
   zero hardcoded container values.
4. **Reconcile to platform constraints** (always, on top of the kit):
   - Cards stay vertical 2:3, never 16:9.
   - Material 3 blue tokens (`--accent #A8C7FA`), not kit purple / old gold.
   - No `:focus-within` (Chrome53 drops it) — drive states with JS classes.
   - No `gap:` on webOS4-critical grids — use margin gutters (precomputed halves).
   - Focus motion is transform/opacity-only (runs under `html.caps-motion`, webOS4+).
   - 10-foot up-scale of kit type/targets is ratified — don't shrink to literal kit px.
5. **Record back into the registry.** Update the entry's per-element spec + status +
   date, and note the token name so the next change goes through it too.
6. **Verify.** `npm test` (or the suite the repo uses); confirm `webos4-css-compat`
   and focus-nav tests still pass. Report results honestly.

## Guardrails
- Never satisfy a change by editing a single component's CSS with a literal value —
  that's the exact failure mode this command exists to prevent. Route through a token.
- Never reproduce off-spec code from a 🚧 entry; the recorded spec is the target.
- Commit the registry + `.claude/` + token changes together (the registry has been
  lost to branch ops while uncommitted — see its Maintenance note).

Now execute for: **$ARGUMENTS**
