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

test('startup route uses pairing without auth token', function () {
  assert.deepEqual(
    resolveStartupRoute({ authToken: '' }, ''),
    { route: 'pairing', params: {}, mark: 'boot:navigate-pairing' }
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
