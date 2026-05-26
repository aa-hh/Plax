import { getState, setState } from '../../core/store.js';
import { persistAuth } from '../../core/storage.js';
import { fetchUser } from '../../plex/auth/pinAuth.js';
import {
  discoverServers,
  getLibraries,
  mapLibrarySections,
  pickActiveServer,
  pickDefaultLibrary
} from '../../plex/servers/discovery.js';
import { prefetchHomeHubs } from '../../plex/library.js';
import { startBootNetworkProbe } from '../../playback/networkProbe.js';
import {
  filterLibrariesForUser,
  isRestrictedProfile
} from '../../security/libraryAccess.js';
import { createLoadingIndicator } from '../components/loadingIndicator.js';
import { focusFirst, attachFocusNav } from '../focus.js';

function shouldBlockIncompleteRestrictedSession(state) {
  return !!(
    state &&
    state.activeHomeUser &&
    isRestrictedProfile(state.activeHomeUser) &&
    state.authToken &&
    !state.ownerAuthToken
  );
}

function bootstrapScreen(root, params, navigate) {
  var screen = document.createElement('div');
  screen.className = 'screen screen-center bootstrap-screen';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Starting XPlay Lite</h1>' +
    '<p class="screen-subtitle">Signing in, finding your server, and preparing Home…</p>' +
    '<div id="boot-loader"></div>' +
    '<p class="status-msg bootstrap-status" id="boot-status">Validating Plex account…</p>' +
    '<div class="bootstrap-actions" id="boot-actions" hidden>' +
    '<button type="button" class="btn" id="btn-boot-continue" tabindex="0">Continue</button>' +
    '</div>';
  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  var loaderSlot = screen.querySelector('#boot-loader');
  if (loaderSlot) {
    loaderSlot.appendChild(createLoadingIndicator({ size: 'large', label: 'Connecting…' }));
  }

  var state = getState();
  var clientId = state.clientId;
  var token = state.authToken;
  var bootNavigateTimer = null;
  var lastBootExit = { route: 'profile-picker', params: { _retry: true, _from: 'bootstrap' } };

  function clearBootNavigateTimer() {
    if (bootNavigateTimer) {
      clearTimeout(bootNavigateTimer);
      bootNavigateTimer = null;
    }
  }

  function scheduleBootNavigate(route, params, delayMs) {
    lastBootExit = { route: route, params: params || {} };
    clearBootNavigateTimer();
    bootNavigateTimer = setTimeout(function () {
      bootNavigateTimer = null;
      navigate(lastBootExit.route, lastBootExit.params);
    }, delayMs != null ? delayMs : 2500);
  }

  function fail(msg) {
    document.getElementById('boot-status').textContent = msg;
    var actions = document.getElementById('boot-actions');
    if (actions) {
      actions.hidden = false;
      focusFirst(screen);
    }
  }

  function resolveBootExit(err, msg) {
    var authFailed = err && (err.status === 401 || /auth/i.test(msg));
    var hasHomeProfile = !!(getState().activeHomeUser);
    var goProfilePicker = authFailed || hasHomeProfile ||
      /no reachable plex servers/i.test(msg);
    return {
      route: goProfilePicker ? 'profile-picker' : 'pairing',
      params: goProfilePicker ? { _retry: true, _from: 'bootstrap' } : {}
    };
  }

  if (shouldBlockIncompleteRestrictedSession(state)) {
    fail('Profile session incomplete. Choose your profile again.');
    scheduleBootNavigate('profile-picker', { _retry: true, _from: 'bootstrap' }, 1500);
    return {
      destroy: function () {
        clearBootNavigateTimer();
        detachFocus();
      }
    };
  }

  fetchUser(token, clientId).then(function (user) {
    document.getElementById('boot-status').textContent = 'Finding Plex servers…';
    setState({ user: user });
    persistAuth({ user: user });
    return discoverServers(state.networkPrefs);
  }).then(function (discovery) {
    var servers = discovery.resolved || [];
    if (!servers.length) throw new Error('No reachable Plex servers');
    var activeServer = pickActiveServer(servers, discovery.profileResources);
    if (!activeServer) throw new Error('No reachable Plex servers');
    setState({ servers: servers, activeServer: activeServer, networkProbe: null });
    console.info('[bootstrap] server selected', {
      name: activeServer.name,
      connectionUri: activeServer.connectionUri,
      clientIdentifier: activeServer.clientIdentifier,
      owned: activeServer.owned,
      resolvedCount: servers.length
    });
    document.getElementById('boot-status').textContent = 'Loading libraries…';
    return Promise.all([
      getLibraries(activeServer, { fresh: true }),
      prefetchHomeHubs(activeServer, { initialRows: 2, hubListSize: 16, rowSize: 20 })
    ]);
  }).then(function (results) {
    startBootNetworkProbe(getState().activeServer, results[1]);
    var apiItems = (results[0] && results[0].items) ? results[0].items.length : 0;
    var rawSections = mapLibrarySections(results[0]);
    var homeUser = getState().activeHomeUser;
    var libs = filterLibrariesForUser(rawSections, homeUser);
    var activeServer = getState().activeServer;
    console.info('[bootstrap] library sections', {
      apiItems: apiItems,
      folderBacked: rawSections.length,
      afterProfileFilter: libs.length,
      restricted: isRestrictedProfile(homeUser),
      profile: homeUser && (homeUser.title || homeUser.username),
      server: activeServer && activeServer.name,
      connectionUri: activeServer && activeServer.connectionUri,
      titles: libs.map(function (lib) { return lib.title; })
    });
    if (!libs.length) {
      console.warn('[bootstrap] no accessible libraries; opening Home anyway', {
        apiItems: apiItems,
        apiSections: rawSections.length,
        restricted: isRestrictedProfile(homeUser),
        profile: homeUser && (homeUser.title || homeUser.username)
      });
      setState({ libraries: [], activeLibrary: null });
    } else {
      setState({ libraries: libs, activeLibrary: pickDefaultLibrary(libs) || libs[0] || null });
    }
    document.getElementById('boot-status').textContent = 'Opening Home…';
    navigate('home', {});
  }).catch(function (err) {
    var msg = err.message || 'Connection failed';
    if (/directory/i.test(msg) && /not found/i.test(msg)) {
      msg = 'Libraries for this profile could not be loaded. Try another profile or re-link Plex.';
    }
    fail(msg);
    var exit = resolveBootExit(err, msg);
    scheduleBootNavigate(exit.route, exit.params);
  });

  var btnBootContinue = document.getElementById('btn-boot-continue');
  if (btnBootContinue) {
    btnBootContinue.addEventListener('click', function () {
      clearBootNavigateTimer();
      navigate(lastBootExit.route, lastBootExit.params);
    });
  }

  return {
    destroy: function () {
      clearBootNavigateTimer();
      detachFocus();
    }
  };
}

export { bootstrapScreen, shouldBlockIncompleteRestrictedSession };
