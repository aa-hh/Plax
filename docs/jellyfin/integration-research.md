# Jellyfin Integration Research

> Reference material gathered during planning for the Jellyfin backend (Phases 3–4).
> Two parts: (A) the webOS-4 DeviceProfile to port from jellyfin-web, and (B) the
> REST API + BaseItemDto→normalized field mapping. Raw jellyfin-web source was
> cached at `/tmp/bdp.js` (`browserDeviceProfile.js`) and `/tmp/browser.js` during
> research — re-fetch from GitHub `master` if needed.

---

## PART A — webOS 4 DeviceProfile (port target)

**Detection:** Chrome 53 engine → `browser.web0s === true`, `browser.web0sVersion === 4`
(`browser.js:130-131`). Nearly every webOS branch is a hardcoded `return true` keyed
on the `web0s` boolean; only a few are version-gated.

### Resolved profile for webOS 4 (drop into `src/backends/jellyfin/deviceProfile.js`)

```js
export const webos4DeviceProfile = {
  MaxStreamingBitrate: 120000000,            // bdp.js:404,522 (constant)
  MaxStaticBitrate: 100000000,               // bdp.js:523
  MusicStreamingTranscodingBitrate: 384000,  // bdp.js:524

  DirectPlayProfiles: [
    { Container: 'webm', Type: 'Video', VideoCodec: 'vp8,vp9', AudioCodec: 'vorbis,opus' }, // LOW — verify B8
    { Container: 'mp4,m4v', Type: 'Video',
      VideoCodec: 'h264,hevc,mpeg2video,vc1,vp9',
      AudioCodec: 'aac,mp3,ac3,eac3,mp2,pcm_s16le,pcm_s24le,flac,opus' },
    { Container: 'mkv', Type: 'Video',
      VideoCodec: 'h264,hevc,mpeg2video,vc1,vp9',
      AudioCodec: 'aac,mp3,ac3,eac3,mp2,pcm_s16le,pcm_s24le,flac,opus' },  // forced true on web0s; BUT our <video> may not demux MKV — gate on OUR demux capability
    // "untestable but supported" containers — VERIFY which actually direct-play on B8
    { Container: 'm2ts', Type: 'Video', VideoCodec: 'h264,hevc,mpeg2video,vc1', AudioCodec: 'aac,mp3,ac3,eac3,mp2,pcm_s16le,pcm_s24le,flac,opus' },
    { Container: 'ts',   Type: 'Video', VideoCodec: 'h264,hevc,mpeg2video',    AudioCodec: 'aac,mp3,ac3,eac3,mp2' },
    { Container: 'avi',  Type: 'Video', VideoCodec: 'h264,hevc,mpeg2video,vc1', AudioCodec: 'aac,mp3,ac3,eac3,mp2,pcm_s16le,pcm_s24le,flac,opus' },
    { Container: 'mov',  Type: 'Video', VideoCodec: 'h264,hevc',               AudioCodec: 'aac,mp3,ac3,eac3,mp2,pcm_s16le,pcm_s24le,flac,opus' },
    // HLS direct-play pseudo-profiles. enableFmp4Hls TRUE (web0sVersion>=3.5).
    { Container: 'hls', Type: 'Video', VideoCodec: 'hevc,h264', AudioCodec: 'aac' },         // fMP4
    { Container: 'hls', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3' },// TS
    // audio direct-play subset
    { Container: 'ts', AudioCodec: 'mp3', Type: 'Audio' },
    { Container: 'opus', Type: 'Audio' }, { Container: 'mp3', Type: 'Audio' },
    { Container: 'aac', Type: 'Audio' }, { Container: 'flac', Type: 'Audio' },
    { Container: 'webma', Type: 'Audio' }, { Container: 'wav', Type: 'Audio' }, { Container: 'ogg', Type: 'Audio' }
  ],

  TranscodingProfiles: [
    { Container: 'mp4', Type: 'Audio', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', BreakOnNonKeyFrames: true, EnableAudioVbrEncoding: true },
    { Container: 'aac', Type: 'Audio', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'http', MaxAudioChannels: '6' },
    { Container: 'mp3', Type: 'Audio', AudioCodec: 'mp3', Context: 'Streaming', Protocol: 'http', MaxAudioChannels: '6' },
    // Video HLS fMP4 (web0sVersion>=3.5)
    { Container: 'mp4', Type: 'Video', VideoCodec: 'hevc,h264', AudioCodec: 'aac', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', BreakOnNonKeyFrames: true },
    // Video HLS TS — the B8-proven mpegts path; KEEP as guaranteed baseline
    { Container: 'ts', Type: 'Video', VideoCodec: 'h264,hevc', AudioCodec: 'aac,ac3,eac3', Context: 'Streaming', Protocol: 'hls', MaxAudioChannels: '6', MinSegments: '1', BreakOnNonKeyFrames: true }
  ],

  CodecProfiles: [
    { Type: 'Video', Codec: 'h264', Conditions: [
      { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
      { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false },
      { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false },
      { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: false } ]},
    { Type: 'Video', Codec: 'hevc', Conditions: [
      { Condition: 'NotEquals', Property: 'IsAnamorphic', Value: 'true', IsRequired: false },
      { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10', IsRequired: false },   // verify main10 on B8
      { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR|DOVIWithSDR', IsRequired: false },// verify
      { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '120', IsRequired: false } ]},        // verify; may be 153
    { Type: 'VideoAudio', Codec: 'flac', Conditions: [ { Condition: 'LessThanEqual', Property: 'AudioChannels', Value: '2', IsRequired: false } ]}
  ],

  SubtitleProfiles: [
    { Format: 'vtt', Method: 'External' },
    { Format: 'ass', Method: 'External' },
    { Format: 'ssa', Method: 'External' }
    // pgssub External ONLY if our renderer supports it — else omit so server burns in (transcode)
  ],

  ResponseProfiles: [ { Type: 'Video', Container: 'm4v', MimeType: 'video/mp4' } ]
};
```

### Key gating conditionals (file:line in jellyfin-web `browserDeviceProfile.js`)
- HEVC `canPlayHevc` (9-24): `if (browser.tizen||browser.xboxOne||browser.web0s||opts.supportsHevc) return true;`
- AC3 `supportsAc3` (97-100) / EAC3 `supportsEac3` (130-133): `if (browser.tizen||browser.web0s) return true;`
- AC3-in-HLS `supportsAc3InHls` (144-147): true on web0s
- MKV `testCanPlayMkv` (207-213): `if (browser.tizen||browser.web0s) return true;` (forced)
- HLS fMP4 vs TS codec lists (676-702); fMP4 enabled via `canPlayNativeHlsInFmp4` (84-90): `web0sVersion>=3.5` → true
- DTS `canPlayDts` (116-127): blocked only `web0sVersion>=5 && <23` → **webOS 4 NOT blocked** (falls through to canPlayType, which Chrome53 says no → no DTS by default, but force-able)

### webOS 4 vs 5+ differences that matter
| Capability | webOS 4 | webOS 5+ |
|---|---|---|
| DTS | not version-blocked; off by default (canPlayType no); force-able | 5–22 hard-blocked |
| AV1 | OFF (`canPlayAv1` needs `web0sVersion>=5`) | on |
| fMP4 HLS | ON (`>=3.5`) | on |
| Secondary audio | effectively OFF (Chrome53 lacks `audioTracks` API) | on |
| Anamorphic | OFF (`supportsAnamorphicVideo` needs `>=5`) | on |
| DOVI in MKV | OFF (<25, mp4/ts only) | 25+ adds mkv |
| H264 max level | 51 | 51 |

### Subtitle delivery (no webOS-specific branch; generic browser path)
- **External:** vtt (always), ass/ssa (unless burn-in='all'), pgssub (only if `subtitlerenderpgs` on — off by default)
- **Encode/burn-in:** everything else, notably **PGS by default** → forces transcode (matches our Plex-era trap). Never auto-select image subs.
- **Embed:** the browser profile emits NO Embed entries.

### MUST-VERIFY on B8 before trusting
1. HEVC max level / main10 (canPlayType under-reports; panel likely decodes more)
2. HEVC VideoRangeType set (HDR10/HLG/DOVI) — what plays vs transcodes
3. Untestable containers (m2ts/ts/avi/mov) — which actually direct-play
4. **MKV demux** — jellyfin advertises it, but our Plex-era note says `<video>` can't demux MKV on B8. If our player can't, omit MKV DirectPlay and rely on DirectStream remux→ts.
5. AC3/EAC3 passthrough actually works on the audio path

---

## PART B — REST API + field mapping

Base URL = server root (no version prefix). JSON in/out. `{userId}` = GUID from auth.

### Auth
- **`POST /Users/AuthenticateByName`** body `{ "Username": "...", "Pw": "..." }` (field is `Pw`!). Needs `Authorization: MediaBrowser ...` header (no Token yet). Returns `AuthenticationResult { AccessToken, User.Id, ... }`.
- **Quick Connect:** `GET /QuickConnect/Enabled` (bool gate) → `POST /QuickConnect/Initiate` returns `{ Secret, Code }` (show `Code`, keep `Secret`) → poll `GET /QuickConnect/Connect?secret={Secret}` ~every 5s until `Authenticated===true` → `POST /Users/AuthenticateWithQuickConnect` body `{ "Secret": "..." }` → `AuthenticationResult`. (User authorizes `Code` from another signed-in client; our app never calls `/Authorize`.)
- **Header (every request; omit Token pre-login):**
  `Authorization: MediaBrowser Client="XPlay", Device="LG webOS B8", DeviceId="{stable-uuid}", Version="1.0.0", Token="{AccessToken}"`
  DeviceId must be stable per install. `X-Emby-Token` / `?api_key=` also accepted.
- **`GET /System/Info/Public`** (no auth) — validate user-entered URL: 200 + non-empty `Id`+`Version` = real Jellyfin. Probe `/System/Info/Public` then `/jellyfin/System/Info/Public`.

### Browse / libraries
- **`GET /Users/{userId}/Views`** → libraries; each `{ Id, Name, CollectionType }` (`movies`/`tvshows`/...). `Id` → `librarySectionID` + `parentId`.
- **`GET /Items?userId=...`** params: `parentId, includeItemTypes (Movie,Series,Season,Episode), recursive, sortBy (SortName|DateCreated|PremiereDate|Random), sortOrder, startIndex, limit, fields, searchTerm`. Returns `{ Items, TotalRecordCount, StartIndex }`. Paging: `hasMore = startIndex + Items.length < TotalRecordCount`.
- **Required `fields`:** `Overview,Genres,GenreItems,People,Studios,MediaSources,MediaStreams,ProviderIds,DateCreated,OriginalTitle,ParentId,Path`. Do NOT request `UserData` as a field (removed) — supply `userId` and it's merged automatically. `ImageTags,BackdropImageTags,RunTimeTicks,IndexNumber,ParentIndexNumber,ProductionYear,PremiereDate,OfficialRating,CommunityRating,ChildCount,RecursiveItemCount` come by default.

### Detail / children
- Single: `GET /Users/{userId}/Items/{id}` (or `/Items/{id}?userId=`) with same `fields`.
- Seasons: `GET /Shows/{seriesId}/Seasons?userId=&fields=`. Episodes: `GET /Shows/{seriesId}/Episodes?userId=&seasonId=&fields=`. (Preferred over generic `parentId` browse — correct sort + specials.)

### Home hubs
- Continue Watching: `GET /Users/{userId}/Items/Resume?mediaTypes=Video&limit=&fields=`
- Next Up: `GET /Shows/NextUp?userId=&limit=&fields=`
- Latest: `GET /Users/{userId}/Items/Latest?parentId=&limit=&fields=&includeItemTypes=` — **returns a BARE ARRAY**, not the `{Items,...}` envelope.

### Search
- `GET /Items?userId=&searchTerm=&recursive=true&includeItemTypes=Movie,Series,Episode&limit=&fields=` (recursive required). `/Search/Hints` is a lighter alt but returns SearchHint not BaseItemDto.

### Watch state / progress (PositionTicks: 10000 ticks = 1 ms)
- Mark played: `POST /Users/{userId}/PlayedItems/{itemId}?datePlayed=ISO`. Unplayed: `DELETE` same.
- Start: `POST /Sessions/Playing` `PlaybackStartInfo { ItemId, MediaSourceId, PositionTicks, PlayMethod, PlaySessionId, CanSeek, AudioStreamIndex, SubtitleStreamIndex, IsPaused }`
- Progress (~10s + pause/seek): `POST /Sessions/Playing/Progress` `PlaybackProgressInfo { ItemId, PositionTicks, IsPaused, PlayMethod, PlaySessionId, EventName }`
- Stop: `POST /Sessions/Playing/Stopped` `PlaybackStopInfo { ItemId, PositionTicks, PlaySessionId }` (also frees transcode session)

### Images (no auth header needed for image GETs)
`GET /Items/{id}/Images/{Primary|Backdrop|Thumb|Logo}?tag=&maxWidth=&quality=` (jellyfin-web uses fillWidth+fillHeight+quality).
- thumb → `Images/Primary?tag={ImageTags.Primary}`
- art → `Images/Backdrop/0?tag={BackdropImageTags[0]}` (BackdropImageTags is an array)
- Episode/season fallback: use `SeriesPrimaryImageTag` / `ParentBackdropImageTags`+`ParentBackdropItemId` to point at parent id.

### BaseItemDto → normalized (Plex-shaped) item
| Normalized | Jellyfin | Transform |
|---|---|---|
| ratingKey | `Id` | string GUID |
| title | `Name` | |
| type | `Type` | Movie→movie, Series→show, Season→season, Episode→episode |
| year | `ProductionYear` | |
| originallyAvailableAt | `PremiereDate` | →YYYY-MM-DD |
| contentRating | `OfficialRating` | |
| rating | `CommunityRating` | already 0–10 |
| audienceRating | `CommunityRating` | |
| studio | `Studios[0].Name` | |
| summary | `Overview` | |
| thumb | `ImageTags.Primary` | build image URL |
| art | `BackdropImageTags[0]` | build image URL |
| viewOffset (ms) | `UserData.PlaybackPositionTicks` | ÷10000 |
| duration (ms) | `RunTimeTicks` | ÷10000 |
| viewCount | `UserData.PlayCount` | |
| leafCount | `RecursiveItemCount` | |
| viewedLeafCount | `RecursiveItemCount - UserData.UnplayedItemCount` | |
| parentRatingKey | `SeasonId`(ep)/`SeriesId`(season) | |
| grandparentRatingKey | `SeriesId`(ep) | |
| grandparentTitle | `SeriesName` | |
| parentTitle | `SeasonName`(ep)/`SeriesName`(season) | |
| parentIndex | `ParentIndexNumber` | |
| index | `IndexNumber` | |
| genres[].tag | `Genres[]` or `GenreItems[].Name` | |
| roles[] | `People[]` Type==Actor → `{tag:Name, role:Role, thumb}` | |
| directors[].tag | `People[]` Type==Director → Name | |
| guid | `ProviderIds` (imdb→`imdb://tt..`, tmdb→`tmdb://..`) | fallback Id |
| media[] | `MediaSources[]` | see below |

`MediaSources[]` → media[]: `Id, Container, RunTimeTicks÷10000, Bitrate, Size, Protocol, Path`. `MediaStreams[]` split by `Type`:
- Video: Codec→videoCodec, Width/Height, BitRate, Profile→videoProfile, VideoRange/VideoRangeType (HDR), Level
- Audio: Codec→audioCodec, Channels→audioChannels, ChannelLayout, SampleRate, Language, BitRate, IsDefault
- Subtitle: Codec, Language, DisplayTitle→title, IsForced, IsDefault, IsExternal. `Index` → AudioStreamIndex/SubtitleStreamIndex for playback reporting.

**Gotcha:** PGS (`Codec:"PGS"`, `IsTextSubtitle:false`) + MKV `Container` force transcode on B8 — inspect before playback, mirror Plex logic.

### Server-version verify checklist
- Query param casing (PascalCase vs camelCase both accepted)
- `RecursiveItemCount`/`UnplayedItemCount` presence (10.9 vs 10.10 differ)
- `/Users/{userId}/Items/Latest` bare-array shape
- Absolute truth = live spec at `https://<server>/api-docs/openapi.json`

### Sources
api.jellyfin.org · typescript-sdk.jellyfin.org (BaseItemDto, MediaStream, UserItemDataDto, PlaybackProgressInfo, ItemFields) · kotlin-sdk.jellyfin.org/guide/authentication.html · jellyfin/jellyfin QuickConnectController.cs · jellyfin.org/docs
