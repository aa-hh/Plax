import { fetchJson, fetchText } from '../../utils/fetch.js';
import { plexTvUrl, plexHeaders } from '../client.js';
import { fetchUser } from '../auth/pinAuth.js';

function asBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function mapHomeUser(u) {
  return {
    id: u.id,
    uuid: u.uuid,
    title: u.title || u.username || u.friendlyName,
    username: u.username,
    thumb: u.thumb || u.avatar || null,
    restricted: asBool(u.restricted),
    admin: asBool(u.admin),
    guest: asBool(u.guest),
    protected: asBool(u.protected),
    hasPin: asBool(u.protected),
    authToken: null
  };
}

/** Plex returns a home object with nested users, not a bare array. */
function normalizeHomeUsersPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== 'object') return [];
  if (Array.isArray(data.users)) return data.users;
  if (data.users && typeof data.users === 'object') {
    if (Array.isArray(data.users.user)) return data.users.user;
    if (data.users.user) return [data.users.user];
  }
  if (Array.isArray(data.user)) return data.user;
  if (data.user) return [data.user];
  if (data.home) return normalizeHomeUsersPayload(data.home);
  return [];
}

function parseHomeUsersXml(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return [];
  var parser = new DOMParser();
  var doc = parser.parseFromString(xmlText, 'text/xml');
  var nodes = doc.querySelectorAll('user');
  var users = [];
  var i;
  for (i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var u = {};
    var j;
    for (j = 0; j < node.attributes.length; j++) {
      var attr = node.attributes[j];
      u[attr.name] = attr.value;
    }
    users.push(u);
  }
  return users;
}

function fetchHomeUsersXml(ownerAuthToken) {
  return fetchText(plexTvUrl('/api/v2/home/users'), {
    headers: plexHeaders({
      Accept: 'application/xml',
      'X-Plex-Token': ownerAuthToken
    }),
    timeout: HOME_API_TIMEOUT
  }).then(function (xml) {
    return parseHomeUsersXml(xml).map(mapHomeUser);
  });
}

function fallbackOwnerProfile(ownerAuthToken, clientId) {
  return fetchUser(ownerAuthToken, clientId).then(function (user) {
    if (!user || user.id == null) return [];
    return [mapHomeUser({
      id: user.id,
      uuid: user.uuid,
      title: user.title || user.username || user.friendlyName,
      username: user.username,
      restricted: user.restricted,
      admin: true,
      protected: user.protected,
      hasPassword: user.hasPassword
    })];
  }).catch(function () {
    return [];
  });
}

var HOME_API_TIMEOUT = 15000;

function parseSwitchToken(data, xmlText) {
  if (data && typeof data === 'object') {
    if (data.authToken) return data.authToken;
    if (data.authenticationToken) return data.authenticationToken;
  }
  var raw = xmlText || (data && data._raw);
  if (!raw || typeof raw !== 'string') return null;
  var parser = new DOMParser();
  var doc = parser.parseFromString(raw, 'text/xml');
  var userEl = doc.querySelector('user');
  if (userEl && userEl.getAttribute('authenticationToken')) {
    return userEl.getAttribute('authenticationToken');
  }
  var root = doc.documentElement;
  if (root && root.getAttribute('authenticationToken')) {
    return root.getAttribute('authenticationToken');
  }
  return null;
}

// v1 fallback: keep PIN out of the URL (logs/history). Plex accepts form body on POST.
function switchHomeUserV1(user, pin, ownerAuthToken) {
  return fetchText(plexTvUrl('/api/home/users/' + user.id + '/switch'), {
    method: 'POST',
    headers: plexHeaders({
      Accept: 'application/xml',
      'X-Plex-Token': ownerAuthToken,
      'Content-Type': 'application/x-www-form-urlencoded'
    }),
    body: pin ? 'pin=' + encodeURIComponent(pin) : undefined,
    timeout: HOME_API_TIMEOUT
  }).then(function (xml) {
    var token = parseSwitchToken(null, xml);
    if (!token) throw new Error('Profile switch failed.');
    return {
      authToken: token,
      user: Object.assign({}, user, { authToken: token })
    };
  });
}

function canSkipHomeSwitch(user) {
  return !user.hasPin && !!user.admin;
}

function fetchHomeUsers(ownerAuthToken, clientId) {
  return fetchJson(plexTvUrl('/api/v2/home/users'), {
    headers: plexHeaders({ 'X-Plex-Token': ownerAuthToken }),
    timeout: HOME_API_TIMEOUT
  }).then(function (data) {
    var raw = normalizeHomeUsersPayload(data);
    if (!raw.length && data && data._raw) {
      raw = parseHomeUsersXml(data._raw);
    }
    if (raw.length) return raw.map(mapHomeUser);
    return fetchHomeUsersXml(ownerAuthToken);
  }).catch(function () {
    return fetchHomeUsersXml(ownerAuthToken);
  }).then(function (users) {
    if (users.length) return users;
    return fallbackOwnerProfile(ownerAuthToken, clientId);
  });
}

function switchToHomeUser(user, pin, ownerAuthToken) {
  if (canSkipHomeSwitch(user)) {
    return Promise.resolve({
      authToken: ownerAuthToken,
      user: Object.assign({}, user, { authToken: ownerAuthToken })
    });
  }

  return fetchJson(plexTvUrl('/api/v2/home/users/' + user.id + '/switch'), {
    method: 'POST',
    headers: plexHeaders({
      'Content-Type': 'application/json',
      'X-Plex-Token': ownerAuthToken
    }),
    body: JSON.stringify({ pin: pin || '' }),
    timeout: HOME_API_TIMEOUT
  }).then(function (result) {
    var token = parseSwitchToken(result);
    if (token) {
      return {
        authToken: token,
        user: Object.assign({}, user, { authToken: token })
      };
    }
    return switchHomeUserV1(user, pin, ownerAuthToken);
  }).catch(function (err) {
    if (err && err.status === 403) {
      throw new Error('Incorrect PIN. Try again.');
    }
    return switchHomeUserV1(user, pin, ownerAuthToken).catch(function (v1err) {
      if (v1err && v1err.status === 403) {
        throw new Error('Incorrect PIN. Try again.');
      }
      throw v1err;
    });
  });
}

export { fetchHomeUsers, switchToHomeUser, mapHomeUser, canSkipHomeSwitch };
