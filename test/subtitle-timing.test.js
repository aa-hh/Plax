import test from 'node:test';
import assert from 'node:assert/strict';

import { CLIENT_SUBTITLE_DEFER_MS } from '../src/playback/subtitleTiming.js';

test('CLIENT_SUBTITLE_DEFER_MS matches Plex Web deferred subtitle window', function () {
  assert.equal(CLIENT_SUBTITLE_DEFER_MS, 2000);
});
