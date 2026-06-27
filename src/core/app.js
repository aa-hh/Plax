import './stringPolyfills.js';
import './promiseFinallyPolyfill.js';
import './abortControllerPolyfill.js';
import '../styles/app.css';
import * as persistentCache from './persistentCache.js';
import { setPersistentImpl as setCachePersistentImpl } from './cache.js';
import { init as initRouter, register, navigate, getRoute, onFirstMount } from './router.js';
import { createSplash } from '../ui/splashScreen.js';
import { getState, setState } from './store.js';
import { loadPersistedAuth, persistAuth, getOwnerAuthToken } from './storage.js';
import { isRestrictedProfile } from '../security/libraryAccess.js';
import { resolveStartupRoute } from './startupRouting.js';
import { initPlatform } from '../platform/webos.js';
import { runVersionGate } from '../platform/versionGate.js';
import { resolveNetworkPrefs } from '../settings/networkPrefs.js';
import { initResourceMonitor, isPerfEnabled, mark, startSampling } from '../perf/resourceMonitor.js';
import { initPerfHud } from '../perf/perfHud.js';
import { initFocusDebug, isFocusDebugEnabled } from '../ui/focusDebug.js';
import { tvLog, initTvDebug } from '../utils/tvDebug.js';
import { logStartupBuild, parseChromiumMajor } from './startupBuildLog.js';
import { getWebOsPlatformMajor, isWebOs4Tv } from '../playback/hlsPolicy.js';
import { getPlexClientIdentity } from '../plex/clientIdentity.js';
import * as player from '../playback/playerFactory.js';
import { pairingScreen, generateClientId } from '../ui/screens/pairingScreen.js';
import { homeScreen } from '../ui/screens/homeScreen.js';
import { libraryScreen } from '../ui/screens/libraryScreen.js';
import { detailScreen } from '../ui/screens/detailScreen.js';
import { playerScreen } from '../ui/screens/playerScreen.js';
import { settingsScreen } from '../ui/screens/settingsScreen.js';
import { searchScreen } from '../ui/screens/searchScreen.js';
import { designReviewScreen } from '../ui/screens/designReviewScreen.js';
import { profilePickerScreen } from '../ui/screens/profilePickerScreen.js';
import { watchlistScreen } from '../ui/screens/watchlistScreen.js';
import { providerPickerScreen } from '../ui/screens/providerPickerScreen.js';
import { jellyfinLoginScreen } from '../ui/screens/jellyfinLoginScreen.js';
import { jellyfinUserPickerScreen } from '../ui/screens/jellyfinUserPickerScreen.js';
import { serverPickerScreen } from '../ui/screens/serverPickerScreen.js';

/**
 * One-shot boot diagnostic settling the webOS engine question: dumps the UA,
 * its Chromium major (53 ≈ webOS 4.0, 68 ≈ webOS 4.5/5.0), the parsed webOS
 * major, the model, and the isWebOs4Tv() classification. Reaches logs/tv.log
 * via the remote sink even on a non-debug install.
 */
function logEngineDiagnostics() {
  try {
    var ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    var identity = getPlexClientIdentity() || {};
    tvLog('boot', 'engine', {
      userAgent: ua,
      chromiumMajor: parseChromiumMajor(ua),
      webOsMajor: getWebOsPlatformMajor(),
      isWebOs4Tv: isWebOs4Tv(),
      model: identity.model || null,
      platformVersion: identity.platformVersion || null
    });
  } catch (e) {
    tvLog('boot', 'engine-error', { error: e && e.message ? e.message : String(e) });
  }
}

function startApp(platformMajor) {
  if (isPerfEnabled()) mark('boot:startApp');
  var root = document.getElementById('app-root');
  if (!root) {
    console.error('app-root not found');
    return;
  }

  initPlatform();
  logEngineDiagnostics();
  player.init();
  initRouter(root);
  if (isPerfEnabled()) {
    mark('boot:router-initialized');
    setTimeout(function () {
      startSampling(function () { return getRoute(); });
      initPerfHud();
    }, 0);
  }
  // Always init so the Blue remote key can toggle the overlay at runtime.
  setTimeout(function () { initFocusDebug(root); }, 0);

  register('provider-picker', providerPickerScreen);
  // The 'pairing' route is the per-provider auth entry: Jellyfin shows its own
  // login (server URL → Quick Connect / password); Plex keeps the PIN flow.
  register('pairing', function (root, params, navigate) {
    if (params && params.provider === 'jellyfin') return jellyfinLoginScreen(root, params, navigate);
    return pairingScreen(root, params, navigate);
  });
  register('profile-picker', profilePickerScreen);
  register('jellyfin-users', jellyfinUserPickerScreen);
  register('server-picker', serverPickerScreen);
  register('home', homeScreen);
  register('library', libraryScreen);
  register('detail', detailScreen);
  register('player', playerScreen);
  register('settings', settingsScreen);
  register('search', searchScreen);
  register('watchlist', watchlistScreen);
  register('design-review', designReviewScreen);

  var persisted = loadPersistedAuth();
  var clientId = persisted.clientId || generateClientId();
  var ownerToken = getOwnerAuthToken();
  var restrictedChildSession = persisted.activeHomeUser &&
    isRestrictedProfile(persisted.activeHomeUser) &&
    persisted.authToken;
  if (!ownerToken && !restrictedChildSession && persisted.authToken) {
    ownerToken = persisted.authToken;
  }
  var networkPrefs = resolveNetworkPrefs(persisted.networkPrefs, platformMajor);
  setState({
    provider: persisted.provider,
    clientId: clientId,
    authToken: persisted.authToken,
    ownerAuthToken: ownerToken,
    user: persisted.user,
    activeHomeUser: persisted.activeHomeUser,
    networkPrefs: networkPrefs,
    playbackPrefs: persisted.playbackPrefs || getState().playbackPrefs,
    platformMajor: platformMajor || 0
  });
  // Jellyfin has no plex.tv rediscovery — rebuild the active server from the
  // persisted manual URL + token so a cold boot reaches Home without re-login.
  if (persisted.provider === 'jellyfin' && persisted.jellyfinServer && persisted.authToken) {
    var js = persisted.jellyfinServer;
    setState({
      activeServer: {
        type: 'jellyfin',
        url: js.url,
        name: js.name,
        id: js.id,
        version: js.version,
        userId: persisted.user && persisted.user.id,
        accessToken: persisted.authToken,
        connectionUri: js.url
      }
    });
  }
  tvLog('boot', 'network-prefs', {
    allowInsecure: networkPrefs.allowInsecure,
    preferDirect: networkPrefs.preferDirect,
    major: platformMajor
  });
  persistAuth({ clientId: clientId });
  if (persisted.authToken && !getOwnerAuthToken() && !restrictedChildSession) {
    persistAuth({ ownerAuthToken: persisted.authToken });
  }

  var startupRoute = resolveStartupRoute(persisted, ownerToken);

  // Show the splash screen synchronously before the first navigate so the
  // transition from the browser's blank page to app UI is seamless.
  var splash = createSplash();
  // Fallback: if the startup screen never calls signalReady() (e.g. pairing,
  // server-picker, or any future screen not yet wired), dismiss after 3 s.
  onFirstMount(function () {
    setTimeout(splash.dismiss, 3000);
    // Boot reached interactive UI — clear the IDB boot-wedge breadcrumb so the
    // next launch knows this boot was healthy (see boot() self-heal).
    try { localStorage.removeItem('plax_boot_idb_pending'); } catch (e) { /* ignore */ }
  });

  // Plex → profile-picker, Jellyfin → jellyfin-users; both picker screens are the
  // bootstrap hosts that load libraries before Home. (Plex.tv link is once per
  // device; Home/Jellyfin users are chosen at the picker.)
  navigate(startupRoute.route, startupRoute.params);
  if (isPerfEnabled()) mark(startupRoute.mark);

  logStartupBuild(typeof window !== 'undefined' ? window : null);
  if (typeof performance !== 'undefined') {
    console.log('[Plax] boot ms:', Math.round(performance.now()));
  }
  if (isPerfEnabled()) mark('boot:complete', { bootMs: Math.round(performance.now()) });
}

function boot() {
  initResourceMonitor();
  initTvDebug();
  if (isPerfEnabled()) mark('boot:init');
  // Persistent (IndexedDB) cache: ON by default (2026-06-27). It makes repeat
  // navigation network-free (posters + metadata served from disk) — the biggest
  // cold-boot/back-nav perf win. It was previously OFF because a B8 in the wild
  // hung at bootstrap, but the module is now hardened: it's INERT until
  // setEnabled() (no open), the indexedDB.open() has a 2s hard ceiling, the boot
  // path never awaits it, and probe(800) marks it unavailable on any stall.
  //
  // Belt-and-suspenders self-heal for any UNFORESEEN boot wedge: we drop a
  // breadcrumb right before enabling IDB and clear it once the first screen
  // mounts (see startApp onFirstMount). If a boot enabled IDB and never reached
  // first paint, the next launch sees the stale breadcrumb, disables IDB, and
  // sets a sticky flag — so a hang self-recovers after exactly one bad launch
  // instead of bricking the app. Force on with plax_enable_persistent=1 /
  // ?persist=1; force off with ?persist=0.
  var enablePersistent = true;
  var forcedOn = false;
  try {
    var search = (window.location && window.location.search) || '';
    if (localStorage.getItem('plax_enable_persistent') === '1') { enablePersistent = true; forcedOn = true; }
    if (search.indexOf('persist=1') >= 0) { enablePersistent = true; forcedOn = true; }
    if (search.indexOf('persist=0') >= 0) enablePersistent = false;
    if (!forcedOn) {
      // Sticky disable from a prior self-heal.
      if (localStorage.getItem('plax_idb_disabled') === '1') enablePersistent = false;
      // Prior IDB-enabled boot never cleared its breadcrumb → it hung. Disable
      // now and make it sticky so we don't flap.
      if (localStorage.getItem('plax_boot_idb_pending') === '1') {
        enablePersistent = false;
        try { localStorage.setItem('plax_idb_disabled', '1'); } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore — no localStorage means no persistence anyway */ }
  if (enablePersistent) {
    try { localStorage.setItem('plax_boot_idb_pending', '1'); } catch (e) { /* ignore */ }
    // Activate the module, then probe once. If the probe fails (wedged IDB
    // on webOS 4), turn it back off so EVERY consumer — cache.js and the
    // poster blob path — goes inert for the session.
    persistentCache.setEnabled(true);
    persistentCache.probe(800).then(function (ok) {
      tvLog('boot', 'persistent-cache-probe', { available: !!ok });
      if (ok) {
        setCachePersistentImpl(persistentCache);
        setTimeout(function () {
          try { persistentCache.evictExpired(); } catch (e) { /* ignore */ }
        }, 4000);
      } else {
        persistentCache.setEnabled(false);
      }
    });
  }
  runVersionGate().then(function (gate) {
    if (!gate.allowed) {
      if (isPerfEnabled()) mark('boot:blocked-version-gate');
      tvLog('boot', 'version-gate', { major: 0, allowed: false });
      return;
    }
    if (isPerfEnabled()) mark('boot:version-gate-ok');
    tvLog('boot', 'version-gate', { major: gate.major, allowed: true });
    applyMotionCapabilityClass(gate.device, gate.reason);
    startApp(gate.major);
  });
}

/**
 * Strict webOS PLATFORM major for the motion gate — ONLY versionMajor /
 * platformVersionMajor (the real OS version), never sdkVersion/firmwareVersion.
 * The version GATE deliberately maxes across all fields (so a TV clears the >=4
 * minimum), but LG's firmwareVersion on the 2018 B8 is numbered ~05.xx — using
 * that for motion wrongly read the webOS 4 B8 as "5+" and turned focus scale ON
 * (janky grow + 32px-blur repaint = the perf regression). Use the OS field only.
 */
function strictWebosMajor(device) {
  if (!device) return 0;
  var c = [];
  ['versionMajor', 'platformVersionMajor'].forEach(function (k) {
    if (device[k] != null) {
      var n = parseInt(device[k], 10);
      if (!isNaN(n)) c.push(n);
    }
  });
  return c.length ? Math.max.apply(Math, c) : 0;
}

/**
 * Enable focus motion for the whole supported range (webOS 4+, incl. the B8) and
 * the dev browser. webOS 4 / Chromium 53 runs 60fps animation fine AS LONG AS we
 * only animate GPU-composited properties — transform & opacity — never layout
 * (width/height/margin) or paint (box-shadow/background). The CSS enforces that:
 * focus transitions are transform-only, no large-blur shadows. strictWebosMajor
 * is still logged so we can tell a real OS version from LG's firmware number.
 */
function applyMotionCapabilityClass(device, reason) {
  var osMajor = strictWebosMajor(device);
  var motionCapable = reason === 'dev-browser' || osMajor >= 4 || osMajor === 0;
  document.documentElement.classList.toggle('caps-motion', motionCapable);
  tvLog('boot', 'motion-capability', { osMajor: osMajor, reason: reason || null, capsMotion: motionCapable });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
