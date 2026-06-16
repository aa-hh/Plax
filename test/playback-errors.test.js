import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlaybackFailure } from '../src/playback/playbackErrors.js';

test('formatPlaybackFailure: HTTP status and body snippet', function () {
  var err = new Error('HTTP 502');
  err.status = 502;
  err.body = 'Bad Gateway from nginx';
  assert.match(
    formatPlaybackFailure(err, { phase: 'Stream URL' }),
    /Stream URL: Plex server error \(HTTP 502\)/
  );
});

test('formatPlaybackFailure: missing connection replace error', function () {
  var err = new Error("Cannot read property 'replace' of undefined");
  assert.match(
    formatPlaybackFailure(err),
    /Plex server connection missing/i
  );
});

test('formatPlaybackFailure: timeout', function () {
  assert.match(
    formatPlaybackFailure(new Error('Request timeout'), { phase: 'Playback' }),
    /Playback: Plex request timed out/i
  );
});

test('formatPlaybackFailure: HTTP 400 strips HTML body', function () {
  var err = new Error('HTTP 400');
  err.status = 400;
  err.body = '<html><head><title>400 Bad Request</title></head><body>400 Bad Request</body></html>';
  assert.match(
    formatPlaybackFailure(err, { phase: 'Stream URL' }),
    /Stream URL: Plex rejected the playback request \(HTTP 400\)/i
  );
  assert.doesNotMatch(
    formatPlaybackFailure(err, { phase: 'Stream URL' }),
    /<html>/i
  );
});
