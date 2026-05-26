import { fetchJson } from '../../utils/fetch.js';
import { plexTvUrl, plexHeaders, fetchPlexXml, serverUrl } from '../client.js';
import { rankConnections } from './connectionPolicy.js';
import { normalizeSectionType } from '../../security/libraryAccess.js';
import { getState } from '../../core/store.js';
import * as cache from '../../core/cache.js';

function parseResources(data) {
  var list = Array.isArray(data) ? data : (data.MediaContainer && data.MediaContainer.Device) || [];
  if (!Array.isArray(list)) list = [list].filter(Boolean);
  return list.filter(function (r) {
    return r.provides === 'server' || (r.provides && r.provides.indexOf('server') >= 0) ||
      r.product === 'Plex Media Server';
  }).map(function (r) {
    var connections = (r.connections || []).map(function (c) {
      return {
        uri: c.uri,
        local: c.local === true || c.local === '1',
        relay: c.relay === true || c.relay === '1',
        protocol: (c.protocol || (c.uri.indexOf('https') === 0 ? 'https' : 'http'))
      };
    });
    if (r.Connection && !connections.length) {
      var conns = Array.isArray(r.Connection) ? r.Connection : [r.Connection];
      connections = conns.map(function (c) {
        return {
          uri: c.uri,
          local: c.local === '1' || c.local === true,
          relay: c.relay === '1' || c.relay === true,
          protocol: c.protocol
        };
      });
    }
    return {
      name: r.name,
      clientIdentifier: r.clientIdentifier,
      owned: r.owned !== false,
      accessToken: r.accessToken,
      connections: connections,
      connectionUri: null,
      version: r.productVersion
    };
  });
}

function fetchResources(tokenOverride) {
  var headers = tokenOverride
    ? plexHeaders({ 'includeHttps': '1', 'includeRelay': '1', 'X-Plex-Token': tokenOverride })
    : plexHeaders({ 'includeHttps': '1', 'includeRelay': '1' });
  return fetchJson(plexTvUrl('/api/v2/resources'), {
    headers: headers,
    timeout: 15000
  }).then(function (data) {
    if (Array.isArray(data)) return parseResources(data);
    return parseResources({ MediaContainer: { Device: data } });
  }).catch(function (err) {
    if (err && err.status >= 400 && err.status < 500) throw err;
    return new Promise(function (resolve) {
      setTimeout(resolve, 400 + Math.floor(Math.random() * 200));
    }).then(function () {
      return fetchJson(plexTvUrl('/api/v2/resources?includeHttps=1&includeRelay=1'), {
        headers: headers,
        timeout: 15000
      });
    }).then(parseResources);
  });
}

function buildProbeTokens(server) {
  var state = getState();
  var tokens = [];
  function add(token, from) {
    if (!token) return;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].token === token) return;
    }
    tokens.push({ token: token, from: from });
  }
  add(server.accessToken, 'serverResource');
  add(state.authToken, 'stateAuth');
  return tokens;
}

function probeServerWithToken(server, ranked, token) {
  var idx = 0;
  function tryNext() {
    if (idx >= ranked.length) {
      return Promise.reject(new Error('No reachable connection for ' + server.name));
    }
    var conn = ranked[idx++];
    var base = conn.uri.replace(/\/$/, '');
    var url = serverUrl(base, '/', {}, { accessToken: token });
    return fetchPlexXml(url, { timeout: 8000 }).then(function () {
      return Object.assign({}, server, {
        connectionUri: base,
        activeConnection: conn,
        accessToken: token
      });
    }).catch(function () {
      return tryNext();
    });
  }
  return tryNext();
}

function findOwnerServer(profileServer, ownerServers) {
  if (!ownerServers || !profileServer) return null;
  for (var i = 0; i < ownerServers.length; i++) {
    if (ownerServers[i].clientIdentifier === profileServer.clientIdentifier) {
      return ownerServers[i];
    }
  }
  return null;
}

function testServerConnection(server, prefs, ownerServers) {
  var ranked = rankConnections(server.connections, prefs);
  var state = getState();
  var profileApiToken = server.accessToken || state.authToken;
  var tokens = buildProbeTokens(server);
  var ownerServer = findOwnerServer(server, ownerServers);
  var ti = 0;

  function finishReachable(reachable) {
    return Object.assign({}, reachable, { accessToken: profileApiToken });
  }

  function tryToken() {
    if (ti >= tokens.length) {
      if (ownerServer && ownerServer.accessToken &&
          ownerServer.accessToken !== profileApiToken) {
        return probeServerWithToken(server, ranked, ownerServer.accessToken)
          .then(finishReachable);
      }
      return Promise.reject(new Error('No reachable connection for ' + server.name));
    }
    var entry = tokens[ti++];
    return probeServerWithToken(server, ranked, entry.token)
      .then(finishReachable)
      .catch(tryToken);
  }
  return tryToken();
}

function mergeOwnerConnections(profileServers, ownerServers) {
  return profileServers.map(function (ps) {
    var owner = null;
    for (var i = 0; i < ownerServers.length; i++) {
      if (ownerServers[i].clientIdentifier === ps.clientIdentifier) {
        owner = ownerServers[i];
        break;
      }
    }
    if (!owner || !(owner.connections && owner.connections.length)) return ps;
    if (owner.connections.length <= (ps.connections && ps.connections.length || 0)) return ps;
    return Object.assign({}, ps, { connections: owner.connections });
  });
}

/** Managed Home profiles often have no plex.tv resources; borrow the owner's server list. */
function resolveServersForDiscovery(profileServers, ownerServers, profileToken) {
  if (profileServers && profileServers.length) {
    return mergeOwnerConnections(profileServers, ownerServers);
  }
  if (!ownerServers || !ownerServers.length) return [];
  return ownerServers.map(function (os) {
    return Object.assign({}, os, { accessToken: profileToken || os.accessToken });
  });
}

function parseSectionAccessible(accessible) {
  if (accessible == null || accessible === '') return true;
  if (accessible === '1' || accessible === true || accessible === 1) return true;
  if (accessible === '0' || accessible === false || accessible === 0) return false;
  if (accessible === 'true') return true;
  if (accessible === 'false') return false;
  return true;
}

function probeServers(servers, prefs, ownerServers) {
  var chain = Promise.resolve([]);
  servers.forEach(function (server) {
    chain = chain.then(function (resolved) {
      return testServerConnection(server, prefs, ownerServers).then(function (s) {
        resolved.push(s);
        return resolved;
      }).catch(function () {
        return resolved;
      });
    });
  });
  return chain;
}

function needsOwnerDiscoveryAssist(state) {
  return !!(state.activeHomeUser && !state.activeHomeUser.admin &&
    state.ownerAuthToken && state.ownerAuthToken !== state.authToken);
}

function discoverServers(prefs) {
  var state = getState();
  return fetchResources().then(function (servers) {
    if (!needsOwnerDiscoveryAssist(state)) {
      return probeServers(servers, prefs, null).then(function (resolved) {
        return { servers: servers, resolved: resolved };
      });
    }
    return fetchResources(state.ownerAuthToken).then(function (ownerServers) {
      var merged = resolveServersForDiscovery(servers, ownerServers, state.authToken);
      return probeServers(merged, prefs, ownerServers).then(function (resolved) {
        return { servers: merged, resolved: resolved };
      });
    }).catch(function () {
      return probeServers(servers, prefs, null).then(function (resolved) {
        return { servers: servers, resolved: resolved };
      });
    });
  }).then(function (result) {
    return result.resolved;
  });
}

/**
 * Real libraries from GET /library/sections are Directory rows with
 * key=/library/sections/{id}, a media type (movie/show/artist/photo), and
 * usually agent+scanner. Skip nested/secondary dirs, composite agents, and
 * rows whose Location children are present but empty (virtual shelves).
 * Promoted hubs live under /hubs/* — not this endpoint.
 */
function sectionFolderPaths(item) {
  var paths = [];
  (item._children || []).forEach(function (child) {
    if (child._tag === 'Location' && child.path) {
      var p = String(child.path).trim();
      if (p) paths.push(p);
    }
  });
  return paths;
}

function isFolderBackedLibrarySection(item) {
  if (!item) return false;
  var key = String(item.key || '');
  if (!/\/library\/sections\/\d+\/?$/.test(key)) return false;
  if (item.secondary === '1' || item.secondary === true || item.secondary === 'true') {
    return false;
  }
  var agent = String(item.agent || '');
  if (agent && /composite/i.test(agent)) return false;
  var type = normalizeSectionType(item.type);
  if (!type || type === 'hub' || type === 'mixed') return false;
  var locNodes = (item._children || []).filter(function (c) {
    return c._tag === 'Location';
  });
  if (locNodes.length && !sectionFolderPaths(item).length) return false;
  return true;
}

function mapLibrarySection(item) {
  if (!item || !isFolderBackedLibrarySection(item)) return null;
  var key = item.key || '';
  var keyMatch = key.match(/\/library\/sections\/(\d+)/);
  var id = String(
    item.librarySectionID ||
    item.id ||
    (keyMatch && keyMatch[1]) ||
    ''
  );
  if (!id || id === 'sections') return null;
  var shared = item.shared;
  var hidden = item.hidden === '1' || item.hidden === true || item.hidden === 'true';
  var accessible = item.accessible;
  return {
    id: id,
    title: item.title,
    type: normalizeSectionType(item.type) || item.type,
    key: key || '/library/sections/' + id,
    shared: shared,
    hidden: hidden,
    uuid: item.uuid || '',
    agent: item.agent || '',
    scanner: item.scanner || '',
    locations: sectionFolderPaths(item),
    _accessible: parseSectionAccessible(accessible)
  };
}

function librarySectionsCacheKey(server) {
  var state = getState();
  var user = state.activeHomeUser;
  var userPart = user
    ? String(user.id != null ? user.id : (user.uuid || 'home'))
    : 'owner';
  var scope = (server && (server.clientIdentifier || server.connectionUri)) || 'noserver';
  return cache.buildKey(scope, userPart, 'sections');
}

function mapLibrarySections(result) {
  var raw = result.items || [];
  var mapped = raw.map(mapLibrarySection).filter(Boolean);
  if (raw.length !== mapped.length) {
    console.info('[libraries] folder-backed filter', {
      apiSections: raw.length,
      kept: mapped.length,
      skipped: raw.length - mapped.length
    });
  }
  return mapped;
}

function getLibraries(server, opts) {
  opts = opts || {};
  var key = librarySectionsCacheKey(server);
  if (opts.fresh) cache.invalidate('libraries', key);
  return cache.remember('libraries', key, function () {
    return fetchPlexXml(serverUrl(server.connectionUri, '/library/sections', {}, server));
  });
}

export {
  fetchResources,
  discoverServers,
  getLibraries,
  mapLibrarySection,
  mapLibrarySections,
  librarySectionsCacheKey,
  resolveServersForDiscovery,
  testServerConnection,
  isFolderBackedLibrarySection,
  sectionFolderPaths
};

export { normalizeSectionType, isMovieOrTvSection as isMovieOrShowSection } from '../../security/libraryAccess.js';
