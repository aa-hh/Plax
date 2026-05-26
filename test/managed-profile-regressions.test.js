import test from 'node:test';
import assert from 'node:assert/strict';

import { mapFallbackOwnerToHomeUser } from '../src/plex/users/homeUsers.js';
import { shouldRejectManagedSwitchToken } from '../src/ui/screens/profilePickerScreen.js';
import { shouldBlockIncompleteRestrictedSession } from '../src/ui/screens/bootstrapScreen.js';

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

test('managed profile switch rejects unchanged owner token', function () {
  assert.equal(
    shouldRejectManagedSwitchToken({ admin: false }, 'owner-token', 'owner-token'),
    true
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
