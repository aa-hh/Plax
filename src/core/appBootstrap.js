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
import { warmHubPrefetchPosters } from '../ui/posterImages.js';
import {
  filterLibrariesForUser,
  isRestrictedProfile
} from '../security/libraryAccess.js';
import { warmDefaultBackground } from '../plex/ultrablur.js';

var DEFAULT_HUB_PREFETCH = {
  initialRows: 2,
  hubListSize: 16,
  rowSize: 20
};

/** First visible home window: 2 rows × 8 posters (16 total) — full warm before Home on B8. */
var DEFAULT_POSTER_WARM = {
  maxUrls: 16,
  perRow: 8,
  maxRows: 2,
  requireAll: true,
  failOnTimeout: true,
  timeoutMs: 90000
};

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
    setState({ servers: servers, activeServer: activeServer });
    warmDefaultBackground(); // fire-and-forget: IDB hit → apply immediately, miss → no-op
    console.info('[bootstrap] server selected', {
      name: activeServer.name,
      connectionUri: activeServer.connectionUri,
      clientIdentifier: activeServer.clientIdentifier,
      owned: activeServer.owned,
      resolvedCount: servers.length
    });
    onStatus('Loading libraries…');
    var hubPrefetchEnabled = options.hubPrefetch !== false;
    var hubPrefetchOpts = Object.assign({}, DEFAULT_HUB_PREFETCH, options.hubPrefetchOpts || {});
    var hubsPromise = hubPrefetchEnabled
      ? prefetchHomeHubs(activeServer, hubPrefetchOpts)
      : Promise.resolve({ hubList: [], rows: [] });
    return Promise.all([
      getLibraries(activeServer, { fresh: true }),
      hubsPromise
    ]).then(function (results) {
      return {
        librariesResult: results[0],
        hubPrefetchResult: results[1],
        hubPrefetchEnabled: hubPrefetchEnabled
      };
    });
  }).then(function (payload) {
    var hubPrefetchResult = payload.hubPrefetchResult;
    var apiItems = (payload.librariesResult && payload.librariesResult.items)
      ? payload.librariesResult.items.length
      : 0;
    var rawSections = mapLibrarySections(payload.librariesResult);
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

    var warmPosters = options.warmPosters !== false && payload.hubPrefetchEnabled;
    if (!warmPosters || !hubPrefetchResult || !hubPrefetchResult.rows || !hubPrefetchResult.rows.length) {
      onStatus('Opening Home…');
      return;
    }

    onStatus('Loading artwork…');
    var posterWarmOpts = Object.assign({}, DEFAULT_POSTER_WARM, options.posterWarm || {});
    posterWarmOpts.onProgress = function (loaded, total) {
      onStatus('Loading artwork… (' + loaded + '/' + total + ')');
    };
    return warmHubPrefetchPosters(hubPrefetchResult, posterWarmOpts).then(function (warmResult) {
      if (!warmResult.complete || warmResult.warmed < warmResult.total) {
        throw new Error(
          'Artwork did not finish loading (' + warmResult.warmed + '/' + warmResult.total + '). Try again.'
        );
      }
      console.info('[bootstrap] poster warm', {
        requested: warmResult.urls.length,
        warmed: warmResult.warmed,
        requireAll: posterWarmOpts.requireAll !== false,
        timeoutMs: posterWarmOpts.timeoutMs
      });
      onStatus('Opening Home…');
    });
  });
}

export {
  runAppBootstrap,
  shouldBlockIncompleteRestrictedSession,
  DEFAULT_HUB_PREFETCH,
  DEFAULT_POSTER_WARM
};
