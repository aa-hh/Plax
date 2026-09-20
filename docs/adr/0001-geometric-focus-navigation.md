# D-pad focus is geometric, with a zone layer on top

Plax moves focus by geometry: on each arrow press it projects a beam from the focused element's rectangle and picks the nearest candidate by score. Layout is the navigation model, so there is no per-screen graph of up/down/left/right neighbours to keep in sync with the DOM. Commit `a72371d` replaced a roughly 1000-line per-screen zone graph with a roughly 250-line geometric engine, because the graph had to be hand-maintained per screen and drifted out of sync whenever the DOM changed.

Commit `c11ff50` then added a zone layer **on top of** the geometric engine rather than replacing it. Pure geometry scored every focusable on screen, which was both slow on the B8 and leaky across containers, and the leaks had accumulated hand-patched special cases: a sidebar vertical wall, a sidebar performance fast-path, a hard-coded rule that LEFT from content lands on the first hub item, and `data-nav-up` / `data-nav-down` overrides on the detail screen's cast cards. A zone shrinks the candidate set from around 60 rectangles to a handful and gives each zone a remembered child, while screens with no zones still run the flat algorithm unchanged.

## Considered options

A focus-navigation library was evaluated and rejected: the candidates were either React-bound or required registering a graph, and neither fits a vanilla ES6 codebase targeting Chrome 53 (`c11ff50`).

## Consequences

- Both tiers must keep working. A screen with no zones exercises the original flat algorithm byte for byte, which is why the existing focus tests pass unmodified.
- The zone layer may not use CSS `:focus-within`. Chrome 53 silently drops any rule containing it, so zone state is driven by JS-toggled classes.
- Focusables live in a WeakMap cache that must be invalidated by hand after any list re-render, or the D-pad targets removed nodes. Zone focus memory needs no such handling: replacing the zone node drops its memory naturally.
- Screens migrate to zones one at a time. Until a screen is migrated, its special-case patches stay.
