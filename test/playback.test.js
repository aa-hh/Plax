import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldScrobble,
  shouldResetScrobble,
  SCROBBLE_RESET_THRESHOLD
} from '../src/playback/scrobblePolicy.js';
import { nextLowerTranscodeProfileKey } from '../src/playback/qualityProfiles.js';
import { playbackUrlHasOffset, shouldSkipClientPlaybackOffset } from '../src/playback/playbackOffset.js';
import { redactPlexUrl } from '../src/playback/playerAdapter.js';
import { checkBitrate } from '../src/playback/lgBitrateLimits.js';
import { probePlayback } from '../src/playback/capabilityProbe.js';
import {
  pickDefaultSubtitleTrack,
  findSubtitleTrack,
  canUseClientSubtitles,
  isClientSubtitlePlaybackMode,
  shouldBurnInSubtitle,
  buildSubtitleTranscodeParams,
  buildClientSubtitleUrl,
  buildSubtitleFetchPlan,
  buildClientSubtitleUrlCandidates,
  classifySubtitleDelivery,
  isSidecarSubtitleTrack,
  resolveStreamKeyPath,
  resolveStreamKeyPathWithExt,
  subtitleDirectFlagsForMode,
  resolveSessionPartPath,
  resolveSessionMetadataPath,
  parseTranscodeSessionFromUrl,
  offsetSecondsForPlex,
  subtitleFormatLabel,
  subtitleMenuOptionLabel,
  shouldRetrySubtitleFetch
} from '../src/playback/tracks/subtitleTracks.js';
import {
  snapOffsetMs,
  buildPartIndexPreviewUrl,
  tileIndexForOffset,
  tileColumnRow,
  spriteBackgroundPosition,
  resolveScrubPreview,
  parseStoryboardSheets
} from '../src/playback/storyboard.js';

var h264Ok = { h264: 'probably', hevc: 'probably', ac3: 'probably', eac3: '', dts: '' };

test('shouldScrobble: short content does not scrobble at start', function () {
  assert.equal(shouldScrobble(0, 20000), false);
  assert.equal(shouldScrobble(5000, 15000), false);
});

test('shouldScrobble: short content scrobbles near 92%', function () {
  assert.equal(shouldScrobble(18400, 20000), true);
});

test('shouldScrobble: long content scrobbles within last 30s', function () {
  assert.equal(shouldScrobble(0, 3600000), false);
  assert.equal(shouldScrobble(3571000, 3600000), true);
});

test('shouldResetScrobble: clears after seek below 85% or scrobble threshold', function () {
  var duration = 100000;
  assert.equal(shouldResetScrobble(84000, duration), true);
  assert.equal(shouldResetScrobble(SCROBBLE_RESET_THRESHOLD * duration - 1, duration), true);
  assert.equal(shouldResetScrobble(93000, duration), false);
  assert.equal(shouldResetScrobble(97000, duration), false);
});

test('nextLowerTranscodeProfileKey steps down 1080 to 720 to 480', function () {
  assert.equal(nextLowerTranscodeProfileKey('1080'), '720');
  assert.equal(nextLowerTranscodeProfileKey('720'), '480');
  assert.equal(nextLowerTranscodeProfileKey('480'), null);
  assert.equal(nextLowerTranscodeProfileKey('auto'), null);
});

test('playbackUrlHasOffset detects Plex transcode offset param', function () {
  var url = 'http://plex.local/video/:/transcode/universal/start.m3u8?offset=120000&directPlay=0';
  assert.equal(playbackUrlHasOffset(url), true);
  assert.equal(playbackUrlHasOffset('http://plex.local/library/parts/1/file.mkv'), false);
});

test('shouldSkipClientPlaybackOffset for transcode URL with embedded offset', function () {
  var url = 'http://plex.local/start.m3u8?offset=60000';
  assert.equal(shouldSkipClientPlaybackOffset(url, 'transcode-hls', 60000), true);
  assert.equal(shouldSkipClientPlaybackOffset(url, 'direct', 60000), false);
  assert.equal(shouldSkipClientPlaybackOffset(url, 'transcode-hls', 0), true);
});

test('redactPlexUrl removes token from query string', function () {
  var raw = 'https://plex.example.com/video.m3u8?X-Plex-Token=secret123&offset=1';
  var redacted = redactPlexUrl(raw);
  assert.ok(redacted.indexOf('secret123') < 0);
  assert.ok(redacted.indexOf('[redacted]') >= 0);
  assert.ok(redacted.indexOf('offset=1') >= 0);
});

test('redactPlexUrl handles relative URLs and token-only paths', function () {
  var rel = '/video.m3u8?X-Plex-Token=abc&directPlay=0';
  var redactedRel = redactPlexUrl(rel);
  assert.ok(redactedRel.indexOf('abc') < 0);
  assert.ok(redactedRel.indexOf('[redacted]') >= 0);

  assert.equal(redactPlexUrl(''), '');
  assert.equal(redactPlexUrl(null), null);
});

test('redactPlexUrl regex fallback when URL constructor fails', function () {
  var malformed = 'not-a-url?X-Plex-Token=leak&foo=1';
  var redacted = redactPlexUrl(malformed);
  assert.ok(redacted.indexOf('leak') < 0);
  assert.ok(/X-Plex-Token=\[redacted\]/i.test(redacted));
});

test('checkBitrate: missing bitrate is unknown, not within limits', function () {
  var result = checkBitrate({ videoCodec: 'h264' }, { uhd: false });
  assert.equal(result.unknown, true);
  assert.equal(result.exceeds, false);
});

test('probePlayback: unknown bitrate blocks direct play but allows direct stream', function () {
  var version = {
    videoCodec: 'h264',
    audioCodec: 'aac',
    container: 'mp4'
  };
  var probe = probePlayback({}, version, h264Ok, { uhd: false });
  assert.equal(probe.canDirectPlay, false);
  assert.equal(probe.canDirectStream, true);
  assert.ok(probe.warnings.some(function (w) { return w.indexOf('bitrate') >= 0; }));
});

test('pickDefaultSubtitleTrack prefers forced when none selected', function () {
  var tracks = [
    { id: 1, title: 'English', forced: false, hearingImpaired: false, selected: false },
    { id: 2, title: 'English (forced)', forced: true, hearingImpaired: false, selected: false }
  ];
  assert.equal(pickDefaultSubtitleTrack(tracks).id, 2);
});

test('pickDefaultSubtitleTrack prefers non-SDH when no forced', function () {
  var tracks = [
    { id: 1, title: 'English SDH', forced: false, hearingImpaired: true, selected: false },
    { id: 2, title: 'English', forced: false, hearingImpaired: false, selected: false }
  ];
  assert.equal(pickDefaultSubtitleTrack(tracks).id, 2);
});

test('snapOffsetMs floors to interval', function () {
  assert.equal(snapOffsetMs(0, 10000), 0);
  assert.equal(snapOffsetMs(12500, 10000), 10000);
  assert.equal(snapOffsetMs(19999, 10000), 10000);
});

test('buildPartIndexPreviewUrl includes part id and offset', function () {
  var server = { connectionUri: 'http://192.168.1.10:32400', accessToken: 'tok' };
  var url = buildPartIndexPreviewUrl(server, 42, 12500);
  assert.ok(url.indexOf('/library/parts/42/indexes/sd/12500') >= 0);
  assert.ok(url.indexOf('width=240') >= 0);
  assert.ok(url.indexOf('X-Plex-Token=tok') >= 0);
});

test('tileIndexForOffset and tileColumnRow map grid position', function () {
  var sheet = {
    startOffsetMs: 0,
    intervalMs: 5000,
    cols: 4,
    rows: 2
  };
  assert.equal(tileIndexForOffset(12000, sheet), 2);
  assert.deepEqual(tileColumnRow(5, 4), { col: 1, row: 1 });
  assert.equal(spriteBackgroundPosition(1, 1, 120, 68), '-120px -68px');
});

test('resolveScrubPreview uses part index when available', function () {
  var server = { connectionUri: 'http://plex.local:32400' };
  var preview = resolveScrubPreview({
    kind: 'partIndex',
    server: server,
    version: { partId: 9, partIndexes: 'sd' }
  }, 7300, 120000);
  assert.equal(preview.mode, 'image');
  assert.ok(preview.imageUrl.indexOf('/library/parts/9/indexes/sd/0') >= 0);
});

test('parseStoryboardSheets reads Storyboard nodes', function () {
  var server = { connectionUri: 'http://plex.local:32400' };
  var sheets = parseStoryboardSheets({
    items: [{
      _tag: 'Storyboard',
      key: '/library/metadata/1/storyboard/0',
      tileWidth: '160',
      tileHeight: '90',
      cols: '10',
      rows: '1',
      interval: '7000',
      width: '1600',
      height: '90'
    }]
  }, server);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].cols, 10);
  assert.equal(sheets[0].intervalMs, 7000);
  assert.ok(sheets[0].imageUrl.indexOf('storyboard') >= 0);
});

test('resolveScrubPreview sprite mode positions background', function () {
  var sheets = [{
    path: '/library/metadata/1/storyboard/0',
    imageUrl: 'http://plex.local/sheet.jpg',
    tileWidth: 100,
    tileHeight: 56,
    cols: 5,
    rows: 2,
    intervalMs: 10000,
    startOffsetMs: 0,
    endOffsetMs: 100000
  }];
  var preview = resolveScrubPreview({ kind: 'sprite', sheets: sheets }, 25000, 200000);
  assert.equal(preview.mode, 'sprite');
  assert.equal(preview.backgroundPosition, '-200px 0px');
});

test('canUseClientSubtitles for text tracks on remux and transcode modes', function () {
  var textTrack = { id: 1, graphical: false, codec: 'srt' };
  assert.equal(canUseClientSubtitles('direct', textTrack), true);
  assert.equal(canUseClientSubtitles('direct-stream', textTrack), true);
  assert.equal(canUseClientSubtitles('transcode-hls', textTrack), true);
  assert.equal(canUseClientSubtitles('transcode-http', textTrack), true);
});

test('canUseClientSubtitles rejects graphical subs on all modes', function () {
  var pgs = { id: 2, graphical: true, codec: 'pgs' };
  assert.equal(canUseClientSubtitles('direct', pgs), false);
  assert.equal(canUseClientSubtitles('transcode-hls', pgs), false);
});

test('isClientSubtitlePlaybackMode covers progressive and transcode paths', function () {
  assert.equal(isClientSubtitlePlaybackMode('direct-stream'), true);
  assert.equal(isClientSubtitlePlaybackMode('transcode-hls'), true);
  assert.equal(isClientSubtitlePlaybackMode('unknown'), false);
});

test('shouldBurnInSubtitle only for image-based codecs', function () {
  assert.equal(shouldBurnInSubtitle({ graphical: true, codec: 'pgs' }), true);
  assert.equal(shouldBurnInSubtitle({ graphical: false, codec: 'srt' }), false);
});

test('buildSubtitleTranscodeParams omits burn-in when burnIn is false', function () {
  var empty = buildSubtitleTranscodeParams(3, 100, { burnIn: false });
  assert.equal(Object.keys(empty).length, 0);
  var burned = buildSubtitleTranscodeParams(3, 100, { burnIn: true });
  assert.equal(burned['X-Plex-Subtitle-Stream'], '3');
  assert.equal(burned.subtitleFormat, 'srt');
});

test('resolveSessionPartPath prefers version partKey over metadata key', function () {
  var path = resolveSessionPartPath({
    item: { key: '/library/metadata/999', ratingKey: '999' },
    version: { partKey: '/library/parts/abc/video.mkv' }
  });
  assert.equal(path, '/library/parts/abc/video.mkv');
});

test('resolveSessionMetadataPath uses item key or ratingKey', function () {
  assert.equal(
    resolveSessionMetadataPath({ item: { key: '/library/metadata/999' } }),
    '/library/metadata/999'
  );
  assert.equal(
    resolveSessionMetadataPath({ item: { ratingKey: '42' } }),
    '/library/metadata/42'
  );
});

test('resolveStreamKeyPath synthesizes /library/streams/{id} when key is missing', function () {
  assert.equal(resolveStreamKeyPath({ id: 1893985, codec: 'srt' }), '/library/streams/1893985');
  assert.equal(resolveStreamKeyPath({ key: '/library/streams/2' }), '/library/streams/2');
  assert.equal(resolveStreamKeyPath({}), null);
});

test('resolveStreamKeyPathWithExt uses .srt path per PMS stream API', function () {
  assert.equal(
    resolveStreamKeyPathWithExt({ id: 1893985, codec: 'srt' }),
    '/library/streams/1893985.srt'
  );
  assert.equal(
    resolveStreamKeyPathWithExt({ key: '/library/streams/2', codec: 'ass' }),
    '/library/streams/2.ass'
  );
});

test('classifySubtitleDelivery distinguishes embedded vs sidecar', function () {
  assert.equal(classifySubtitleDelivery({ location: 'embedded' }, false), 'embedded');
  assert.equal(classifySubtitleDelivery({ location: 'external' }, false), 'sidecar');
  assert.equal(classifySubtitleDelivery({ codec: 'hdmv_pgs_subtitle' }, true), 'graphical');
  assert.equal(classifySubtitleDelivery({ providerTitle: 'OpenSubtitles' }, false), 'onDemand');
});

test('offsetSecondsForPlex converts viewOffset ms to seconds', function () {
  assert.equal(offsetSecondsForPlex({ offset: 3776897 }), 3776.897);
  assert.equal(offsetSecondsForPlex({ offset: 90 }), 90);
});

test('parseTranscodeSessionFromUrl reads session query param', function () {
  var url = 'http://plex:32400/video/:/transcode/universal/start.m3u8?session=abc123&directPlay=0';
  assert.equal(parseTranscodeSessionFromUrl(url), 'abc123');
  assert.equal(parseTranscodeSessionFromUrl('http://plex/file.mkv'), null);
});

test('subtitleDirectFlagsForMode matches transcode vs direct play', function () {
  assert.deepEqual(subtitleDirectFlagsForMode('transcode-hls'), {
    directPlay: '0', directStream: '0', directStreamAudio: '1'
  });
  assert.deepEqual(subtitleDirectFlagsForMode('direct-stream'), {
    directPlay: '0', directStream: '1', directStreamAudio: '1'
  });
  assert.deepEqual(subtitleDirectFlagsForMode('direct'), {
    directPlay: '1', directStream: '1', directStreamAudio: '1'
  });
});

test('buildSubtitleFetchPlan skips stream GET for embedded text subs', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = {
    item: { key: '/library/metadata/999', ratingKey: '999' },
    version: { partKey: '/library/parts/abc/video.mkv' },
    subtitleStreamId: 1893985,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = {
    id: 1893985,
    codec: 'srt',
    format: 'srt',
    graphical: false,
    delivery: 'embedded'
  };
  var attempts = buildSubtitleFetchPlan(server, session, track);
  assert.ok(attempts.length >= 3);
  assert.equal(attempts[0].label, 'universal-metadata-auto');
  var first = attempts[0].url;
  assert.ok(first.indexOf('/video/:/transcode/universal/subtitles') >= 0);
  assert.ok(attempts.every(function (a) { return a.url.indexOf('/library/streams/') < 0; }));
  assert.ok(first.indexOf('subtitles=auto') >= 0);
  assert.ok(first.indexOf('hasMDE=1') >= 0);
  assert.ok(first.indexOf('location=lan') >= 0);
  assert.ok(first.indexOf('copyts=1') >= 0);
  assert.ok(first.indexOf('subtitleSize=100') >= 0);
  assert.ok(first.indexOf('audioBoost=100') >= 0);
  assert.ok(first.indexOf('protocol=http') >= 0);
  assert.ok(first.indexOf(encodeURIComponent('http://plex.local:32400/library/metadata/999')) >= 0);
  assert.ok(first.indexOf('subtitleStreamID=1893985') >= 0);
  assert.ok(first.indexOf('X-Plex-Subtitle-Stream=') < 0);
  assert.ok(first.indexOf('subtitleFormat=') < 0);
  assert.ok(first.indexOf('directStreamAudio=') < 0);
  assert.ok(first.indexOf('session=') < 0);
  assert.ok(first.indexOf('directPlay=1') >= 0);
  assert.equal(attempts[1].label, 'universal-metadata-embedded');
  assert.ok(attempts[1].url.indexOf('subtitles=embedded') >= 0);
});

test('buildSubtitleFetchPlan tries stream path first for sidecar subs', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = {
    item: { key: '/library/metadata/999', ratingKey: '999' },
    subtitleStreamId: 2,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = {
    id: 2,
    key: '/library/streams/2',
    codec: 'srt',
    delivery: 'sidecar'
  };
  assert.equal(isSidecarSubtitleTrack(track), true);
  var attempts = buildSubtitleFetchPlan(server, session, track);
  assert.equal(attempts[0].label, 'stream-sidecar');
  assert.ok(attempts[0].url.indexOf('/library/streams/2.srt') >= 0);
  assert.ok(attempts[1].url.indexOf('/video/:/transcode/universal/subtitles') >= 0);
});

test('buildSubtitleFetchPlan uses transcode session and flags when transcoding', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = {
    item: { key: '/library/metadata/999' },
    subtitleStreamId: 2,
    transcodeSessionId: 'plex-server-session',
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 2, codec: 'srt', delivery: 'embedded' };
  var attempts = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'transcode-hls'
  });
  var first = attempts[0].url;
  assert.ok(first.indexOf('directPlay=0') >= 0);
  assert.ok(first.indexOf('session=plex-server-session') >= 0);
  assert.ok(first.indexOf('protocol=hls') >= 0);
  assert.ok(first.indexOf('X-Plex-Subtitle-Stream=2') >= 0);
});

test('buildSubtitleFetchPlan includes part path as last resort', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = {
    item: { key: '/library/metadata/999' },
    version: { partKey: '/library/parts/abc/video.mkv' },
    subtitleStreamId: 2,
    mediaIndex: 0,
    partIndex: 0
  };
  var attempts = buildSubtitleFetchPlan(server, session, { id: 2, codec: 'srt', delivery: 'embedded' });
  var last = attempts[attempts.length - 1];
  assert.equal(last.label, 'universal-part-sidecar');
  assert.ok(last.url.indexOf(encodeURIComponent('http://plex.local:32400/library/parts/abc/video.mkv')) >= 0);
});

test('buildClientSubtitleUrl returns first fetch plan candidate', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = {
    item: { key: '/library/metadata/999' },
    subtitleStreamId: 2,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 2, key: '/library/streams/2', codec: 'srt', delivery: 'sidecar' };
  var url = buildClientSubtitleUrl(server, session, track);
  assert.ok(url.indexOf('/library/streams/2.srt') >= 0);
});

test('buildClientSubtitleUrlCandidates aliases buildSubtitleFetchPlan', function () {
  var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
  var session = { item: { key: '/library/metadata/1' }, subtitleStreamId: 1, mediaIndex: 0, partIndex: 0 };
  var track = { id: 1, codec: 'srt', delivery: 'embedded' };
  assert.deepEqual(
    buildClientSubtitleUrlCandidates(server, session, track),
    buildSubtitleFetchPlan(server, session, track)
  );
});

test('shouldRetrySubtitleFetch retries 501 and 400 but not auth errors', function () {
  assert.equal(shouldRetrySubtitleFetch({ status: 501 }), true);
  assert.equal(shouldRetrySubtitleFetch({ status: 400 }), true);
  assert.equal(shouldRetrySubtitleFetch({ status: 404 }), true);
  assert.equal(shouldRetrySubtitleFetch({ status: 401 }), false);
  assert.equal(shouldRetrySubtitleFetch({ status: 403 }), false);
  assert.equal(shouldRetrySubtitleFetch(null), false);
});

test('findSubtitleTrack matches string and numeric stream ids', function () {
  var tracks = [{ id: 5, title: 'English' }];
  assert.equal(findSubtitleTrack(tracks, '5').title, 'English');
  assert.equal(findSubtitleTrack(tracks, 5).title, 'English');
});

test('subtitleFormatLabel maps Plex codec tokens to readable types', function () {
  assert.equal(subtitleFormatLabel({ codec: 'srt' }), 'SRT');
  assert.equal(subtitleFormatLabel({ codec: 'subrip' }), 'SRT');
  assert.equal(subtitleFormatLabel({ codec: 'ass' }), 'ASS');
  assert.equal(subtitleFormatLabel({ codec: 'hdmv_pgs_subtitle' }), 'PGS');
  assert.equal(subtitleFormatLabel({ codec: 'dvd_subtitle' }), 'VOBSUB');
  assert.equal(subtitleFormatLabel({ codec: 'webvtt' }), 'VTT');
});

test('subtitleMenuOptionLabel shows type beside language title', function () {
  assert.equal(
    subtitleMenuOptionLabel({ title: 'English', codec: 'srt', forced: false, hearingImpaired: false }),
    'English · SRT'
  );
  assert.equal(
    subtitleMenuOptionLabel({ title: 'English', codec: 'hdmv_pgs_subtitle', forced: true }),
    'English (Forced) · PGS'
  );
});
