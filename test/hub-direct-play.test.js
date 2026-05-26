import test from 'node:test';
import assert from 'node:assert/strict';

import { isContinueHubRow } from '../src/plex/recommendations/homeFeed.js';
import {
  canDirectPlayFromHub,
  canDirectPlayHubItem,
  resolveHubResumeOffset,
  hubItemNeedsMetadata,
  buildPlayerParamsFromMetadata
} from '../src/playback/hubDirectPlay.js';

var continueRow = {
  title: 'On Deck',
  hubIdentifier: 'home.continue',
  key: '/hubs/continueWatching'
};

var recentRow = {
  title: 'Recently Added Movies',
  hubIdentifier: 'home.recent.movies'
};

test('isContinueHubRow matches continue watching and on deck hints', function () {
  assert.equal(isContinueHubRow(continueRow), true);
  assert.equal(isContinueHubRow({ title: 'Continue Watching' }), true);
  assert.equal(isContinueHubRow(recentRow), false);
});

test('canDirectPlayFromHub only for continue rows with movie or episode', function () {
  assert.equal(canDirectPlayFromHub(continueRow, { type: 'movie', ratingKey: '1' }), true);
  assert.equal(canDirectPlayFromHub(continueRow, { type: 'episode', ratingKey: '2' }), true);
  assert.equal(canDirectPlayFromHub(continueRow, { type: 'show', ratingKey: '3' }), false);
  assert.equal(canDirectPlayFromHub(recentRow, { type: 'movie', ratingKey: '1' }), false);
});

test('canDirectPlayHubItem requires ratingKey', function () {
  assert.equal(canDirectPlayHubItem({ type: 'movie', ratingKey: '9' }), true);
  assert.equal(canDirectPlayHubItem({ type: 'movie' }), false);
});

test('resolveHubResumeOffset uses positive viewOffset only', function () {
  assert.equal(resolveHubResumeOffset({ viewOffset: 120000 }), 120000);
  assert.equal(resolveHubResumeOffset({ viewOffset: 0 }), 0);
  assert.equal(resolveHubResumeOffset({}), 0);
});

test('hubItemNeedsMetadata when media list is empty', function () {
  assert.equal(hubItemNeedsMetadata({ ratingKey: '1', media: [{ id: 'm1' }] }), false);
  assert.equal(hubItemNeedsMetadata({ ratingKey: '1', media: [] }), true);
  assert.equal(hubItemNeedsMetadata({ ratingKey: '1' }), true);
});

var h264Ok = { h264: 'probably', hevc: 'probably', ac3: 'probably', eac3: '', dts: '' };

test('buildPlayerParamsFromMetadata includes offset and stream ids', function () {
  var metadata = {
    ratingKey: '99',
    type: 'movie',
    media: [{
      id: '1',
      videoCodec: 'h264',
      audioCodec: 'aac',
      container: 'mp4',
      _children: [{ _tag: 'Part', id: 'p1', key: '/part/1' }]
    }]
  };
  var params = buildPlayerParamsFromMetadata(metadata, {
    offset: 45000,
    capabilities: h264Ok,
    deviceInfo: { uhd: false },
    playbackPrefs: { quality: 'auto' },
    detailRoute: { ratingKey: '99', libraryType: 'movie' }
  });
  assert.equal(params.ratingKey, '99');
  assert.equal(params.offset, 45000);
  assert.ok(params.version);
  assert.equal(params._detail.ratingKey, '99');
  assert.equal(typeof params.forceTranscode, 'boolean');
});
