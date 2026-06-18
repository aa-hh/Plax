# Google TV / Android TV — Live Spec Supplement

Live-fetched from official Android Developers documentation on 2026-06-18.
Cross-referenced against `google-tv-foundation.md` (the in-house spec).
Each item is tagged: **CONFIRMS** (matches existing spec), **REFINES** (same topic, adds precision),
or **ADDS** (not covered in foundation doc).

---

## 1. Foundations / Design Principles

Source: https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv

**CONFIRMS** — 10-foot viewing distance (3 metres) is the baseline assumption; large targets,
minimal reading, instant focus feedback. No numeric values on this overview page.

**CONFIRMS** — Communal/shared device. Apps showing personal info should have privacy settings.
The foundation doc is silent on this; worth noting for any user-profile or history surface.

**CONFIRMS** — D-pad (up/down/left/right/select) is the primary input. "TV UI must provide instant
and distinct feedback when buttons are pressed."

---

## 2. Layout & Grid

Source: https://developer.android.com/design/ui/tv/guides/styles/layouts

### 2a. Base design resolution — CONFIRMS

| Property | Live doc | Foundation doc | Notes |
|---|---|---|---|
| Design canvas | 960 × 540 px MDPI | implicit (1080p target) | At MDPI, 1px = 1dp |
| Asset target | 1080p (scales to 720p) | 1080p | Keep |
| Aspect ratio | 16:9 fixed | 16:9 | Keep |

### 2b. Overscan safe area — REFINES

The live doc gives two tiers:

| Tier | Horizontal | Vertical |
|---|---|---|
| Minimum (5% rule) | **48dp** left + right | **27dp** top + bottom |
| Recommended (enhanced safety) | **58dp** left + right | **28dp** top + bottom |

Foundation doc uses `--safe-x: 96px / --safe-y: 54px` (= 48dp / 27dp at ×2 pixel ratio).
This is the minimum tier. The live doc recommends going to 58dp/28dp. Consider bumping
`--safe-x` to 116px / `--safe-y` to 56px for the "enhanced safety" variant, or adding a
`--safe-x-lg` token.

### 2c. 12-column grid — CONFIRMS + REFINES

| Property | Live doc | Foundation doc |
|---|---|---|
| Columns | 12 | 12 (keep) |
| Column width | **52dp** | 104px (= 52dp at ×2) |
| Gutter | **20dp** | 40px (= 20dp at ×2) |
| Vertical line spacing | **4dp** | 4dp baseline |

Content area math (at reference 960px canvas):
- 12 × 52dp = 624dp columns
- 11 × 20dp = 220dp gutters
- Total: 844dp content width (= 960 − 48 − 48 side margins)

Card widths within 844dp content area (all ×2 for px):

| # cards | dp width | px width (×2) |
|---|---|---|
| 5 | 124dp | 248px |
| 4 | 196dp | 392px |
| 3 | 268dp | 536px |
| 2 | 412dp | 824px |
| 1 | 844dp | 1688px |

**ADDS** — Card peaking spacing: **20dp** between cards (matches gutter). The foundation doc
mentions gutter/spacing but does not explicitly link card peaking to the 20dp gutter.

### 2d. Layout templates — ADDS

The live doc defines nine named templates not enumerated in the foundation doc:

| Template | Pattern | Use case |
|---|---|---|
| Browse | Vertical Stack | Shelves of media; vertical = rows, horizontal = items |
| Left Overlay | Overlay | Navigation panel / nav drawer |
| Right Overlay | Overlay | Action panel, independent of background |
| Center Overlay | Overlay | Modal dialogs, urgent decisions |
| Bottom Overlay | Overlay | Bottom sheets, complementary content |
| Actions | Horizontal Stack | Title/subtitle left, options/actions right |
| Content Details | Horizontal Stack | Title + metadata + description + actions |
| Compilation | Two-Pane | Details left, related/episodes right |
| Grid | Grid | Collections with clear remote navigation |
| Alert | Full-Screen | Requires action to unblock |

Key cognitive-load rule (verbatim): "Don't use too many panels — creates unnecessary cognitive
load." "Don't direct user attention back-and-forth between panels — creates unnatural focus paths."

### 2e. Focus-in-grid overlap rule — ADDS

Explicit warning in the layout doc: when items scale on focus, **padding between items must
account for the focused state size increase to prevent overlap**. The foundation doc notes
`1.1×` scale but does not call out the grid-padding implication explicitly.
Rule: `card-gap ≥ (card-width × (focus-scale − 1)) / 2` per edge.
At 4-up (196dp cards, 1.1×): min gap ≈ 9.8dp → the 20dp gutter comfortably covers this.

---

## 3. Navigation

Sources:
- https://developer.android.com/design/ui/tv/guides/foundations/navigation-on-tv
- https://developer.android.com/training/tv/get-started/navigation
- https://developer.android.com/design/ui/tv/guides/styles/focus-system

### 3a. D-pad navigation rules — CONFIRMS + ADDS

**CONFIRMS** — "D-pad moves focus from one element to the nearest element in the corresponding
direction." Vertical axis = categories/rows; horizontal axis = items within a row.

**ADDS** — Explicit navigation reachability requirement (verbatim):
> "Ensure a user can navigate to all focusable elements on the screen."
> "For scrolling lists, make sure the D-pad up and down buttons scroll the whole list and each
> list item can be selected."

**ADDS** — Hard rule on unreachable controls (verbatim):
> "If there isn't a straight path to get to a control, consider relocating it."
> "Place controls, like the search action, in locations that don't overlap with other clickable
> elements."
> Avoid "layouts that contain controls in hard-to-reach places" and "complex and nested layout
> hierarchies."

### 3b. Back button — CONFIRMS + ADDS

**CONFIRMS** — Back = remote only; no on-screen back button (verbatim: "Avoid showing a back
button on the screen. Users can use the back button on the remote.").

**CONFIRMS** — Back walks to app home, then to Google TV Launcher.

**ADDS** — Fixed start-destination rule (verbatim):
> "The first screen the user sees when they launch the app from the launcher is also the last
> screen the user sees when they return to the launcher after pressing the back button."
> "Don't include a splash screen in the backwards navigation."

**ADDS** — Deep-link back rule (verbatim): if user deep-links to a detail page, back takes them
to the app home page — not directly to Launcher.

**ADDS** — No exit confirmation (verbatim):
> "Ensure that the back button isn't gated by confirmation screens or part of an infinite loop."
> "Users should be able to exit out of the app without any confirmation."
This is a hard rule. Our exit-confirm modal (`modal-exit`) **violates this spec** and should be
removed or replaced with a press-and-hold pattern.

### 3c. Home button — ADDS

Not in foundation doc. Live doc specifies:
- Single press home → Google TV Home / Launcher always (OS-handled; apps cannot override).
- **Long press home** → system dashboard (Google TV) or apps grid (Android TV).

### 3d. Focus system — REFINES

Source: https://developer.android.com/design/ui/tv/guides/styles/focus-system

**REFINES** — Exact scale tiers (verbatim):
> "Scale indication values: **1.025, 1.05 and 1.1×**"
> "Use this indication for clear feedback on navigation. The scaling values for different elements
> can vary based on their size."

Foundation doc only cites 1.05× and 1.1×. The 1.025× tier applies to small/dense elements
(e.g. list items in settings) where 1.1× would cause overlap.

**REFINES** — Glow range (verbatim): "Glow level: suggests elevation of the element, ranging
from **2dp – 32dp**." Foundation doc mentions glow/elevation but not the 2–32dp range.

**ADDS** — Focus indicator has four independently configurable properties:
1. **Scale** — size increase
2. **Border** — outline drawn around the element
3. **Glow** — shadow/elevation under element
4. **Colors** — element background and content color change

The outline has three sub-properties: width, inset (gap between element edge and outline), and
color. The live doc does not give numeric defaults for width or inset.

**CONFIRMS** — Three main states: default, focused, pressed. Plus: enabled, disabled (lower
opacity/prominence), selected (persistent).

No animation timing values are published in the live focus-system doc.

---

## 4. Color

Sources:
- https://developer.android.com/design/ui/tv/guides/styles/color-system
- https://developer.android.com/design/ui/tv/guides/foundations/color-on-tv

### 4a. Color system — CONFIRMS

**CONFIRMS** — Material 3 color roles (primary, secondary, tertiary, neutral/surface, outline).
No TV-specific hex values published; exact values come from Material Theme Builder or the TV
Design Kit Figma.

**CONFIRMS** — Android TV does not support wallpaper; no user-generated dynamic color schemes.
All theming is app-controlled.

**CONFIRMS** — Dark theme strongly recommended (verbatim): "Consider using a dark theme to
enhance your cinematic TV experience."

### 4b. Color space — ADDS

Not in foundation doc:
- **sRGB** is the standard for UI elements; "most widely used, compatible with the largest range
  of TV models."
- **DCI-P3** is for video content when targeting advanced displays with wider gamut. May not
  display correctly on standard TVs.
- Rule: "When designing basic UI elements, use the standard sRGB color space to maximize
  consistency across a range of TV models."

Foundation doc mentions sRGB in passing; this firms it up as the explicit UI rule.

### 4c. Contrast — CONFIRMS + ADDS

**CONFIRMS** — "Use high contrast between text and background colors."

**ADDS** — Power consumption note (verbatim): "Color choices can affect power consumption on TV.
Using darker colors saves power. **Avoid using white background unless necessary.**"

**ADDS** — Screen banding rule: "Use high color-depth gradients (e.g., 10-bit or higher). Avoid
extreme color transitions." Foundation doc mentions banding risk; the live doc frames it as a
display depth issue, not just gradient smoothness.

No numeric contrast ratio (e.g. WCAG 4.5:1) is published in the TV design docs; Material 3
minimum contrast ratios apply by reference.

---

## 5. Cards

Source: https://developer.android.com/design/ui/tv/guides/components/cards

### 5a. Card dimensions — CONFIRMS + REFINES

**CONFIRMS** — Card widths match the 12-column grid (see §2c table above).

**CONFIRMS** — Three aspect ratios: 16:9, 1:1, 2:3.

**REFINES** — Card-to-card peaking spacing is explicitly **20dp** (matches gutter). Foundation
doc has gutter = 20dp but doesn't explicitly link it to card row spacing in the component spec.

**CONFIRMS** — Content block width = same as image thumbnail width.

### 5b. Card variants — CONFIRMS

Five variants confirmed: Standard, Classic, Compact, Wide Standard, Wide Classic.

### 5c. Compact card scrim — ADDS (explicit rule)

Verbatim do/don't:
- DO: "Use compact cards with scrim on top of image background for text readability." Apply
  "semi-transparent black gradient overlay — darkens the background without obscuring the image
  too much."
- DON'T: "Don't use compact cards without scrim on top of background image."
- DON'T: "Avoid long titles, subtitles, or descriptions on compact cards."
- DON'T: "Avoid long descriptions on vertically stacked cards."
- DO (exception): "Use wide cards to show short descriptions, but only if absolutely necessary."

---

## 6. Playback / Player Controls

Sources:
- https://developer.android.com/training/tv/playback/controls
- https://developer.android.com/docs/quality-guidelines/tv-app-quality

### 6a. D-pad control mapping — CONFIRMS + REFINES

**CONFIRMS** — Center D-pad = play/pause (verbatim): "While a video or audio is playing, pressing
the center D-pad button pauses the media. Pressing the button again resumes playback."

**REFINES** — Full D-pad action table (not in foundation doc):

| Button | Action |
|---|---|
| Center | Play / Pause |
| Right (single press) | Fast-forward +N seconds |
| Left (single press) | Rewind −N seconds |
| Right (hold) | Scrub forward |
| Left (hold) | Scrub rewind |
| Up or Down | **Peek** — show progress/info without pausing |

**ADDS** — Peek behavior (verbatim): "Pressing the up or down D-pad button peeks up controls but
does not pause the video." This is distinct from center-press (which pauses). Foundation doc's
player spec mentions down = peek Info but does not document up = same.

**ADDS** — State continuity rule (verbatim): "The playing or paused state is maintained when
rewinding or fast-forwarding."

### 6b. Quality requirements for playback (mandatory, not optional) — ADDS

These are shipping requirements, not guidelines. Source: TV App Quality doc.

| ID | Requirement (verbatim) |
|---|---|
| TV-PC | "Pressing the D-pad center button pauses the media that is playing. When playback is paused, pressing the D-pad center button resumes playback. The D-pad left and right buttons fast-forward and rewind the current track, respectively." |
| TV-PP | "If the app plays video or music content, the app toggles between playing and pausing media playback when a play or pause key event is sent during playback." (Hardware media keys must also work.) |
| TV-DP | "The app functionality is navigable using five-way D-pad controls." |
| TV-DB | "Back button presses lead back to the Android TV home screen." |
| TV-DM | "The app does not depend on a remote control device having a Menu button to access user interface controls." |
| TV-OV | "The app does not display any text or functionality that is partially cut off by the edges of the screen." (Overscan rule, mandatory.) |
| TV-LO | "The app supports landscape orientation without vertical letterboxing or pillarboxing. Use only black for bars on original-format videos." |
| TV-TR | "The app does not partially obscure other apps. The app fills the entire screen and has a non-transparent background." |

### 6c. Ambient mode — ADDS

Not in foundation doc. Rules:

| ID | Rule |
|---|---|
| TV-BU | During active video playback: app **must prevent** device entering Ambient Mode. |
| TV-BY | When no active playback: app **must not prevent** Ambient Mode. |
| TV-BA | Audio-only: must not prevent Ambient Mode unless showing non-static imagery (music video / slideshow). |

### 6d. Picture-in-Picture — ADDS

- PiP requires explicit user action; `setAutoEnterEnabled` must be `false` unless the user is in
  an ongoing call.
- While in PiP: no UI controls or navigable elements displayed in the PiP window.

### 6e. Playback auto-hide timing — NOT PUBLISHED

Neither the design doc nor the quality requirements publish a numeric auto-hide duration for
playback controls. Foundation doc's current spec (controls show on any key press, then auto-hide)
is consistent with the qualitative spec. Choose a value (5–8 s is common industry practice).

---

## 7. Exit Confirmation — CONFLICT WITH LIVE SPEC

**This is a conflict the foundation doc does not address.**

TV App Quality requirement TV-DB + the Navigation-on-TV doc both state (verbatim):
> "Ensure that the back button isn't gated by confirmation screens or part of an infinite loop."
> "Users should be able to exit out of the app without any confirmation."

XPlay currently has an exit-confirm modal (`modal-exit`, styled in commit `60bf870`). This
violates the published spec. Options:
1. Remove the exit modal entirely (compliant; simplest).
2. Replace with a double-back pattern (press Back twice within ~2 s to exit) — no modal needed.
3. Keep modal only for destructive in-app actions (not for app exit).

---

## 8. Launcher Banner / Icon

Source: TV App Quality (TV-LB)

**ADDS** — Required asset sizes not in foundation doc:
- Launcher banner (wide): **320 × 180 px**
- App icon: minimum **160 × 160 px** at xhdpi density

---

## Summary of Key Additions vs. Typical TV Spec

| Topic | What the live docs add that is non-obvious |
|---|---|
| Overscan | Two tiers: 48dp minimum vs 58dp recommended. Foundation uses minimum. |
| Focus scale | Three tiers: 1.025× / 1.05× / 1.1×. Use 1.025× for dense/small elements. |
| Glow range | 2dp–32dp is the published range for the glow/elevation indicator. |
| Exit confirm | Hard prohibition: no confirmation screens on Back-to-exit. Exit modal violates spec. |
| Peek vs pause | Up/Down = peek (no pause); Center = play/pause. Both directions peek in player. |
| Card scrim | Compact cards without scrim are an explicit DON'T, not just a suggestion. |
| Card peaking | 20dp explicit (matches column gutter). |
| Ambient mode | Must prevent ambient during active video; must not prevent it otherwise. |
| Color space | sRGB for all UI; DCI-P3 for video only. |
| Power | Avoid white backgrounds — power consumption on OLED/TV panels. |
| Banding | Use 10-bit+ gradients; avoid extreme transitions. |
| Deep-link back | Back from deep-link goes to app home, not directly to Launcher. |
| Home long-press | System dashboard (Google TV) / apps grid (Android TV). App cannot intercept. |
| Quality reqs | TV-PC/PP/DP/DB/DM/OV/LO/TR are hard shipping requirements, not guidelines. |
