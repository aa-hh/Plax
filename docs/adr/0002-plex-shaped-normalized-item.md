# The cross-backend item shape is Plex's shape

Plax speaks one normalized vocabulary for content everywhere: the shape Plex's `mapLibraryItem` produces. The Jellyfin backend translates `BaseItemDto` into that exact shape, so screens, the player, and the caches never see Jellyfin field names and never branch on which server they are talking to. Plax was a Plex client first, and its consumers already spoke Plex's shape, so Plex's vocabulary became the neutral one rather than a third schema both backends would translate into.

This is why a Jellyfin item carries a `ratingKey` holding Jellyfin's `Id`, why a Jellyfin library is called a library rather than a view, and why Jellyfin's `MediaSources` and `MediaStreams` are reshaped into Plex's nested Media / Part / Stream. A reader who assumes those names leaked by accident will be tempted to "fix" them.

The repo does not record a neutral third vocabulary being evaluated and rejected. Treat this ADR as recording the choice and its cost, not a comparison.

## Consequences

- Bitrate is always Kbps at the seam. Jellyfin reports bits per second, so `mapItem` divides by 1000 and the playback code multiplies back for Jellyfin's API. The division is not a bug.
- A Jellyfin stream must carry its MediaStream index as both `id` and `index`, because the shared track-selection code picks by `id`.
- Concepts with no clean Plex counterpart get filtered rather than modelled. Jellyfin views that are not movie or show libraries are dropped, since the interface has nowhere to put music or photos.
- The contract in `src/backends/interface.js` is JSDoc only and unenforced at runtime, so a backend that drifts from the shape fails at the call site, not at the seam.
- Two places are allowed to know which backend is in play: each provider's own sign-in screens, and `resolveStreamUrl` in the playback session controller. Everywhere else goes through the facade.
