# Plax

Plax is a Plex client for LG webOS TVs. It browses a media server's content, decides how each file can be played on an old TV decoder, and drives the whole interface from a remote control's directional pad.

This file is the project's glossary. It records which word wins when the codebase has several for the same thing. It is not a spec and holds no implementation detail.

## Language

### Content

**Media server**:
The machine that stores and serves the content, plus the API in front of it. Usually a Plex server; Jellyfin is a second backend behind the same contract.
_Avoid_: PMS, backend (as a word for the server itself)

**Backend**:
One implementation of the media-server contract, Plex or Jellyfin. The word describes our adapter code, never the user's server.
_Avoid_: provider, integration

**Library**:
A top-level content collection on a media server, such as Movies or TV Shows. Plex's API calls these sections and Jellyfin's calls them views; we call both a library.
_Avoid_: section, view, collection folder

**Item**:
One piece of content: a movie, show, season, or episode. The normalized shape every screen and the player consume, whichever backend it came from.
_Avoid_: metadata, media (for this sense), entry

**Version**:
One of several encoded files behind a single item, differing in resolution, codec, or bitrate.
_Avoid_: media, rendition, copy

**Hub**:
A titled, server-supplied group of items, such as Continue Watching or Recently Added. The data; a rail is how it is drawn.
_Avoid_: shelf, feed

**Marker**:
A skippable region inside an episode, either an intro or the closing credits.
_Avoid_: segment, chapter

**Continue Watching**:
The hub of partly-watched items offering to resume.
_Avoid_: On Deck, Up Next (a different thing, see below)

**Watchlist**:
A named list of bookmarked items the user built by hand, stored on this TV only. Not Plex's own cloud watchlist, which Plax does not use.
_Avoid_: favourites, bookmarks, my list

**Up Next**:
The queue the user fills by hand with "play this after". Distinct from the autoplay queue.
_Avoid_: user queue, play queue

**Autoplay queue**:
The run of remaining episodes in a season that plays on automatically. Built for the user, never curated by them.
_Avoid_: playback queue, Up Next

### Accounts

**Profile**:
One member of a Plex Home account, with its own watch state and library access.
_Avoid_: home user, sub-account, persona

**Restricted profile**:
A profile the account owner has limited to specific libraries, usually a child's.
_Avoid_: managed user, child user, kid profile

**Owner**:
The Plex account that owns the server, as opposed to a profile under it or an account the server was shared with.
_Avoid_: admin, primary user

**Link**:
Connecting Plax to a Plex account by showing a short code the user types at plex.tv on another device.
_Avoid_: sign in, log in, pair, PIN flow

### Playback

**Playback strategy**:
How a given file reaches the TV, chosen per play: direct play, direct stream, or transcode.
_Avoid_: mode, strategy on its own, delivery method

**Direct play**:
The original file is sent untouched and the TV decodes it as-is. Cheapest on the server, fussiest about the TV.
_Avoid_: passthrough, native play

**Direct stream**:
The server repackages the file into a container the TV accepts without re-encoding the video or audio.
_Avoid_: remux, copy

**Transcode**:
The server re-encodes video or audio into something the TV can decode. The expensive last resort.
_Avoid_: convert, re-encode (as the noun for this)

**Fallback ladder**:
The fixed order Plax walks when a strategy fails: direct play, then direct stream, then transcode.
_Avoid_: the ladder on its own, fallback chain

**Quality ladder**:
The ordered bitrate tiers a transcode can be pinned to, from original down to the lowest.
_Avoid_: the ladder on its own, bitrate ladder, transcode ladder

**Quality profile**:
The user's chosen ceiling for a play, from Original down a named tier of the quality ladder.
_Avoid_: quality setting, Auto

**Bitrate cap**:
An upper bound on video bitrate, whether the TV imposes it or the user picked it.
_Avoid_: bitrate limit, bitrate ceiling

**Capability matrix**:
What a given webOS generation can actually decode: codecs, containers, resolution, bitrate, and subtitle formats.
_Avoid_: compatibility matrix, codec table, support matrix

**Track**:
A selectable audio or subtitle option on an item. Plex's API calls these streams; to us a stream is only the wire format.
_Avoid_: stream (for this sense), channel

**Burn-in**:
Painting subtitles into the video pixels during a transcode, needed when the TV cannot draw the subtitle format itself.
_Avoid_: hardcode, render subtitles

**Sidecar**:
A subtitle that arrives as its own file rather than inside the video container.
_Avoid_: external subtitle, side-loaded

**Resume point**:
How far into an item the user last got.
_Avoid_: view offset, resume offset, resume position, watch progress

**Rebuffer**:
Playback stopping to wait for data after it has already started. The signal that triggers a fallback.
_Avoid_: stall, buffering (for this sense), hitch

**Scrobble**:
Marking an item watched once playback passes the completion threshold, separate from ordinary progress reporting.
_Avoid_: mark watched, complete

**Timeline**:
Progress reported back to the media server so other Plex clients agree on where the user is.
_Avoid_: heartbeat, progress sync

### Interface

**Screen**:
One user-visible destination, such as Home, a library, item detail, or the player. The unit the router mounts and retains.
_Avoid_: page, view, route (a route is the key that names a screen, not the screen)

**Rail**:
A horizontal strip of cards the user scrolls sideways. Usually the drawn form of a hub.
_Avoid_: row, carousel, shelf

**Card**:
The whole focusable unit for one item in a rail or grid, poster plus its text.
_Avoid_: tile, cell

**Poster**:
The artwork image inside a card. Never a word for the card itself.
_Avoid_: thumbnail, artwork, cover

**Nav drawer**:
The collapsible navigation column down the left edge.
_Avoid_: sidebar, side nav, menu

**Modal drawer**:
The single overlay pattern everything on top of a screen uses. It has two forms, the action dialog and the side panel.
_Avoid_: modal on its own, popup, sheet

**Action dialog**:
The modal drawer form that asks a short question and offers a couple of buttons.
_Avoid_: confirm, alert, prompt

**Side panel**:
The modal drawer form that slides in a list to pick from, such as subtitles or quality.
_Avoid_: sheet, flyout, tray

**Zone**:
A marked group of focusable elements the directional pad treats as one unit, so a press moves between groups before it moves inside one.
_Avoid_: container, group, cluster, band

**Focus memory**:
A zone remembering which of its children was focused last, so returning to it lands in the same place.
_Avoid_: focus restore, last focus

**D-pad**:
The remote's directional pad, and the input model the whole interface is built around.
_Avoid_: arrow keys, remote keys

**Back key**:
The remote's dedicated Back button, which has its own key code distinct from Escape.
_Avoid_: back button, return key

### Platform

**webOS major**:
The integer generation of a TV's firmware, 4 through 26. The number every capability and feature decision keys off.
_Avoid_: OS version, firmware version

**Version gate**:
The startup check that refuses to run on a webOS generation below the supported floor.
_Avoid_: version check, minimum check

**B8**:
The 2018 LG OLED B8, the project's reference worst case: the oldest supported generation, the slowest processor, the fussiest decoder.
_Avoid_: the old TV, legacy device

**Simulator**:
LG's desktop stand-in for a TV. A third runtime alongside a real TV and a plain browser, and unreliable for timing and decoding.
_Avoid_: emulator, dev target

**Motion cursor**:
The on-screen pointer the Magic Remote shows when it is waved, which suppresses directional-pad focus while it is visible.
_Avoid_: pointer, cursor, Magic Remote (the remote is the hardware, not the pointer)

**Overscan**:
The screen edge a TV may crop, and the reason content keeps a wide outer margin.
_Avoid_: safe area, bleed
