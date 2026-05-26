import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPlaybackTimestamp,
  shouldOfferResumeChoice
} from '../src/ui/resumeChoice.js';
import {
  resolveQueueAdvanceOffset,
  resolveInitialPlaybackOffset
} from '../src/playback/queuePlaybackOffset.js';

test('formatPlaybackTimestamp formats under and over one hour', function () {
  assert.equal(formatPlaybackTimestamp(0), '0:00');
  assert.equal(formatPlaybackTimestamp(65000), '1:05');
  assert.equal(formatPlaybackTimestamp(3661000), '1:01:01');
});

test('shouldOfferResumeChoice requires positive offset away from end', function () {
  assert.equal(shouldOfferResumeChoice(0, 3600000), false);
  assert.equal(shouldOfferResumeChoice(-1, 3600000), false);
  assert.equal(shouldOfferResumeChoice(120000, 3600000), true);
  assert.equal(shouldOfferResumeChoice(3596000, 3600000), false);
  assert.equal(shouldOfferResumeChoice(5000, 0), true);
});

test('resolveQueueAdvanceOffset always returns 0', function () {
  assert.equal(resolveQueueAdvanceOffset(), 0);
});

test('resolveInitialPlaybackOffset prefers explicit offset including zero', function () {
  assert.equal(resolveInitialPlaybackOffset(0, 120000, 90000), 0);
  assert.equal(resolveInitialPlaybackOffset(null, 120000, 90000), 120000);
  assert.equal(resolveInitialPlaybackOffset(undefined, 0, 45000), 45000);
  assert.equal(resolveInitialPlaybackOffset(undefined, 0, 0), 0);
});
