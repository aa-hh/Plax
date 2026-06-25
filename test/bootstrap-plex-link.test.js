import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlexLinkPayload } from '../src/core/appBootstrap.js';

// Regression: the Plex saved-link payload used to be inlined inside the
// server-discovery .then() and referenced `user` — a variable that only existed
// in the PREVIOUS .then() scope. That threw `ReferenceError: user is not defined`
// the moment a PIN profile finished "Finding Plex servers…", so the bootstrap
// rejected and the user never reached Home. The payload is now built from STATE
// by this pure helper; these tests pin that contract.

test('buildPlexLinkPayload reads the validated user from state (never an outer closure)', () => {
  var state = { user: { title: 'King Alec', username: 'kingalec' } };
  var link = buildPlexLinkPayload(state, 'client-123', 'owner-tok', { name: 'Tower' });
  assert.equal(link.clientId, 'client-123');
  assert.equal(link.authToken, 'owner-tok');
  assert.equal(link.ownerAuthToken, 'owner-tok');
  assert.equal(link.name, 'King Alec');
  assert.deepEqual(link.user, { title: 'King Alec', username: 'kingalec' });
});

test('buildPlexLinkPayload never throws when user is missing from state', () => {
  // The exact failure shape: state has no user yet. Must not throw, must fall
  // back to the server name, and must null the user field.
  var link = buildPlexLinkPayload({}, 'c1', 'tok', { name: 'Tower' });
  assert.equal(link.name, 'Tower');
  assert.equal(link.user, null);
});

test('buildPlexLinkPayload falls back to username, then server name, then "Plex"', () => {
  assert.equal(
    buildPlexLinkPayload({ user: { username: 'alec' } }, 'c', 't', { name: 'Tower' }).name,
    'alec'
  );
  assert.equal(
    buildPlexLinkPayload({ user: {} }, 'c', 't', { name: 'Tower' }).name,
    'Tower'
  );
  assert.equal(
    buildPlexLinkPayload({ user: null }, 'c', 't', null).name,
    'Plex'
  );
});
