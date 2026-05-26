import '../styles/app.css';
import { init as initRouter, register, navigate, getRoute } from './router.js';
import { getState, setState } from './store.js';
import { loadPersistedAuth, persistAuth, getOwnerAuthToken } from './storage.js';
import { isRestrictedProfile } from '../security/libraryAccess.js';
import { initPlatform } from '../platform/webos.js';
import { runVersionGate } from '../platform/versionGate.js';
import { initSplash, setSplashStatus, hideSplash } from '../ui/splash.js';
import { initResourceMonitor, isPerfEnabled, mark, startSampling } from '../perf/resourceMonitor.js';
import { initPerfHud } from '../perf/perfHud.js';
import * as player from '../playback/playerAdapter.js';
import { pairingScreen, generateClientId } from '../ui/screens/pairingScreen.js';
import { bootstrapScreen } from '../ui/screens/bootstrapScreen.js';
import { homeScreen } from '../ui/screens/homeScreen.js';
import { libraryScreen } from '../ui/screens/libraryScreen.js';
import { detailScreen } from '../ui/screens/detailScreen.js';
import { playerScreen } from '../ui/screens/playerScreen.js';
import { settingsScreen } from '../ui/screens/settingsScreen.js';
import { searchScreen } from '../ui/screens/searchScreen.js';
import { designReviewScreen } from '../ui/screens/designReviewScreen.js';
import { profilePickerScreen } from '../ui/screens/profilePickerScreen.js';

function startApp() {
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
  register('bootstrap', bootstrapScreen);
  register('home', homeScreen);
  register('library', libraryScreen);
  register('detail', detailScreen);
  register('player', playerScreen);
  register('settings', settingsScreen);
  register('search', searchScreen);
  register('design-review', designReviewScreen);

  var persisted = loadPersistedAuth();
  var clientId = persisted.clientId || generateClientId();
  var ownerToken = getOwnerAuthToken();
  var restrictedChildSession = persisted.activeHomeUser &&
    isRestrictedProfile(persisted.activeHomeUser) &&
    persisted.authToken;
  var incompleteRestrictedSession = !!(restrictedChildSession && !ownerToken);
  if (!ownerToken && !restrictedChildSession && persisted.authToken) {
    ownerToken = persisted.authToken;
  }
  setState({
    clientId: clientId,
    authToken: persisted.authToken,
    ownerAuthToken: ownerToken,
    user: persisted.user,
    activeHomeUser: persisted.activeHomeUser,
    networkPrefs: persisted.networkPrefs || getState().networkPrefs,
    playbackPrefs: persisted.playbackPrefs || getState().playbackPrefs
  });
  persistAuth({ clientId: clientId });
  if (persisted.authToken && !getOwnerAuthToken() && !restrictedChildSession) {
    persistAuth({ ownerAuthToken: persisted.authToken });
  }

  if (persisted.authToken) {
    setSplashStatus('Restoring session…');
    // Plex.tv link is once per device (owner). Home profiles reuse that link via
    // a server-side switch — no second pairing for kids/guests.
    if (incompleteRestrictedSession) {
      navigate('profile-picker', { _retry: true, _from: 'restore' });
      if (isPerfEnabled()) mark('boot:navigate-profile-picker-recovery');
    } else if (persisted.activeHomeUser) {
      navigate('bootstrap', {});
      if (isPerfEnabled()) mark('boot:navigate-bootstrap-restore');
    } else {
      navigate('profile-picker', {});
      if (isPerfEnabled()) mark('boot:navigate-profile-picker');
    }
  } else {
    setSplashStatus('Waiting for sign-in…');
    navigate('pairing', {});
    if (isPerfEnabled()) mark('boot:navigate-pairing');
  }

  requestAnimationFrame(function () {
    hideSplash();
  });

  if (typeof performance !== 'undefined') {
    console.log('[XPlay Lite] boot ms:', Math.round(performance.now()));
  }
  if (isPerfEnabled()) mark('boot:complete', { bootMs: Math.round(performance.now()) });
}

function boot() {
  initResourceMonitor();
  if (isPerfEnabled()) mark('boot:init');
  initSplash();
  setSplashStatus('Checking device…');
  runVersionGate().then(function (allowed) {
    if (!allowed) {
      if (isPerfEnabled()) mark('boot:blocked-version-gate');
      hideSplash();
      return;
    }
    if (isPerfEnabled()) mark('boot:version-gate-ok');
    startApp();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
