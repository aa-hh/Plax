#!/usr/bin/env node
/**
 * Debug Plex Home profile library visibility (mirrors bootstrap mapping).
 *
 * Usage:
 *   PLEX_TOKEN=<owner_plex_token> SERVER_URL=https://192.168.1.10:32400 \
 *     node scripts/debug-profile-libraries.mjs "Marathon Man"
 *
 * Optional:
 *   PLEX_PIN=1234          — required if the profile has a PIN (protected=1)
 *   PROFILE_MATCH=marathon — override title substring (default: first CLI arg or "marathon")
 *
 * Reads owner token from env only (no live TV localStorage in Node). To copy tokens from
 * the TV/simulator: DevTools → Application → localStorage keys `plax_authToken`,
 * `plax_ownerAuthToken`, and `plax_activeHomeUser` (session owner may be in
 * sessionStorage `plax_session_ownerAuthToken` for restricted profiles).
 *
 * Prints: raw Plex Directory count, folder-backed count, after profile filter count,
 * plus per-section title/type/shared/accessible/hidden.
 */

import { mapLibrarySections } from '../src/plex/servers/discovery.js';
import {
  filterLibrariesForUser,
  isRestrictedProfile
} from '../src/security/libraryAccess.js';
import { mapHomeUser } from '../src/plex/users/homeUsers.js';

const PLEX_TV = 'https://plex.tv';
const PRODUCT = 'Plax';
const VERSION = '0.1.0';

function usage() {
  console.error('Usage: PLEX_TOKEN=... SERVER_URL=https://host:32400 node scripts/debug-profile-libraries.mjs [profile name]');
  process.exit(1);
}

function plexHeaders(token, extra) {
  return Object.assign({
    Accept: 'application/json',
    'X-Plex-Product': PRODUCT,
    'X-Plex-Version': VERSION,
    'X-Plex-Client-Identifier': 'plax-debug-script',
    'X-Plex-Platform': 'Script',
    'X-Plex-Device': 'Debug',
    'X-Plex-Token': token
  }, extra || {});
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status + ' ' + url);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return { _raw: text };
  }
}

async function fetchText(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status + ' ' + url);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return text;
}

function parseAttrsFromTag(openTag) {
  const attrs = {};
  const re = /([\w:-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(openTag))) attrs[m[1]] = m[2];
  return attrs;
}

function parseHomeUsersPayload(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.users)) return data.users;
  if (data.users && data.users.user) {
    return Array.isArray(data.users.user) ? data.users.user : [data.users.user];
  }
  if (Array.isArray(data.user)) return data.user;
  if (data.user) return [data.user];
  return [];
}

function parseHomeUsersXml(xml) {
  const users = [];
  const re = /<user\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(xml))) users.push(parseAttrsFromTag(m[0]));
  return users;
}

function parseSwitchToken(data, xmlText) {
  if (data && data.authToken) return data.authToken;
  if (data && data.authenticationToken) return data.authenticationToken;
  const raw = xmlText || (data && data._raw);
  if (!raw) return null;
  const m = raw.match(/authenticationToken="([^"]+)"/);
  return m ? m[1] : null;
}

function parseLibrarySectionsXml(xml) {
  const items = [];
  const dirRe = /<Directory\b([^>]*)(?:\/>|>([\s\S]*?)<\/Directory>)/gi;
  let m;
  while ((m = dirRe.exec(xml))) {
    const attrs = parseAttrsFromTag(m[0]);
    const inner = m[2] || '';
    const children = [];
    const locRe = /<Location\b([^>]*)\/?>/gi;
    let lm;
    while ((lm = locRe.exec(inner))) {
      const loc = parseAttrsFromTag(lm[0]);
      children.push({ _tag: 'Location', path: loc.path });
    }
    items.push(Object.assign(attrs, { _tag: 'Directory', _children: children }));
  }
  return { items };
}

function normalizeHomeUsers(data) {
  let raw = parseHomeUsersPayload(data);
  if (!raw.length && data && data._raw) raw = parseHomeUsersXml(data._raw);
  return raw.map(mapHomeUser);
}

async function fetchHomeUsers(ownerToken) {
  try {
    const data = await fetchJson(PLEX_TV + '/api/v2/home/users', {
      headers: plexHeaders(ownerToken)
    });
    const users = normalizeHomeUsers(data);
    if (users.length) return users;
  } catch (e) {
    console.warn('JSON home users failed, trying XML:', e.message);
  }
  const xml = await fetchText(PLEX_TV + '/api/v2/home/users', {
    headers: plexHeaders(ownerToken, { Accept: 'application/xml' })
  });
  return parseHomeUsersXml(xml).map(mapHomeUser);
}

async function switchToHomeUser(user, pin, ownerToken) {
  const switchId = user.id != null ? user.id : user.uuid;
  if (!switchId) throw new Error('Profile has no id/uuid');
  if (user.admin && !user.hasPin) {
    return { authToken: ownerToken, user };
  }
  try {
    const result = await fetchJson(PLEX_TV + '/api/v2/home/users/' + switchId + '/switch', {
      method: 'POST',
      headers: plexHeaders(ownerToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ pin: pin || '' })
    });
    const token = parseSwitchToken(result);
    if (token) return { authToken: token, user: Object.assign({}, user, { authToken: token }) };
  } catch (e) {
    if (e.status === 403) throw new Error('Incorrect PIN');
  }
  const xml = await fetchText(PLEX_TV + '/api/home/users/' + switchId + '/switch', {
    method: 'POST',
    headers: plexHeaders(ownerToken, {
      Accept: 'application/xml',
      'Content-Type': 'application/x-www-form-urlencoded'
    }),
    body: pin ? 'pin=' + encodeURIComponent(pin) : undefined
  });
  const token = parseSwitchToken(null, xml);
  if (!token) throw new Error('Profile switch failed');
  return { authToken: token, user: Object.assign({}, user, { authToken: token }) };
}

function findProfile(users, match) {
  const needle = (match || 'marathon').toLowerCase();
  return users.find(function (u) {
    const title = (u.title || u.username || '').toLowerCase();
    return title.indexOf(needle) >= 0;
  });
}

async function main() {
  const ownerToken = process.env.PLEX_TOKEN;
  const serverBase = (process.env.SERVER_URL || '').replace(/\/$/, '');
  const profileArg = process.argv.slice(2).join(' ').trim();
  const profileMatch = process.env.PROFILE_MATCH || profileArg || 'marathon';
  const pin = process.env.PLEX_PIN || '';

  if (!ownerToken || !serverBase) usage();

  console.log('Fetching Plex Home users (owner token)…');
  const homeUsers = await fetchHomeUsers(ownerToken);
  console.log('Home profiles:', homeUsers.map(function (u) {
    return {
      title: u.title,
      id: u.id,
      restricted: u.restricted,
      admin: u.admin,
      hasPin: u.hasPin
    };
  }));

  const profile = findProfile(homeUsers, profileMatch);
  if (!profile) {
    console.error('No profile matching:', profileMatch);
    process.exit(1);
  }

  console.log('\nSelected:', profile.title, profile);
  if (profile.hasPin && !pin) {
    console.warn('Profile has a PIN — set PLEX_PIN=… and re-run.');
  }

  console.log('\nSwitching profile…');
  const switched = await switchToHomeUser(profile, pin, ownerToken);
  const childToken = switched.authToken;
  console.log('Child token obtained:', childToken.slice(0, 8) + '…');

  const sectionsUrl = serverBase + '/library/sections?X-Plex-Token=' + encodeURIComponent(childToken);
  console.log('\nGET', serverBase + '/library/sections (profile token)');
  const xml = await fetchText(sectionsUrl, {
    headers: { Accept: 'application/xml' }
  });

  const parsed = parseLibrarySectionsXml(xml);
  const apiItems = parsed.items.length;
  const folderBacked = mapLibrarySections(parsed);
  const afterFilter = filterLibrariesForUser(folderBacked, switched.user);

  console.log('\nCounts:', {
    apiItems: apiItems,
    folderBacked: folderBacked.length,
    afterProfileFilter: afterFilter.length,
    restricted: isRestrictedProfile(switched.user)
  });

  console.log('\nRaw Directory rows from Plex:');
  parsed.items.forEach(function (item) {
    console.log(' -', {
      title: item.title,
      type: item.type,
      key: item.key,
      shared: item.shared,
      accessible: item.accessible,
      hidden: item.hidden,
      secondary: item.secondary,
      agent: item.agent,
      locations: (item._children || []).filter(function (c) { return c._tag === 'Location'; }).map(function (c) { return c.path; })
    });
  });

  console.log('\nAfter folder-backed map:');
  folderBacked.forEach(function (lib) {
    console.log(' -', lib.id, lib.title, lib.type, { shared: lib.shared, _accessible: lib._accessible, hidden: lib.hidden });
  });

  console.log('\nAfter profile filter (what bootstrap uses):');
  if (!afterFilter.length) {
    console.log(' (empty)');
    if (apiItems === 0) {
      console.log('\nInterpretation: Plex returned zero sections for this profile token — fix Manage Library Access in Plex, not Plax.');
    } else if (folderBacked.length === 0) {
      console.log('\nInterpretation: Plex returned sections but all were dropped by folder-backed filter (secondary/composite/empty Location/hub keys).');
    } else {
      console.log('\nInterpretation: Sections existed but profile filter removed them (hidden or accessible=0).');
    }
  } else {
    afterFilter.forEach(function (lib) {
      console.log(' -', lib.id, lib.title, '(' + lib.type + ')');
    });
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  if (err.body) console.error(err.body.slice(0, 400));
  process.exit(1);
});
