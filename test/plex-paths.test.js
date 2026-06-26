import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePlexPath, summarizeTranscodeUrl } from '../src/playback/plexPaths.js';
import { buildPlaybackUrl } from '../src/backends/plex/playback.js';
import { resolveSessionPartPath } from '../src/playback/tracks/subtitleTracks.js';

var mockServer = {
  connectionUri: 'https://plex.example.com:32400',
  accessToken: 'server-token-xyz'
};

test('normalizePlexPath strips Part key query params', function () {
  var dirty = '/library/parts/231208/1779142932/file.mkv?checkFiles=1&includeBandwidths=1&offset=454&X-Plex-Incomplete-Segments=1&X-Plex-Session-Identifier=plax-pap12mhbajmpbi0zij';
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
    sessionId: 'plax-pap12mhbajmpbi0zij',
    transcodeSessionId: 'plex-transcode-sess-paths',
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

test('summarizeTranscodeUrl decodes path and key transcode params', function () {
  var url = 'http://pms.example/video/:/transcode/universal/start.m3u8'
    + '?X-Plex-Token=secret'
    + '&path=%2Flibrary%2Fparts%2F231208%2F1779142932%2Ffile.mkv'
    + '&protocol=hls&directPlay=0&directStream=1'
    + '&session=plax-1779808567461&location=wan&offset=454'
    + '&subtitleStreamID=1894445&subtitles=auto';
  var info = summarizeTranscodeUrl(url);
  assert.equal(info.path, '/library/parts/231208/1779142932/file.mkv');
  assert.equal(info.protocol, 'hls');
  assert.equal(info.directPlay, '0');
  assert.equal(info.directStream, '1');
  assert.equal(info.session, 'plax-1779808567461');
  assert.equal(info.location, 'wan');
  assert.equal(info.offset, '454');
  assert.equal(info.subtitleStreamID, '1894445');
  assert.equal(info.subtitles, 'auto');
  assert.ok(!('X-Plex-Token' in info), 'must not surface auth token');
});

test('summarizeTranscodeUrl returns null/empty for malformed input', function () {
  assert.equal(summarizeTranscodeUrl(''), null);
  assert.equal(summarizeTranscodeUrl(null), null);
  assert.deepEqual(summarizeTranscodeUrl('http://no-query'), {});
});
