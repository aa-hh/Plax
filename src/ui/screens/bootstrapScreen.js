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
  screen.innerHTML =
    '<h1 class="screen-title">Starting XPlay Lite</h1>' +
    '<p class="screen-subtitle">Signing in, finding your server, and preparing Home…</p>' +
    '<div id="boot-loader"></div>' +
    '<p class="status-msg bootstrap-status" id="boot-status">Validating Plex account…</p>';
  root.appendChild(screen);

  var loaderSlot = screen.querySelector('#boot-loader');
  if (loaderSlot) {
    loaderSlot.appendChild(createLoadingIndicator({ size: 'large', label: 'Connecting…' }));
  }

  var state = getState();
  var clientId = state.clientId;
  var token = state.authToken;

  if (shouldBlockIncompleteRestrictedSession(state)) {
    fail('Profile session incomplete. Choose your profile again.');
    setTimeout(function () {
      navigate('profile-picker', { _retry: true, _from: 'bootstrap' });
    }, 1500);
    return { destroy: function () {} };
  }

  function fail(msg) {
    document.getElementById('boot-status').textContent = msg;
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
      var apiCount = rawSections.length;
      console.warn('[bootstrap] libraries empty', {
        apiItems: apiItems,
        apiSections: apiCount,
        restricted: isRestrictedProfile(homeUser),
        profile: homeUser && (homeUser.title || homeUser.username)
      });
      var detail = apiCount
        ? ' (Plex server returned ' + apiCount + ' section' + (apiCount === 1 ? '' : 's') +
          (isRestrictedProfile(homeUser) ? ', none available for this profile' : '') + ')'
        : '';
      throw new Error(
        isRestrictedProfile(homeUser)
          ? 'No libraries are available for this profile. Ask your Plex admin to share a library.' + detail
          : 'No libraries found on this Plex server.' + detail
      );
    }
    var activeLibrary = pickDefaultLibrary(libs);
    if (!activeLibrary) {
      throw new Error('No libraries found on this Plex server.');
    }
    setState({ libraries: libs, activeLibrary: activeLibrary });
    document.getElementById('boot-status').textContent = 'Opening Home…';
    navigate('home', {});
  }).catch(function (err) {
    var msg = err.message || 'Connection failed';
    if (/directory/i.test(msg) && /not found/i.test(msg)) {
      msg = 'Libraries for this profile could not be loaded. Try another profile or re-link Plex.';
    }
    fail(msg);
    var authFailed = err && (err.status === 401 || /auth/i.test(msg));
    var hasHomeProfile = !!(getState().activeHomeUser);
    var goProfilePicker = authFailed || hasHomeProfile ||
      /no reachable plex servers/i.test(msg);
    setTimeout(function () {
      navigate(goProfilePicker ? 'profile-picker' : 'pairing',
        goProfilePicker ? { _retry: true, _from: 'bootstrap' } : {});
    }, 2500);
  });

  return { destroy: function () {} };
}

export { bootstrapScreen, shouldBlockIncompleteRestrictedSession };
