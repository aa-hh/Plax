import test from 'node:test';
import assert from 'node:assert/strict';

import { homeFeedErrorMessage } from '../src/ui/screens/homeFeedRender.js';

// The feed's error state pairs this copy with a "Try again" button: the text
// must name the problem in plain words and never leak a raw server body.

test('sign-in expiry names the recovery', function () {
  var err = new Error('HTTP 401 Unauthorized');
  err.status = 401;
  assert.equal(homeFeedErrorMessage(err), 'Your sign-in has expired. Sign in again from Settings.');
});

test('forbidden profile is explained without the HTTP jargon', function () {
  var err = new Error('HTTP 403');
  err.status = 403;
  assert.equal(homeFeedErrorMessage(err), 'This profile is not allowed to see this feed.');
});

test('our fetch timeout reads as a slow server', function () {
  assert.equal(homeFeedErrorMessage(new Error('Request timeout')), 'The server took too long to answer.');
  assert.equal(homeFeedErrorMessage(new Error('Artwork load timed out (3/8).')), 'The server took too long to answer.');
});

test('5xx keeps the status code for support but stays plain', function () {
  var err = new Error('HTTP 502 Bad Gateway');
  err.status = 502;
  err.body = '<html>proxy page</html>';
  var msg = homeFeedErrorMessage(err);
  assert.equal(msg, 'The server had a problem (HTTP 502).');
  assert.ok(msg.indexOf('proxy page') < 0, 'raw body never reaches the copy');
});

test('network failures and empty errors fall back to "could not reach"', function () {
  assert.equal(homeFeedErrorMessage(new TypeError('Failed to fetch')), 'Could not reach the server.');
  assert.equal(homeFeedErrorMessage(null), 'Could not reach the server.');
  assert.equal(homeFeedErrorMessage({}), 'Could not reach the server.');
});

test('an app-authored message passes through unchanged', function () {
  assert.equal(homeFeedErrorMessage(new Error('No libraries are shared with this user.')),
    'No libraries are shared with this user.');
});
