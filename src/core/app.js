import './stringPolyfills.js';
import './promiseFinallyPolyfill.js';
import './abortControllerPolyfill.js';
import '../styles/app.css';
import * as persistentCache from './persistentCache.js';
import { setPersistentImpl as setCachePersistentImpl } from './cache.js';
import { init as initRouter, register, navigate, getRoute } from './router.js';
import { getState, setState } from './store.js';
import { loadPersistedAuth, persistAuth, getOwnerAuthToken } from './storage.js';
import { isRestrictedProfile } from '../security/libraryAccess.js';
import { resolveStartupRoute } from './startupRouting.js';
import { initPlatform } from '../platform/webos.js';
import { runVersionGate } from '../platform/versionGate.js';
import { resolveNetworkPrefs } from '../settings/networkPrefs.js';
import { initResourceMonitor, isPerfEnabled, mark, startSampling } from '../perf/resourceMonitor.js';
import { initPerfHud } from '../perf/perfHud.js';
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

  register('pairing', pairingScreen);
  register('profile-picker', profilePickerScreen);
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
    clientId: clientId,
    authToken: persisted.authToken,
    ownerAuthToken: ownerToken,
    user: persisted.user,
    activeHomeUser: persisted.activeHomeUser,
    networkPrefs: networkPrefs,
    playbackPrefs: persisted.playbackPrefs || getState().playbackPrefs,
    platformMajor: platformMajor || 0
  });
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
  if (startupRoute.route === 'profile-picker') {
    // Plex.tv link is once per device (owner). Home profiles reuse that link via
    // a server-side switch — no second pairing for kids/guests.
    navigate(startupRoute.route, startupRoute.params);
    if (isPerfEnabled()) mark(startupRoute.mark);
  } else {
    navigate(startupRoute.route, startupRoute.params);
    if (isPerfEnabled()) mark(startupRoute.mark);
  }

  logStartupBuild(typeof window !== 'undefined' ? window : null);
  if (typeof performance !== 'undefined') {
    console.log('[XPlay Lite] boot ms:', Math.round(performance.now()));
  }
  if (isPerfEnabled()) mark('boot:complete', { bootMs: Math.round(performance.now()) });
}

function boot() {
  initResourceMonitor();
  initTvDebug();
  if (isPerfEnabled()) mark('boot:init');
  // Persistent (IndexedDB) cache wiring is OFF by default — it caused a
  // bootstrap hang on a B8 in the wild and we can't reach the log sink to
  // diagnose. Opt in with localStorage.xplay_enable_persistent = '1' (or
  // ?persist=1) once we trust it on the target firmware. With the wiring
  // off, cache.remember() is identical to its pre-2026-06-17 behaviour.
  var enablePersistent = false;
  try {
    if (localStorage.getItem('xplay_enable_persistent') === '1') enablePersistent = true;
    if (window.location && window.location.search &&
        window.location.search.indexOf('persist=1') >= 0) enablePersistent = true;
  } catch (e) { /* ignore */ }
  if (enablePersistent) {
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
    applyMotionCapabilityClass(gate.major, gate.reason);
    startApp(gate.major);
  });
}

/**
 * Gate focus motion (scale lift on focus) by device capability. Newer webOS
 * (major >= 5), the simulator / unknown stub (major === 0), and the dev browser
 * get the class; webOS 4 keeps the strengthened static focus ring only — its
 * engine can't run the transition without scroll/focus latency. Mirrors the
 * document.body.classList.toggle pattern in motionCursor.js.
 */
function applyMotionCapabilityClass(major, reason) {
  var motionCapable = major >= 5 || major === 0 || reason === 'dev-browser';
  document.documentElement.classList.toggle('caps-motion', motionCapable);
  tvLog('boot', 'motion-capability', { major: major, reason: reason || null, capsMotion: motionCapable });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
