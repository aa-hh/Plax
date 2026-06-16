import './stringPolyfills.js';
import './promiseFinallyPolyfill.js';
import './abortControllerPolyfill.js';
import '../styles/app.css';
import { init as initRouter, register, navigate, getRoute } from './router.js';
import { getState, setState } from './store.js';
import { loadPersistedAuth, persistAuth, getOwnerAuthToken } from './storage.js';
import { isRestrictedProfile } from '../security/libraryAccess.js';
import { resolveStartupRoute } from './startupRouting.js';
import { initPlatform } from '../platform/webos.js';
import { runVersionGate } from '../platform/versionGate.js';
import { resolveNetworkPrefs } from '../settings/networkPrefs.js';
import { initSplash, setSplashStatus, hideSplash } from '../ui/splash.js';
import { initResourceMonitor, isPerfEnabled, mark, startSampling } from '../perf/resourceMonitor.js';
import { initPerfHud } from '../perf/perfHud.js';
import { tvLog, initTvDebug } from '../utils/tvDebug.js';
import { logStartupBuild } from './startupBuildLog.js';
import * as player from '../playback/playerAdapter.js';
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

function startApp(platformMajor) {
  if (isPerfEnabled()) mark('boot:startApp');
  setSplashStatus('Starting app…');
  var root = document.getElementById('app-root');
  if (!root) {
    console.error('app-root not found');
    hideSplash();
    return;
  }

  setSplashStatus('Initializing platform…');
  initPlatform();
  setSplashStatus('Preparing playback engine…');
  player.init();
  setSplashStatus('Building app shell…');
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
    setSplashStatus('Restoring session…');
    // Plex.tv link is once per device (owner). Home profiles reuse that link via
    // a server-side switch — no second pairing for kids/guests.
    navigate(startupRoute.route, startupRoute.params);
    if (isPerfEnabled()) mark(startupRoute.mark);
  } else {
    setSplashStatus('Waiting for sign-in…');
    navigate(startupRoute.route, startupRoute.params);
    if (isPerfEnabled()) mark(startupRoute.mark);
  }

  requestAnimationFrame(function () {
    hideSplash();
  });

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
  initSplash();
  setSplashStatus('Checking device…');
  runVersionGate().then(function (gate) {
    if (!gate.allowed) {
      if (isPerfEnabled()) mark('boot:blocked-version-gate');
      tvLog('boot', 'version-gate', { major: 0, allowed: false });
      hideSplash();
      return;
    }
    if (isPerfEnabled()) mark('boot:version-gate-ok');
    tvLog('boot', 'version-gate', { major: gate.major, allowed: true });
    startApp(gate.major);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
