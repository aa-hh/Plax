# Plax TV Design System

This design system defines a performance-first, D-pad-first baseline for Plax on webOS TV 5+.

## Core principles

1. **10-foot readability**: text remains legible from couch distance with strong hierarchy.
2. **Focus-first UX**: every primary action is reachable with deterministic D-pad paths.
3. **Low motion by default**: no decorative animation, no transition-heavy polish.
4. **Predictable back behavior**: Back closes overlays/panels before leaving the screen.
5. **Consistent visual rhythm**: spacing, cards, headings, and controls reuse shared tokens.
6. **Performance is a feature**: avoid layout thrash, heavy effects, and unnecessary DOM.

Episode (and movie) detail includes an optional **Connection** probe under file details: a short range download to the active Plex server estimates link speed and suggests a playback quality preset.

## JTBD definitions

### Home JTBD: Resume + Discovery

- Users browse continuously without route churn or blocking overlays.
- Home must expose explicit discovery pivots for `TV`, `Films`, and `Search`.
- Pivot changes should be instant and non-blocking (local filtering/state), with no full-screen loading interruption.
- Preserve uninterrupted D-pad scanning: vertical flow keeps context, and focus-driven scroll should not hard-reset to top.

### Player JTBD: Watch + Adjust in place

- While playback continues, users can adjust `audio`, `subtitles`, `quality`, `seek`, and `info` from overlay controls.
- These controls must not require leaving the player route.
- Overlay remains lightweight and auto-hides after 3 seconds of inactivity.
- If a setting requires stream restart, update in-place with clear status messaging while staying in player context.

## Real experience examples

These examples define how "professional + intuitive + fast" should look in this app.

### Example 1: Home screen rail scanning

**User goal:** Find something to continue quickly.

**Expected experience:**
- Top nav loads with `Home` focused.
- First rail (`Continue Watching`) is visible without scrolling.
- Each card shows a compact metadata stack:
  - Line 1: title (for episodes, series title)
  - Line 2: subtitle (episode title)
  - Line 3: meta (`S5 · E4`, year, or rating)
- Progress bar alone communicates "in progress" state (no redundant pill).
- Pressing Down moves focus to the next row; the feed scrolls only when the focused row is below the fold.
- Discovery pivots are visible above rails (`TV`, `Films`, `Search`) so intent changes are one click away.

### Example 2: Player overlay interaction

**User goal:** Pause, scrub, change subtitle track, continue playback.

**Expected experience:**
- Overlay appears via OK/Info/Green and auto-hides after 3 seconds of inactivity.
- Seek row layout is always: `elapsed` -> `seek bar` -> `total`.
- Scrub preview updates instantly on Left/Right while focused.
- OK commits seek:
  - Direct play: native `video.currentTime` seek
  - Transcode/direct stream: restart with Plex `offset` so seek always takes effect on webOS
- Back closes in layers: menu -> info panel -> overlay -> exit confirmation.
- Audio/subtitle/quality/seek/info controls all stay inside the overlay flow while video remains in player context.

### Example 3: Quality intent clarity

**User goal:** Avoid server transcoding.

**Expected experience:**
- Quality menu labels are explicit:
  - `Original file only (no fallback)` = progressive Plex file only; no remux/transcode fallback
  - `Auto (direct → remux → transcode)` = direct play, then HLS remux, then server transcode
  - `720p/1080p/4K (transcode)` = explicit server transcode presets
- Only one option is shown as selected at a time (checkmark/text state), while focus ring indicates current cursor position.

### Example 4: Subtitle behavior users can predict

**User goal:** Turn subtitles on/off without playback friction.

**Expected experience:**
- Text subtitles (SRT/WebVTT-capable paths) switch on-the-fly where possible.
- Image subtitles (PGS/VOBSUB) are labeled as transcode-required.
- If a selection requires restart, buffering overlay appears immediately with clear status.

## Consistency contracts (must not drift)

- **Nav pattern:** top nav order remains `Home`, `Library`, `Search`, `Settings`; Home also exposes discovery pivots (`TV`, `Films`, `Search`).
- **Card anatomy:** poster + 3-line metadata stack is consistent across Home and related rails.
- **Focus language:** same ring color/thickness and no animated focus transforms.
- **Overlay language:** every transient panel uses the same dark elevated sheet pattern and spacing rhythm.
- **Back behavior:** always "close local layer first," never surprise route jumps.

## Tokens

Use CSS variables from `:root` in `src/styles/app.css`.

### Typography scale

- `--font-title: 52px` (primary screen heading)
- `--font-title-compact: 36px` (compact page heading)
- `--font-row-label: 30px` (section/rail labels)
- `--font-meta: 22px` (button/nav/menu labels, subtitles)
- `--font-body: 24px` (long body copy)
- `--font-card-title: 18px` (media card title)
- `--font-card-subtitle: 16px` (media card subtitle)
- `--font-card-meta: 14px` (media card tertiary metadata)
- `--font-small: 19px` (supporting text)

### Spacing scale

- `--space-1: 4px`
- `--space-2: 8px`
- `--space-3: 12px`
- `--space-4: 16px`
- `--space-5: 20px`
- `--space-6: 24px`
- `--space-7: 28px`
- `--space-8: 32px`
- `--space-9: 40px`
- `--space-10: 48px`
- Screen padding: `--pad-screen-x: 96px`, `--pad-screen-y: 54px`

### Radius scale

- `--radius-sm: 6px`
- `--radius-md: 8px`
- `--radius-lg: 12px`
- `--radius-pill: 24px`

### Layout scale

- Safe-area content max width: `--content-max: 1728px`
- Rail poster size: `--row-poster-w: 156px`, `--row-poster-h: 234px`
- Grid poster size: `--grid-poster-w: 176px`, `--grid-poster-h: 264px`
- Rail card gap: `--row-card-gap: 16px`

### Color roles

- Backgrounds: `--bg-base`, `--bg-elevated`, `--bg-surface`, `--bg-surface-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`
- Brand/action: `--accent`, `--accent-soft`, `--brand`, `--brand-soft`
- Borders/state: `--border`, `--border-focus`, `--success`, `--warning`, `--danger`

### Z-index

- `--z-player: 1000` (native player)
- `--z-player-overlay: 1002`
- `--z-loading: 1005`
- `--z-splash: 2000`
- `--z-hud: 1800`

### Focus ring spec

- Base focusable controls use transparent border width `--focus-w`.
- On focus:
  - `border-color: var(--border-focus)`
  - `box-shadow: 0 0 0 1px var(--accent-soft)`
- No scale transforms, glow pulses, or animated outlines.
- Focus ring must be visible on all dark surfaces.

## Component specs

### Top nav

- Horizontal row of `nav-item` buttons.
- Active item uses elevated surface and accent underline.
- Minimum visual tap target: 48px height.
- Placement: top of home/search/settings, with consistent bottom spacing.

### Rail row

- Structure: `row-section` > `row-label` > `row-scroll`.
- Horizontal scrolling only, hidden scrollbar.
- Maintain card width by context:
  - Rail poster: `--row-poster-w`/`--row-poster-h`
  - Grid poster: `--grid-poster-w`/`--grid-poster-h`

### Media card

- Structure:
  - Poster container (`card-poster-wrap`)
  - Text stack (`card-text`) containing:
    - `card-title` (required)
    - `card-subtitle` (optional)
    - `card-meta` (optional)
- Text is single-line truncation per row to avoid reflow churn.
- Focus state highlights title color and ring.
- Hierarchical deep links are allowed only when context exists:
  - episode card title -> show detail
  - season/meta label -> season detail
  - episode subtitle/entry -> episode detail
- Keep card metadata links sparse and TV-safe; avoid adding focusable rows that do not change route intent.

### Badges

- Short uppercase or concise labels only.
- Allowed semantic classes: watched/progress/unwatched.
- Keep inside poster bounds (top-left) and avoid overlap with focus ring.

### Buttons

- Base button (`btn`) with shared spacing/radius/type scale.
- Primary action (`btn-primary`) reserved for highest-priority action in a group.
- Use horizontal `gap` in action rows; avoid margin chaining patterns.

### Sheets / menus

- Surface pattern:
  - Elevated dark panel with border + radius
  - Title at top, list/actions below
  - Panel width capped for predictable eye travel
- Used by player menus, info panel, exit confirm, and autoplay panel.

### Player overlay

- Bottom anchored gradient overlay with:
  - title/next-up text
  - seek row
  - action row
  - optional menu/info/autoplay/exit panels
- Overlay hide/show should remain state-based (class toggle), not animated.

## Interaction rules

### D-pad movement model

- Left/Right moves within rows and nav clusters.
- Up/Down moves between navigational bands (nav -> inputs -> rails/actions).
- Enter/OK activates focused item.
- Input fields may consume left/right for cursor movement when editing text.

### Pointer compatibility

- Controls remain clickable with pointer events.
- Pointer activity keeps overlays visible but does not replace focus semantics.

### Back-stack behavior

- Back closes transient UI in this order before leaving screen:
  1. context menu/sheet
  2. info/auxiliary panel
  3. transient overlay
  4. exit confirmation / previous route
- Never silently jump routes while a local dismissible layer is open.

## Performance guardrails

### Startup conventions

- Startup uses shell-first progression:
  1. Splash + status copy
  2. Router/screen shell
  3. Bootstrap data work
  4. Home phased feed hydration
- Loading copy should remain informative and concise (`Validating account`, `Finding servers`, `Loading libraries`, `Opening Home`).
- Avoid spinner-heavy or animated startup effects.

### Lazy-load conventions

- Home rows render with fixed-size skeleton placeholders first to lock layout and avoid shift.
- Home hydration is phased:
  - `initialRows`: above-the-fold rails first
  - deferred rails appended after first paint
- Focus-near prefetch is allowed and encouraged:
  - metadata prefetch for nearby cards
  - poster image prefetch for nearby cards
  - always include cancellation guards so stale focus does not keep enqueuing work.

- Keep rail row DOM light: target <= 30 media cards in active row viewport window.
- Keep per-card DOM shallow (poster + small text stack + optional badge/progress only).
- Poster image sizing:
  - Rail: 156x234 nominal
  - Grid: 176x264 nominal
  - Do not increase decode size unless visual requirement demands it.
- Avoid expensive visual effects:
  - no large blur filters
  - no animated shadows
  - no transition storms on focus movement
- Preserve lazy loading (`img.loading = 'lazy'`) and existing virtualized/list behavior.

## Accessibility notes

- Maintain readable contrast between text and dark backgrounds.
- Focus indicators must remain visible for every actionable control.
- Ensure practical target size around controls (>= 44-48px visual target where possible).
- Avoid color-only state cues; combine with text or icon/position differences where available.

## QA checklist (simulator + real TV)

1. Verify focus ring visibility on home/detail/player/search/settings surfaces.
2. Navigate every top-nav item and ensure active/hover/focus states are consistent.
3. Check media cards with long title/subtitle/meta for truncation and no overflow.
4. Validate Back behavior through player overlays/menus/exit flow.
5. Confirm no new animations/transitions were introduced.
6. Confirm poster dimensions remain rail/grid spec and no unexpected upscaling occurs.
7. Run with populated libraries and verify row scrolling stays smooth.
8. Validate text legibility at 1080p from 10-foot distance.
9. Verify search input + D-pad interaction remains intuitive with virtual keyboard.
10. Verify in both webOS simulator and at least one real TV hardware target.
