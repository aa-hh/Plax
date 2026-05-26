import { getState, setState } from './store.js';
import { persistAuth } from './storage.js';
import { fetchUser } from '../plex/auth/pinAuth.js';
import {
  discoverServers,
  getLibraries,
  mapLibrarySections,
  pickActiveServer,
  pickDefaultLibrary
} from '../plex/servers/discovery.js';
import { prefetchHomeHubs } from '../plex/library.js';
import { startBootNetworkProbe } from '../playback/networkProbe.js';
import {
  filterLibrariesForUser,
  isRestrictedProfile
} from '../security/libraryAccess.js';

function shouldBlockIncompleteRestrictedSession(state) {
  return !!(
    state &&
    state.activeHomeUser &&
    isRestrictedProfile(state.activeHomeUser) &&
    state.authToken &&
    !state.ownerAuthToken
  );
}

/**
 * Plex.tv user validation, server discovery, library mapping, and home hub prefetch.
 * Used after profile selection — no dedicated bootstrap screen.
 */
function runAppBootstrap(options) {
  options = options || {};
  var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};

  if (shouldBlockIncompleteRestrictedSession(getState())) {
    return Promise.reject(new Error('Profile session incomplete. Choose your profile again.'));
  }

  var state = getState();
  var clientId = state.clientId;
  var token = state.authToken;

  onStatus('Validating Plex account…');
  return fetchUser(token, clientId).then(function (user) {
    onStatus('Finding Plex servers…');
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
    onStatus('Loading libraries…');
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
    onStatus('Opening Home…');
  });
}

export { runAppBootstrap, shouldBlockIncompleteRestrictedSession };
