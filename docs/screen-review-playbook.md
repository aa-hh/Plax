# Plax Screen Review Playbook

This playbook gives you a repeatable way to visually review every core screen in the simulator while checking against `docs/design-system.md`.

## How to open and review screens

1. Start simulator:

```bash
cd "Plax"
npm run sim
```

2. Keep dev tools open in the simulator (`Inspect`) while navigating.
3. Use this route order for a full pass:
   - Pairing
   - Bootstrap
   - Home
   - Library
   - Detail
   - Player
   - Search
   - Settings

## Route-by-route review flow

### 1) Pairing
- Expected:
  - Centered title + subtitle
  - Large 4-character PIN and QR
  - Single primary action (`Refresh code`)
- Verify:
  - PIN remains readable at distance
  - Focus ring visible on button
  - Status text updates (`Requesting`, `Waiting`, `Signed in`)

### 2) Bootstrap
- Expected:
  - Centered loading state with one status line
  - Status sequence progresses through account -> servers -> libraries -> home
  - No layout shift while servers/libraries load
- Verify:
  - Subtitle and status spacing match design rhythm
  - Status text remains informative (not generic "Loading…" only)
  - No non-standard elements or odd default browser styles

### 3) Home
- Expected:
  - Top nav (`Home`, `Library`, `Search`, `Settings`)
  - Discovery pivots on Home (`TV`, `Films`, `Search`) for rapid intent switching
  - Compact page title
  - Dense horizontal rails with metadata-rich cards
  - Fixed skeleton rows first, then phased row hydration
- Verify:
  - First rails appear before lower-priority rows finish loading
  - D-pad Up/Down moves between nav and rows
  - Horizontal movement stays within row
  - Vertical scroll happens only when next focused row is below fold
  - No visual layout jump when deferred rails append
  - Switching `TV`/`Films` pivots updates rows in-place without full-screen loading or forced scroll reset

### 4) Library
- Expected:
  - Same top nav pattern as Home
  - Sidebar list + main media grid
  - Scan status messaging in main area
- Verify:
  - Active library state is obvious
  - Grid card spacing and focus ring match Home card language
  - Scan button focus and disabled states are clear

### 5) Detail
- Expected:
  - Poster + metadata + summary + action row
  - Version/audio/subtitle chips in rail style
  - Related content rails below
- Verify:
  - Action buttons are grouped and aligned
  - Direct play notices are readable and non-overlapping
  - Long summaries are clipped without breaking layout

### 6) Player
- Expected:
  - Controls overlay with seek row: elapsed (left), bar (center), total (right)
  - Actions row includes play/pause, seek, audio, subtitles, quality, info, exit
  - Menus/sheets use consistent panel style
- Verify:
  - Overlay auto-hides after 3s inactivity
  - Seek commit changes actual playback time
  - Audio/subtitles/quality/info changes apply in place (no route change away from player)
  - Focus ring and selected state are visually distinct in menus
  - Back behavior is layered (menu -> info -> overlay -> exit)

### 7) Search
- Expected:
  - Same top nav pattern
  - Search input on top, results below
  - Results rendered as reusable hub rows/cards
- Verify:
  - Input focus behavior is predictable with virtual keyboard
  - Down moves into first result
  - Empty and error messages use shared status style

### 8) Settings
- Expected:
  - Same top nav pattern
  - Section headers (`Plex Home`, `Network`, `Playback quality`)
  - Scrollable settings content area with consistent spacing
- Verify:
  - Focus movement through chips/selects/buttons is deterministic
  - Status/error messaging appears in one consistent location
  - Active user chip state is obvious after switching

## Visual quality gates (must pass)

- Consistent focus ring color/thickness on all actionable controls
- No surprise animation or transition-heavy behavior
- Metadata text truncates cleanly (no overflow/collision)
- Back behavior consistent with design-system back-stack rule
- No duplicate "selected" states (selected vs focused always distinguishable)

## Capture checklist (for your own screenshot pass)

Capture one screenshot per route after focus is visible:

1. Pairing
2. Bootstrap
3. Home (nav focused + row focused)
4. Library (sidebar focused + grid focused)
5. Detail (actions visible)
6. Player (overlay + menu)
7. Search (input + results)
8. Settings (section content + action row)

If any gate fails, fix the screen before introducing new UI work.
