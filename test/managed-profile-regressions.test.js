import test from 'node:test';
import assert from 'node:assert/strict';

import { mapFallbackOwnerToHomeUser } from '../src/plex/users/homeUsers.js';
import { shouldRejectManagedSwitchToken } from '../src/ui/screens/profilePickerScreen.js';
import { shouldBlockIncompleteRestrictedSession } from '../src/core/appBootstrap.js';
import { hasIncompleteRestrictedSession, resolveStartupRoute } from '../src/core/startupRouting.js';

test('home user fallback preserves non-admin state', function () {
  var mapped = mapFallbackOwnerToHomeUser({
    id: 'u-1',
    username: 'kid',
    restricted: true,
    admin: false,
    protected: false
  });

  assert.equal(mapped.admin, false);
  assert.equal(mapped.restricted, true);
});

test('home user fallback does not coerce missing admin to true', function () {
  var mapped = mapFallbackOwnerToHomeUser({
    id: 'u-2',
    username: 'managed',
    restricted: true,
    protected: false
  });

  assert.equal(mapped.admin, false);
});

test('managed profile switch rejects missing switched token', function () {
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: false }, '', 'owner-token'),
    true
  );
});

test('managed profile switch allows unchanged owner token', function () {
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: false }, 'owner-token', 'owner-token'),
    false
  );
});

test('managed profile switch keeps accepting token when it matches owner', function () {
  var switchedToken = 'shared-valid-token';
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: false }, switchedToken, switchedToken),
    false
  );
});

test('managed profile switch accepts a real switched token', function () {
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: false }, 'managed-token', 'owner-token'),
    false
  );
});

test('admin profile switch does not require switched token', function () {
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: true }, '', 'owner-token'),
    false
  );
});

test('bootstrap guard blocks restricted session missing owner token', function () {
  assert.equal(
    shouldBlockIncompleteRestrictedSession({
      activeHomeUser: { admin: false, restricted: true },
      authToken: 'profile-token',
      ownerAuthToken: ''
    }),
    true
  );
});

test('bootstrap guard allows restricted session when owner token exists', function () {
  assert.equal(
    shouldBlockIncompleteRestrictedSession({
      activeHomeUser: { admin: false, restricted: true },
      authToken: 'profile-token',
      ownerAuthToken: 'owner-token'
    }),
    false
  );
});

test('bootstrap guard allows non-restricted sessions without owner token', function () {
  assert.equal(
    shouldBlockIncompleteRestrictedSession({
      activeHomeUser: { admin: true, restricted: false },
      authToken: 'owner-token',
      ownerAuthToken: ''
    }),
    false
  );
});

test('startup route shows provider picker on first run (no provider, no token)', function () {
  assert.deepEqual(
    resolveStartupRoute({ authToken: '' }, ''),
    { route: 'provider-picker', params: {}, mark: 'boot:navigate-provider-picker' }
  );
});

test('startup route uses pairing when a provider is chosen but not signed in', function () {
  assert.deepEqual(
    resolveStartupRoute({ provider: 'plex', authToken: '' }, ''),
    { route: 'pairing', params: { provider: 'plex' }, mark: 'boot:navigate-pairing' }
  );
});

test('startup route sends signed-in Jellyfin users (with a configured server) to the user picker', function () {
  assert.deepEqual(
    resolveStartupRoute({
      provider: 'jellyfin', authToken: 'jf-token',
      jellyfinServer: { url: 'https://jf.example' }
    }, ''),
    { route: 'jellyfin-users', params: { _from: 'launch' }, mark: 'boot:navigate-jellyfin-users' }
  );
});

test('startup route sends jellyfin provider with NO server to login (not the empty picker)', function () {
  // e.g. provider flipped to jellyfin while a stale Plex token lingered, or sign-in
  // never finished — must configure the server via login, not land on who's-watching.
  assert.deepEqual(
    resolveStartupRoute({ provider: 'jellyfin', authToken: 'stale-plex-token' }, ''),
    { route: 'pairing', params: { provider: 'jellyfin' }, mark: 'boot:navigate-pairing' }
  );
});

test('startup route offers the cross-provider server picker when not signed in but saved links exist', function () {
  // Forgot the active session (or never finished sign-in) but kept saved links →
  // one tap back into any saved Plex/Jellyfin server, not a from-scratch pairing.
  assert.deepEqual(
    resolveStartupRoute({
      provider: 'plex', authToken: '',
      savedLinks: [{ provider: 'jellyfin', id: 'jf:1' }, { provider: 'plex', id: 'plex:abc' }]
    }, ''),
    { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' }
  );
});

test('startup route shows the server picker on a first run that already has saved links', function () {
  // No provider chosen yet, but the device remembers prior links → pick one.
  assert.deepEqual(
    resolveStartupRoute({ authToken: '', savedLinks: [{ provider: 'plex', id: 'plex:abc' }] }, ''),
    { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' }
  );
});

test('startup route falls back to the server picker for signed-in jellyfin with no server but saved links', function () {
  assert.deepEqual(
    resolveStartupRoute({
      provider: 'jellyfin', authToken: 'jf-token',
      savedLinks: [{ provider: 'jellyfin', id: 'jf:1' }]
    }, ''),
    { route: 'server-picker', params: {}, mark: 'boot:navigate-server-picker' }
  );
});

test('startup route treats a pre-migration Plex token as an implicit plex choice', function () {
  // No provider recorded but a token exists → existing Plex install, not first run.
  assert.deepEqual(
    resolveStartupRoute({ authToken: 'owner-token', activeHomeUser: null }, 'owner-token'),
    {
      route: 'profile-picker',
      params: { _from: 'launch', _alwaysChoose: true },
      mark: 'boot:navigate-profile-picker'
    }
  );
});

test('startup route shows profile picker for signed-in owner', function () {
  assert.deepEqual(
    resolveStartupRoute({ authToken: 'owner-token', activeHomeUser: null }, 'owner-token'),
    {
      route: 'profile-picker',
      params: { _from: 'launch', _alwaysChoose: true },
      mark: 'boot:navigate-profile-picker'
    }
  );
});

test('startup route shows profile picker even with persisted profile', function () {
  assert.deepEqual(
    resolveStartupRoute({
      authToken: 'owner-token',
      activeHomeUser: { admin: true, restricted: false }
    }, 'owner-token'),
    {
      route: 'profile-picker',
      params: { _from: 'launch', _alwaysChoose: true },
      mark: 'boot:navigate-profile-picker'
    }
  );
});

test('startup routing detects incomplete restricted sessions', function () {
  assert.equal(
    hasIncompleteRestrictedSession({
      authToken: 'managed-token',
      activeHomeUser: { admin: false, restricted: true }
    }, ''),
    true
  );
});

test('startup route keeps recovery flags for incomplete restricted sessions', function () {
  assert.deepEqual(
    resolveStartupRoute({
      authToken: 'managed-token',
      activeHomeUser: { admin: false, restricted: true }
    }, ''),
    {
      route: 'profile-picker',
      params: { _retry: true, _from: 'launch', _alwaysChoose: true },
      mark: 'boot:navigate-profile-picker'
    }
  );
});
