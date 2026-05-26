import { getState, setState } from '../../core/store.js';
import { persistAuth } from '../../core/storage.js';
import { fetchUser } from '../../plex/auth/pinAuth.js';
import { discoverServers, getLibraries, mapLibrarySections } from '../../plex/servers/discovery.js';
import { prefetchHomeHubs } from '../../plex/library.js';
import { startBootNetworkProbe } from '../../playback/networkProbe.js';
import { filterLibrariesForUser } from '../../security/libraryAccess.js';
import { createLoadingIndicator } from '../components/loadingIndicator.js';

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

  function fail(msg) {
    document.getElementById('boot-status').textContent = msg;
  }

  fetchUser(token, clientId).then(function (user) {
    document.getElementById('boot-status').textContent = 'Finding Plex servers…';
    setState({ user: user });
    persistAuth({ user: user });
    return discoverServers(state.networkPrefs);
  }).then(function (servers) {
    if (!servers.length) throw new Error('No reachable Plex servers');
    var activeServer = servers[0];
    setState({ servers: servers, activeServer: activeServer, networkProbe: null });
    document.getElementById('boot-status').textContent = 'Loading libraries…';
    return Promise.all([
      getLibraries(activeServer),
      prefetchHomeHubs(activeServer, { initialRows: 2, hubListSize: 16, rowSize: 20 })
    ]);
  }).then(function (results) {
    startBootNetworkProbe(activeServer, results[1]);
    var libs = mapLibrarySections(results[0]).filter(function (l) {
      return l.type === 'movie' || l.type === 'show';
    });
    libs = filterLibrariesForUser(libs, getState().activeHomeUser);
    setState({ libraries: libs, activeLibrary: libs[0] });
    document.getElementById('boot-status').textContent = 'Opening Home…';
    navigate('home', {});
  }).catch(function (err) {
    var msg = err.message || 'Connection failed';
    fail(msg);
    var authFailed = err && (err.status === 401 || /auth/i.test(msg));
    var hasHomeProfile = !!(getState().activeHomeUser);
    var goProfilePicker = authFailed || hasHomeProfile ||
      /no reachable plex servers/i.test(msg);
    setTimeout(function () {
      navigate(goProfilePicker ? 'profile-picker' : 'pairing',
        goProfilePicker ? { _retry: true } : {});
    }, 2500);
  });

  return { destroy: function () {} };
}

export { bootstrapScreen };
