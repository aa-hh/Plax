import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlexPath } from '../src/playback/plexPaths.js';
import { buildPlaybackUrl } from '../src/playback/sessionController.js';
import { resolveSessionPartPath } from '../src/playback/tracks/subtitleTracks.js';

var mockServer = {
  connectionUri: 'https://plex.example.com:32400',
  accessToken: 'server-token-xyz'
};

test('normalizePlexPath strips Part key query params', function () {
  var dirty = '/library/parts/231208/1779142932/file.mkv?checkFiles=1&includeBandwidths=1&offset=454&X-Plex-Incomplete-Segments=1&X-Plex-Session-Identifier=xplay-pap12mhbajmpbi0zij';
  assert.equal(
    normalizePlexPath(dirty),
    '/library/parts/231208/1779142932/file.mkv'
  );
});

test('normalizePlexPath keeps pathname from absolute URLs', function () {
  assert.equal(
    normalizePlexPath('http://127.0.0.1:32400/library/parts/1/file.mkv?checkFiles=1'),
    '/library/parts/1/file.mkv'
  );
});

test('resolveSessionPartPath strips query from version partKey', function () {
  var dirty = '/library/parts/231208/1779142932/file.mkv?checkFiles=1&offset=454';
  assert.equal(
    resolveSessionPartPath({ version: { partKey: dirty } }),
    '/library/parts/231208/1779142932/file.mkv'
  );
});

test('buildPlaybackUrl path param excludes Part key query string', function () {
  var partKey = '/library/parts/231208/1779142932/file.mkv?checkFiles=1&includeBandwidths=1&offset=454';
  var session = {
    server: mockServer,
    sessionId: 'xplay-pap12mhbajmpbi0zij',
    offset: 454000,
    mediaIndex: 0,
    partIndex: 0,
    forceTranscode: true,
    transcodeProtocol: 'hls'
  };
  var url = buildPlaybackUrl(mockServer, partKey, session, 'hls');
  var u = new URL(url);
  assert.equal(
    u.searchParams.get('path'),
    '/library/parts/231208/1779142932/file.mkv'
  );
  assert.equal(u.searchParams.get('offset'), '454');
  assert.ok(u.searchParams.get('path').indexOf('checkFiles') < 0);
  assert.ok(u.searchParams.get('path').indexOf('X-Plex-Session-Identifier') < 0);
});
