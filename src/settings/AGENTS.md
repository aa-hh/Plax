# AGENTS.md — src/settings

## Purpose

User preference stores for playback and network. Persistence is **localStorage
only** — no IndexedDB (webOS4-safe; see [../core](../core/AGENTS.md)). The
settings *screen* UI lives in [../ui/screens](../ui/screens/AGENTS.md)
`settingsScreen.js`; this folder holds the preference model and resolution logic.

*Keep this file up to date when:* a new preference is added or the network policy
resolution changes.

## Notable Patterns

- **Network policy is resolved per webOS major.** `networkPrefs.js` computes the
  secure/insecure connection policy (matters for LAN 4K) consumed by
  [../plex](../plex/AGENTS.md) `servers/connectionPolicy.js`.
- Quality, subtitle, and version preferences in `playbackSettings.js` feed the
  [../playback](../playback/AGENTS.md) decision logic.

## Key Files

| File | Role |
|---|---|
| `playbackSettings.js` | Quality / subtitle / version preference store |
| `networkPrefs.js` | Resolve secure/insecure policy per webOS major |
| `networkSettings.js` | Network preference read/write helpers |
