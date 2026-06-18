# XPlay UI screenshot review — Google TV redesign

Review of 8 photographed screenshots (IMG_4239–IMG_4246) against
`docs/google-tv-foundation.md` (Google TV / Android TV design system) and general
10-foot D-pad UI best practice. **Analysis only — no source changes.**

Photos are close-up phone shots of a TV panel, so expect glare, moiré, and lens
warp. Those are photo artifacts and are *not* reported as UI bugs; everything below
is a real layout/styling/localization problem visible in the pixels.

Severity legend: **blocker** (ships broken / embarrassing) · **major** (clearly
off-spec, hurts usability or polish) · **minor** (nitpick / consistency).

---

## IMG_4239 — Library grid (poster shelf), resting state
Shows the Movies/Library grid. Left edge has a vertical sort/filter rail with pills
**"Sort: Tit[le]"**, **"Unwatched"**, **"All"** (All is focus-ringed gold). Cards
visible: *American …* (red poster), *127 Hours* "2010 · R", *American Beaut[y]*
"1999 · R", *Carol*.

Issues:
- **Filter rail pills are clipped at the left screen edge** — "Sort: Tit…",
  "Unwatched", "All" all bleed off-frame; the focused **"All"** gold ring is cut on
  its left side. The rail sits outside the `--safe-x` (96px) safe area. **major**
- **Selected/focus pill is a plain rounded rectangle outline**, not the Google
  active-indicator shape (filled pill / tonal lift) the spec calls for on tabs &
  nav. Inconsistent with component spec §Tabs. **major**
- **Card metadata casing/format is inconsistent** — "2010 · R", "1999 · R" use a
  mid-dot separator, fine, but the label is tiny relative to the card and sits far
  below the poster with a large gap (loose vertical rhythm vs. spec "metadata below
  image"). **minor**
- **Mixed card aspect ratios in one shelf** — *127 Hours* is a 16:9 landscape still
  while *American Beauty* / *Carol* are 2:3 posters, in the same row. Spec wants one
  ratio per shelf (cards §ratios). Looks ragged; top edges don't align. **major**
- **Vertical filter rail on the left is itself off-pattern.** Google TV uses a left
  *navigation* drawer (destinations) — content filters belong in top **tabs** (pill
  indicator), not a second left rail competing with the nav drawer. **major**

---

## IMG_4240 — Same library grid, *127 Hours* card focused
Same screen; the *127 Hours* 16:9 card now has the gold focus ring and is scaled up.

Issues:
- **Focus scale is clipping/colliding with neighbors.** The grown card's gold ring
  overlaps the *American* poster above and overruns the *127 Hours* / "2010 · R"
  metadata of the card to its right (text "12/ Hours … 2010 · R" is half-hidden
  behind the focused card). Insufficient inter-card gutter for the `1.1×` focus
  grow. **blocker**
- **Focus ring is a flat gold outline only — no glow / elevation.** Spec focus =
  scale + glow (box-shadow elevation) + outline. On a 16:9 still the bare ring reads
  as a cheap border. (Acceptable *only* if this is a webOS-4/B8 static-ring device;
  otherwise off-spec.) **major**
- **Ring corner radius doesn't match the card radius** — the gold stroke corners are
  tighter than the image's rounded corners, leaving a sliver of background between
  art and ring at each corner. **minor**
- **Metadata of the focused card is overlapped by its own ring** at the bottom — the
  grow pushes the card down over the label rather than the label moving with it.
  **major**

---

## IMG_4241 — Player/secondary control cluster, subtitles button focused
Close-up of three circular icon controls. Center one is **focused**: a **blue
filled circle with a thick gold ring** containing a subtitles/CC glyph (rounded rect
with dots). Flanked by a flag/bookmark outline icon (left) and a tall rounded-rect
outline icon (right, PiP/device?).

Issues:
- **Focused control color is wrong.** Spec: *focused = filled **light** circle +
  **dark** icon*. Here focus = saturated **blue** fill + **gold** ring + light icon
  — the inverse of spec, and the eye-searing blue is off the palette
  (`--gt-primary` is gold `#f0b533`, not blue). **blocker**
- **The CC glyph is not optically centered** in the circle — it sits slightly high
  and left of the circle's center. **major**
- **Icons are generic / low-quality and stylistically mixed.** The left "flag"
  bookmark glyph and the right rounded-rectangle are thin hairline strokes that
  don't match the filled subtitles glyph; stroke weights and metrics differ between
  icons. Reads "homemade/inconsistent" (the exact complaint the redesign is meant to
  fix). **major**
- **Unfocused icons are low-contrast blue-on-black** with no resting container; per
  spec resting state should be a translucent dark circle + light icon so the targets
  are discoverable. **major**

---

## IMG_4242 — Detail/header area: "XPlay" wordmark + focused play affordance
Bottom-left of a detail screen. Large **"XPla[y]"** brand wordmark in blue, a thin
divider rule beneath it, a **yellow rounded-square button with a black up-triangle**
(focused), and a blue chevron/back glyph to its right. A poster thumbnail peeks top.

Issues:
- **Brand wordmark is enormous and competes with content.** "XPlay" is rendered at
  near-headline size in the chrome of a *detail* page. Google TV doesn't persist a
  big brand wordmark on inner screens — branding lives (small) on Home only. **major**
- **The focused control is a yellow rounded-*square*, not a circle/pill.** The player
  spec calls for circular icon buttons; buttons spec calls for pill/`--radius-lg`.
  A gold rounded-square is a third, off-spec shape. **major**
- **Glyph quality:** the up-triangle "play/expand" glyph is a plain filled triangle,
  not centered, and ambiguous (is it play? scroll-to-top? expand?). **major**
- **Divider rule runs full-bleed under the wordmark** and is the only structure —
  feels like an unstyled `<hr>` rather than a surface/elevation boundary. **minor**

---

## IMG_4243 — Detail screen action row: Play / Playback compat… buttons
Detail page for a 1999 show ("**1999 · 22m · TV-1[4]**", desc "In a wacky Rhod…
scenario to anot[her]…"). Buttons: a blue **"Ma…"** (More?) pill top, a **gold
"Play"** button (focused), and an **outline "Playback compa[tibility]"** button.
A bright cartoon still (Mario/Sonic-style) sits bottom.

Issues:
- **Button label is truncated: "Playback compa…"** — the outline button text is
  clipped by its own width. Spec: buttons **no text wrap**, but that means the label
  must *fit*, not be cut off. Either the label is too long or the button too narrow.
  **major**
- **Top "Ma…" button is also truncated** ("More"? "Mark…"?). Same width/label
  problem. **major**
- **Three different button shapes/heights in one action row** — the blue pill, the
  gold rounded-rect "Play", and the gold-outline rectangle have different corner
  radii and heights and don't share a baseline. Spec wants a consistent button
  system with **one primary** (filled gold Play) and outline secondaries. **major**
- **Focused "Play" sits *lower* than the unfocused buttons** — baselines are
  misaligned; the row reads crooked. **major**
- **Over-saturated cartoon artwork** butts directly against the buttons with no
  scrim/gap, hurting button legibility. Spec wants cinematic scrim separating
  content block from artwork. **minor**
- **Metadata casing:** "1999 · 22m · TV-1[4]" fine, but lives far left, vertically
  unaligned with the button column. **minor**

---

## IMG_4244 — Episode detail (immersive list) — *Family Guy*
Richest shot. Breadcrumb + wordmark bottom-left, a large **empty blue placeholder
rectangle** where the still/backdrop should be, a metadata block, a bottom nav/
control rail, and Play / "Mark watched" / "Subtitles Off" controls right.
Title block: **"Family Guy" / "Fast Times at Buddy Cianci Jr. High" / "S4 · E2" /
"2005년 5월 8일 · 21m · TV-14" / "Audience 6.8"** and a synopsis
("Brian becomes a substitute teacher at Chris' school af…").

Issues:
- **🔴 KOREAN DATE BUG (confirmed).** The air date renders as **"2005년 5월 8일"**
  (년=year 월=month 일=day) — Korean locale formatting on an otherwise all-English
  UI. Locale/`toLocaleDateString` is picking up the TV's system locale instead of
  forcing app locale / a fixed format. **blocker**
- **🔴 WORDMARK ↔ BREADCRUMB COLLISION (confirmed).** Bottom-left the **"XPlay"**
  wordmark and the breadcrumb **"Family Guy › Season 4 › Fast Times at Buddy Cia…"**
  literally overlap — letters touch ("XPlaʸamily Guy") with no gap. Two separate
  elements rendered on top of each other. **blocker**
- **🔴 Empty blue placeholder where the episode still/backdrop should be** — a flat
  `--gt-primary`-ish blue rounded rectangle with no image and no loading state. Either
  a broken image URL or missing skeleton. Dominates the screen. **blocker**
- **Breadcrumb itself is off-pattern.** Google TV is Back-to-Home, no on-screen
  breadcrumb trail; a 3-level "Family Guy › Season 4 › Episode" crumb contradicts the
  spec's "no deep nested hierarchies / Back walks toward Home." **major**
- **Bottom nav/control rail icons are generic blue hairline glyphs**, mismatched
  weights, and one item (back-arrow) is in an **olive/green circle** — green is not in
  the palette at all; focused state should be gold ring or light fill, not green.
  **major**
- **Icon centering:** glyphs in the bottom rail are not optically centered in their
  hit areas (subtitles "grid" icon sits high). **minor**
- **"Subtitles Off" / "Mark watched" / "Play"** controls on the right are crammed
  against the screen edge, outside safe area, and "Play" (the primary) is *not* the
  visually dominant/first-focus element — it's a small gold chip below two others.
  Spec: one primary, focus lands on it first. **major**
- **Audience rating "Audience 6.8"** label phrasing/format is unpolished (no
  star/scale, ambiguous out of what). **minor**

---

## IMG_4245 — Subtitles selection menu (upward panel)
Subtitle picker. Columns of language tiles: **"Off ✓"** (selected, gold text +
checkmark), **"English (CC)"**, **"Dansk · SRT · E…"** (focused, gold ring),
**"Deutsch · SRT"**, **"Español · SRT · …"**, **"Español (Latino…"**. Episode title
"…Jr. Hi[gh]" peeks below.

Issues:
- **Selected vs. focused styling is muddy.** "Off" (selected) = gold text +
  checkmark on a slightly lighter tile; "Dansk" (focused) = gold ring. Spec:
  selected item = **light pill + trailing checkmark**, focused = ring/scale. Here
  selected has no pill and focused has no fill — hard to tell selected from focused
  at a glance. **major**
- **Items look like buttons in a row, not a list.** Spec §Lists: subtitle options
  should be a vertical list with radio/checkmark selection, *not* horizontally
  scrolling button-tiles. This is the wrong component. **major**
- **Tile labels are truncated**: "Dansk · SRT · E…", "Español · SRT · …",
  "Español (Latino[américa]…". The "· SRT ·" technical suffix eats the label width;
  format/source codes shouldn't push the language name out of view. **major**
- **Inconsistent metadata in labels** — "English (CC)" has no "· SRT", others do;
  mixing parenthetical descriptors and dot-separated codes in the same list looks
  ad-hoc. **minor**
- **Menu panel direction/anchoring** reads as a left-to-right strip rather than the
  spec's dark rounded panel opening **upward** from the focused control with a
  `‹ Category ›` header. No visible category header / chevrons. **major**

---

## IMG_4246 — Quality selection menu (upward panel)
Bitrate/quality picker. Header **"QUALITY"** (small caps), selected **"Original ✓"**
(gold + checkmark), then **"20 Mbps 1080p"**, **"12 Mbps 1080p"**, **"10 Mbps
1080p"**, **"8 Mbps 1080p"**, **"4 Mbps 720p"**. Title "…Hi[gh]" peeks below.

Issues:
- **Same selected/focused ambiguity** as the subtitles menu — "Original" selected =
  gold text + checkmark but no light pill; relies on color alone. **major**
- **Header "QUALITY" is ALL-CAPS** while the spec/type system is **sentence case**
  for labels (label role 19/24/500). Casing inconsistency. **minor**
- **Options are horizontal button-tiles again**, not a vertical radio list (same
  wrong-component issue as IMG_4245). **major**
- **Option labels are dense and unranked** — "20 Mbps 1080p / 12 Mbps 1080p / …"
  leads with the bitrate number; for a 10-foot UI the human-meaningful token (1080p)
  should lead, with bitrate secondary/de-emphasized. Five near-identical "Mbps
  1080p" strings are hard to scan. **minor**
- **No "Auto"/adaptive option visible** and "Original" vs explicit bitrates mixes two
  mental models in one flat list. **minor**
- **Same upward-panel anchoring/header-chevron gap** as IMG_4245 — "QUALITY" is a
  plain label, not the spec's `‹ Quality ›` category header for switching between
  Subtitles/Audio/Quality categories. **minor**

---

## Top cross-cutting issues (ranked)

1. **Korean date localization bug (blocker).** Air dates render as
   "2005년 5월 8일" (IMG_4244). All-English UI is leaking the TV's system locale into
   date formatting. Force a fixed locale/format for dates app-wide. *Confirmed.*

2. **"XPlay" wordmark collides with the breadcrumb (blocker).** On the detail screen
   the brand wordmark and "Family Guy › Season 4 › …" trail are drawn overlapping
   (IMG_4244, IMG_4242). Two elements share the same space. *Confirmed.* Bigger
   picture: per spec, neither a persistent big wordmark nor a breadcrumb belongs on
   inner screens — remove/relocate both.

3. **Broken/empty image placeholders (blocker).** The episode still is a flat blue
   rectangle with no art and no skeleton (IMG_4244) — looks broken, dominates the
   screen.

4. **Focus-grow clipping & collision (blocker→major).** Focused cards overrun
   neighbors and their own metadata for lack of gutter (IMG_4240); right-side detail
   controls and the left filter rail sit outside the safe area and clip (IMG_4239,
   IMG_4244). Budget space for the `1.1×` grow and respect `--safe-x/y`.

5. **Focus/selected state is off-spec and inconsistent (blocker→major).** Focused
   player control is a saturated **blue** circle + gold ring (IMG_4241) — spec is a
   light fill + dark icon. A focused nav item is **olive green** (IMG_4244) — green
   isn't even in the palette. Menu "selected" relies on gold text + checkmark with no
   light pill (IMG_4245/4246). Unify on: focus = ring/glow/scale; selected = light
   pill + checkmark; palette = gold primary, never blue/green.

6. **Generic, mismatched, off-center icons (major).** Player and bottom-nav glyphs
   are thin hairline line-icons of varying stroke weight, some not optically centered
   in their circles (IMG_4241, IMG_4242, IMG_4244). Exactly the "homemade" look the
   redesign is meant to kill — adopt one consistent icon set sized/centered per spec.

7. **Text truncation in buttons & menu tiles (major).** "Playback compa…", "Ma…"
   (IMG_4243), "Dansk · SRT · E…", "Español (Latino…" (IMG_4245), "Español · SRT · …".
   Labels are clipped by fixed widths; the "· SRT ·" source codes push language names
   out of view. Size buttons to their labels; demote/abbreviate technical suffixes.

8. **Wrong components for content type (major).** Subtitle/quality pickers are
   horizontal **button-tile strips** instead of vertical **lists** with radio/checkmark
   selection and a `‹ Category ›` header opening upward (IMG_4245/4246). Content
   filters use a second **left rail** instead of top **pill tabs** (IMG_4239).
   Re-map to the spec's list / tab / menu components.

9. **Inconsistent button & card systems (major).** One action row shows three button
   shapes/heights on mismatched baselines, with the *primary* not dominant or
   first-focus (IMG_4243, IMG_4244); shelves mix 16:9 and 2:3 cards in one row
   (IMG_4239). Enforce one button system (one primary, outline secondaries) and one
   card ratio per shelf.

10. **Typography & safe-area polish (minor).** ALL-CAPS "QUALITY" header vs.
    sentence-case spec (IMG_4246); loose/uneven metadata rhythm under cards; right-edge
    controls crammed past the safe margin. Tighten to the type roles and `--safe-x/y`.
