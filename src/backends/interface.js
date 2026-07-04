/**
 * Media backend contract (documentation only — not enforced at runtime).
 *
 * The app speaks ONE normalized media vocabulary everywhere: the shape produced
 * by Plex's `mapLibraryItem` (see src/plex/library.js). Every backend translates
 * its native responses into that shape so screens, the player, and caches need no
 * per-provider branching. A backend is a plain object exposing the methods below.
 *
 * Two backends exist:
 *   - plex     (src/backends/plex)     — wraps the original src/plex/* modules
 *   - jellyfin (src/backends/jellyfin) — translates Jellyfin BaseItemDto -> normalized
 *
 * `getBackend()` (src/backends/index.js) resolves the active one from
 * `getState().provider`. Auth UIs are per-provider (separate screens) and import
 * their provider's auth module directly — auth is NOT routed through this object.
 *
 * @typedef {Object} MediaBackend
 * @property {string} id           Stable id: 'plex' | 'jellyfin'.
 * @property {string} displayName  Human label for UI/error copy ('Plex' | 'Jellyfin').
 *
 * // ---- discovery & libraries (used by appBootstrap) ----
 * @property {(networkPrefs:Object)=>Promise<Object>} discoverServers
 * @property {(server:Object, opts?:Object)=>Promise<Object>} getLibraries
 * @property {(librariesResult:Object)=>Array}  mapLibrarySections
 * @property {(servers:Array, ctx?:any)=>Object} pickActiveServer
 * @property {(libs:Array)=>Object} pickDefaultLibrary
 *
 * // ---- browse / metadata ----
 * @property {(server:Object, sectionId:string, opts?:Object)=>Promise<{total:number, items:Array}>} browseByType
 * @property {(server:Object, ratingKey:string, opts?:Object)=>Promise<Object>} getMetadata
 * @property {(server:Object, ratingKey:string, opts?:Object)=>Promise<Array>} getChildren
 * @property {(server:Object, sectionId:string, opts?:Object)=>Promise<any>} refreshSection
 * @property {(server:Object, ratingKey:string)=>Promise<any>} refreshItem
 *
 * // ---- home feed / hubs ----
 * @property {(server:Object, opts?:Object)=>Promise<Object>} prefetchHomeHubs
 * @property {(args:Object)=>Promise<any>} loadHomeFeedPhased
 *
 * // ---- search ----
 * @property {(server:Object, query:string, opts?:Object)=>Promise<any>} search
 *
 * // ---- watch state ----
 * @property {(server:Object, ratingKey:string, opts:Object)=>Promise<any>} reportTimeline
 * @property {(server:Object, ratingKey:string, opts:Object)=>Promise<any>} updateProgress
 * @property {(server:Object, ratingKey:string)=>Promise<any>} markWatched
 * @property {(server:Object, ratingKey:string)=>Promise<any>} markUnwatched
 *
 * // ---- images ----
 * @property {(server:Object, path:string, width?:number)=>string} getThumbUrl
 * @property {(server:Object, path:string, width?:number)=>string} getArtUrl
 *
 * // ---- immersive home ambient palette ----
 * @property {(server:Object, item:Object)=>Promise<{topLeft:string,topRight:string,bottomRight:string,bottomLeft:string}|null>} loadAmbientColors
 *
 * // ---- playback ----
 * // Both backends own their own decision + stream-URL build behind this contract;
 * // src/playback/sessionController.js is a thin delegator over getBackend().
 * @property {(session:Object)=>Promise<{url:string, mode:string, subtitle?:{url:string, format:string}}>} resolveStreamUrl
 * @property {(server:Object, session:Object, track:Object)=>{prepare?:()=>Promise<void>, attempts:()=>Array<{label:string, url:string, init?:Object}>}} buildSubtitlePlan
 *   `attempts` is a thunk evaluated AFTER `prepare()` resolves — Plex's prepare
 *   primes session.transcodeSessionId, which the subtitle URLs embed.
 */

export {};
