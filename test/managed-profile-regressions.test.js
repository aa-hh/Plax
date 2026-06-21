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

test('startup route sends jellyfin provider with NO known servers to login (not the empty picker)', function () {
  // First-ever Jellyfin connect (or provider flipped while a stale Plex token
  // lingered) — must type the server address; there's nothing to pick yet.
  assert.deepEqual(
    resolveStartupRoute({ provider: 'jellyfin', authToken: 'stale-plex-token' }, ''),
    { route: 'pairing', params: { provider: 'jellyfin' }, mark: 'boot:navigate-pairing' }
  );
});

test('startup route sends a returning Jellyfin user (known servers, not signed in) to the server picker', function () {
  // e.g. after sign-out: token gone, but the list of previously-used servers
  // survives → let them pick one (or add a new one) instead of re-typing a URL.
  assert.deepEqual(
    resolveStartupRoute({
      provider: 'jellyfin', authToken: '',
      jellyfinServers: [{ url: 'https://jf.example', name: 'Home' }]
    }, ''),
    { route: 'jellyfin-servers', params: {}, mark: 'boot:navigate-jellyfin-servers' }
  );
});

test('startup route prefers who\'s-watching over the server picker when fully configured', function () {
  // A live session (token + active server) skips the server picker even though the
  // server is also in the known-servers list.
  assert.deepEqual(
    resolveStartupRoute({
      provider: 'jellyfin', authToken: 'jf-token',
      jellyfinServer: { url: 'https://jf.example' },
      jellyfinServers: [{ url: 'https://jf.example', name: 'Home' }]
    }, ''),
    { route: 'jellyfin-users', params: { _from: 'launch' }, mark: 'boot:navigate-jellyfin-users' }
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
