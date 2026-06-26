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
  findSubtitleTrack,
  canUseClientSubtitles,
  isClientSubtitlePlaybackMode,
  shouldBurnInSubtitle,
  buildSubtitleTranscodeParams,
  upgradeStrategyForTextSubtitles,
  buildClientSubtitleUrl,
  buildSubtitleFetchPlan,
  prepareClientSubtitlePlayback,
  resolveSubtitleSessionId,
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
import { parseSubtitleTextToCues } from '../src/playback/tracks/srtParser.js';

var h264Ok = { h264: 'probably', hevc: 'probably', ac3: 'probably', eac3: '', dts: '' };

globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
  this.startTime = startTime;
  this.endTime = endTime;
  this.text = text;
};

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

test('nextLowerTranscodeProfileKey steps down Plex Web ladder', function () {
  assert.equal(nextLowerTranscodeProfileKey('1080'), '1080p-10');
  assert.equal(nextLowerTranscodeProfileKey('720'), '720p-3');
  assert.equal(nextLowerTranscodeProfileKey('480'), '320p-720');
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

test('buildSubtitleTranscodeParams only burns when burnIn is explicitly true', function () {
  assert.equal(Object.keys(buildSubtitleTranscodeParams(3, 100)).length, 0);
  assert.equal(Object.keys(buildSubtitleTranscodeParams(3, 100, { burnIn: false })).length, 0);
  assert.equal(Object.keys(buildSubtitleTranscodeParams(null, 100, { burnIn: true })).length, 0);
  var burned = buildSubtitleTranscodeParams(3, 100, { burnIn: true });
  assert.equal(burned['X-Plex-Subtitle-Stream'], '3');
  assert.equal(burned.autoAdjustSubtitle, '1');
  assert.equal(burned.subtitleSize, '100');
  assert.equal(burned.subtitleStreamID, '3');
  assert.equal(burned.subtitleFormat, undefined);
  assert.equal(burned.subtitles, 'burn');
  assert.equal(burned.advancedSubtitles, undefined);
  var assBurn = buildSubtitleTranscodeParams(3, 100, { burnIn: true, advancedSubtitles: 'burn' });
  assert.equal(assBurn.advancedSubtitles, 'burn');
  assert.equal(burned['X-Plex-Subtitle-Offset'], '100');
});

test('buildSubtitleTranscodeParams remux passes soft subtitle stream to HLS session', function () {
  var remux = buildSubtitleTranscodeParams(3, 50, { remux: true });
  assert.equal(remux.subtitleStreamID, '3');
  assert.equal(remux.subtitles, 'auto');
  assert.equal(remux['X-Plex-Subtitle-Stream'], '3');
  assert.equal(remux['X-Plex-Subtitle-Offset'], '50');
  assert.equal(remux.subtitleFormat, undefined);
});

test('buildSubtitleTranscodeParams remux can request segmented HLS subtitles', function () {
  var remux = buildSubtitleTranscodeParams(3, 50, { remux: true, segmented: true });
  assert.equal(remux.subtitleStreamID, '3');
  assert.equal(remux.subtitles, 'segmented');
  assert.equal(remux['X-Plex-Subtitle-Stream'], '3');
  assert.equal(remux['X-Plex-Subtitle-Offset'], '50');
});

test('buildSubtitleTranscodeParams clientSubtitles skips server HLS subs', function () {
  var skip = buildSubtitleTranscodeParams(3, 50, { clientSubtitles: true });
  assert.equal(skip.skipSubtitles, '1');
  assert.equal(skip.subtitleStreamID, undefined);
  assert.equal(skip.subtitles, undefined);
});

test('buildSubtitleTranscodeParams clientSubtitles wins over remux subtitles', function () {
  var skip = buildSubtitleTranscodeParams(3, 50, { clientSubtitles: true, remux: true, segmented: true });
  assert.equal(skip.skipSubtitles, '1');
  assert.equal(skip.subtitleStreamID, undefined);
  assert.equal(skip.subtitles, undefined);
  assert.equal(skip['X-Plex-Subtitle-Stream'], undefined);
});

test('upgradeStrategyForTextSubtitles promotes direct to direct-stream when subs selected', function () {
  var session = { subtitleStreamId: 2, subtitleBurnIn: false };
  assert.equal(upgradeStrategyForTextSubtitles('direct', session), 'direct-stream');
  assert.equal(upgradeStrategyForTextSubtitles('transcode', session), 'transcode');
  assert.equal(upgradeStrategyForTextSubtitles('direct', { subtitleBurnIn: true, subtitleStreamId: 2 }), 'direct');
  assert.equal(upgradeStrategyForTextSubtitles('direct', { subtitleStreamId: null }), 'direct');
});

test('resolvePlaybackStrategy no longer upgrades auto direct for text subs', async function () {
  var mod = await import('../src/backends/plex/playback.js');
  assert.equal(
    mod.resolvePlaybackStrategy({ quality: 'auto', subtitleStreamId: 5, subtitleBurnIn: false }),
    'direct'
  );
});

test('resolveSessionPartPath prefers version partKey over metadata key', function () {
  var path = resolveSessionPartPath({
    item: { key: '/library/metadata/999', ratingKey: '999' },
    version: { partKey: '/library/parts/abc/video.mkv' }
  });
  assert.equal(path, '/library/parts/abc/video.mkv');
});

test('resolveSessionPartPath strips query string from Plex Part keys', function () {
  var dirty = '/library/parts/231208/1779142932/file.mkv?checkFiles=1&includeBandwidths=1&offset=454&X-Plex-Incomplete-Segments=1&X-Plex-Session-Identifier=plax-test';
  assert.equal(
    resolveSessionPartPath({ version: { partKey: dirty } }),
    '/library/parts/231208/1779142932/file.mkv'
  );
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
  assert.equal(offsetSecondsForPlex({ offset: 3776897 }), 3776);
  assert.equal(offsetSecondsForPlex({ offset: 2080000 }), 2080);
  assert.equal(offsetSecondsForPlex({ offset: 90 }), 90);
});

test('parseTranscodeSessionFromUrl reads session query param', function () {
  var url = 'http://plex:32400/video/:/transcode/universal/start.m3u8?session=abc123&directPlay=0';
  assert.equal(parseTranscodeSessionFromUrl(url), 'abc123');
  assert.equal(parseTranscodeSessionFromUrl('http://plex/file.mkv'), null);
});

test('subtitleDirectFlagsForMode uses extraction flags for direct playback', function () {
  assert.deepEqual(subtitleDirectFlagsForMode('transcode-hls'), {
    directPlay: '0', directStream: '0', directStreamAudio: '1'
  });
  assert.deepEqual(subtitleDirectFlagsForMode('direct-stream'), {
    directPlay: '0', directStream: '1', directStreamAudio: '1'
  });
  assert.deepEqual(subtitleDirectFlagsForMode('direct'), {
    directPlay: '0', directStream: '1', directStreamAudio: '1'
  });
});

test('buildSubtitleFetchPlan tries stream then metadata for embedded text subs', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
  var session = {
    item: { key: '/library/metadata/999', ratingKey: '999' },
    version: { partKey: '/library/parts/abc/video.mkv' },
    sessionId: 'plax-test-session',
    playbackSessionId: 'client-playback-session',
    transcodeSessionId: 'plex-subtitle-session',
    subtitleStreamId: 1893985,
    audioStreamId: 100,
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
  assert.ok(attempts.length >= 4);
  // PRIMARY: the official /subtitles/:/transcode/universal/start endpoint (embedded).
  assert.equal(attempts[0].label, 'subtitles-start');
  assert.ok(attempts[0].url.indexOf('/subtitles/:/transcode/universal/start') >= 0);
  assert.ok(attempts[0].url.indexOf('Accept=') < 0, 'Accept must be a header, not a query param');
  assert.equal(attempts[0].init.headers.Accept, 'application/json');
  assert.ok(attempts[0].url.indexOf('directPlay=1') >= 0);
  assert.ok(attempts[0].url.indexOf('subtitles=sidecar') >= 0);
  var streamEmbedded = attempts.filter(function (a) { return a.label === 'stream-embedded'; })[0];
  assert.ok(streamEmbedded);
  assert.ok(streamEmbedded.url.indexOf('/library/streams/1893985.srt') >= 0);
  var metaAuto = attempts.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
  assert.ok(metaAuto);
  assert.ok(metaAuto.url.indexOf('subtitles=auto') >= 0);
  assert.ok(metaAuto.url.indexOf('path=' + encodeURIComponent('/library/metadata/999')) >= 0);
  assert.ok(metaAuto.url.indexOf('session=plex-subtitle-session') >= 0);
  assert.ok(metaAuto.url.indexOf('transcodeSessionId=plex-subtitle-session') >= 0);
  assert.equal(metaAuto.init.headers['X-Plex-Token'], 'tok');
  assert.equal(metaAuto.init.headers['X-Plex-Session-Identifier'], 'client-playback-session');
  assert.ok(metaAuto.url.indexOf('X-Plex-Audio-Stream=') < 0);
  var first = metaAuto.url;
  assert.ok(first.indexOf('/video/:/transcode/universal/subtitles') >= 0);
  assert.ok(first.indexOf('subtitles=auto') >= 0);
  assert.ok(first.indexOf('hasMDE=1') >= 0);
  assert.ok(first.indexOf('location=lan') >= 0);
  assert.ok(first.indexOf('copyts=') < 0);
  assert.ok(first.indexOf('subtitleSize=') < 0);
  assert.ok(first.indexOf('audioBoost=') < 0);
  assert.ok(first.indexOf('protocol=http') >= 0);
  assert.ok(first.indexOf('path=' + encodeURIComponent('/library/metadata/999')) >= 0);
  assert.ok(first.indexOf(encodeURIComponent('http://plex.local:32400/library/metadata/999')) < 0);
  assert.ok(first.indexOf('subtitleStreamID=') < 0);
  assert.ok(first.indexOf('X-Plex-Subtitle-Stream=') < 0);
  assert.ok(first.indexOf('subtitleFormat=') < 0);
  assert.ok(first.indexOf('directStreamAudio=1') >= 0);
  assert.ok(first.indexOf('session=plex-subtitle-session') >= 0);
  assert.ok(first.indexOf('transcodeSessionId=plex-subtitle-session') >= 0);
  assert.ok(first.indexOf('directPlay=0') >= 0);
  assert.ok(first.indexOf('fastSeek=') < 0);
  new URL(first).searchParams.forEach(function (value, key) {
    assert.ok([
      'path',
      'mediaIndex',
      'partIndex',
      'subtitles',
      'hasMDE',
      'location',
      'protocol',
      'directPlay',
      'directStream',
      'directStreamAudio',
      'offset',
      'session',
      'transcodeSessionId',
      'advancedSubtitles',
      'subtitleStreamID'
    ].indexOf(key) >= 0, 'unexpected subtitle query param: ' + key);
  });
  assert.equal(attempts.filter(function (a) { return a.label === 'stream-embedded'; }).length, 1);
});

test('buildSubtitleFetchPlan HLS primary uses same transcode session and protocol=hls', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
  var session = {
    item: { key: '/library/metadata/999', ratingKey: '999' },
    playbackSessionId: 'client-session-abc',
    transcodeSessionId: 'plex-hls-session',
    subtitleStreamId: 1893985,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 1893985, codec: 'srt', delivery: 'embedded' };
  var plan = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'direct-stream'
  });
  var metaAuto = plan.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
  assert.ok(metaAuto);
  assert.ok(metaAuto.url.indexOf('protocol=hls') >= 0);
  assert.ok(metaAuto.url.indexOf('session=plex-hls-session') >= 0);
  assert.ok(metaAuto.url.indexOf('transcodeSessionId=plex-hls-session') >= 0);
  assert.equal(metaAuto.init.headers['X-Plex-Session-Identifier'], 'client-session-abc');
  var isolated = plan.filter(function (a) {
    return a.label === 'universal-metadata-auto-http-isolated';
  })[0];
  assert.ok(isolated);
  assert.ok(isolated.url.indexOf('protocol=http') >= 0);
  assert.ok(isolated.url.indexOf('session=plex-hls-session') < 0);
});

test('buildSubtitleFetchPlan deprioritizes stream fetch on wan', function () {
  var server = {
    connectionUri: 'http://185.203.56.20:17054',
    accessToken: 'tok',
    activeConnection: { local: false, uri: 'http://185.203.56.20:17054' }
  };
  var session = {
    item: { key: '/library/metadata/999', ratingKey: '999' },
    transcodeSessionId: 'plex-hls-session',
    subtitleStreamId: 1893985,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 1893985, codec: 'srt', delivery: 'embedded' };
  var plan = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'transcode-hls'
  });
  // For embedded subs the proven endpoints lead: subtitles-start then
  // stream-embedded (extracted on demand), BEFORE the universal attempts —
  // even on wan, because stream-embedded is the one that actually returns cues.
  assert.equal(plan[0].label, 'subtitles-start');
  assert.equal(plan[1].label, 'stream-embedded');
  var streamEmbedded = plan.filter(function (a) { return a.label === 'stream-embedded'; })[0];
  assert.ok(streamEmbedded);
  assert.ok(plan.indexOf(streamEmbedded) < plan.findIndex(function (a) {
    return a.label === 'universal-metadata-auto';
  }));
});

test('buildSubtitleFetchPlan uses location=wan for remote PMS connection', function () {
  var server = {
    connectionUri: 'http://185.203.56.20:17054',
    accessToken: 'tok',
    activeConnection: { local: false, uri: 'http://185.203.56.20:17054' }
  };
  var session = {
    item: { key: '/library/metadata/33612' },
    subtitleStreamId: 1894107,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 1894107, codec: 'srt', delivery: 'embedded' };
  var url = buildSubtitleFetchPlan(server, session, track, { playbackMode: 'direct' })
    .filter(function (a) { return a.label === 'universal-metadata-auto'; })[0].url;
  assert.ok(url.indexOf('location=wan') >= 0);
  assert.ok(url.indexOf('location=lan') < 0);
});

test('buildSubtitleFetchPlan tries stream path first for sidecar subs', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
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

test('buildSubtitleFetchPlan isolates transcode-hls subtitle extraction over HTTP', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
  var session = {
    item: { key: '/library/metadata/999' },
    subtitleStreamId: 2,
    transcodeSessionId: 'plex-server-session',
    playbackSessionId: 'client-session-only',
    sessionId: 'plax-should-not-win',
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 2, codec: 'srt', delivery: 'embedded' };
  var attempts = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'transcode-hls'
  });
  var primary = attempts.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
  assert.ok(primary);
  assert.ok(primary.url.indexOf('protocol=hls') >= 0);
  assert.ok(primary.url.indexOf('session=plex-server-session') >= 0);
  assert.equal(primary.init.headers['X-Plex-Session-Identifier'], 'client-session-only');
  var isolated = attempts.filter(function (a) {
    return a.label === 'universal-metadata-auto-http-isolated';
  })[0];
  assert.ok(isolated);
  assert.ok(isolated.url.indexOf('protocol=http') >= 0);
  assert.ok(isolated.url.indexOf('session=plex-server-session') < 0);
});

test('buildSubtitleFetchPlan keeps transcode-http subtitle session context', function () {
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
    playbackMode: 'transcode-http'
  });
  var first = attempts.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0].url;
  assert.ok(first.indexOf('protocol=http') >= 0);
  assert.ok(first.indexOf('session=plex-server-session') >= 0);
  assert.ok(first.indexOf('transcodeSessionId=plex-server-session') >= 0);
});

test('resolveSubtitleSessionId returns PMS transcode session only', function () {
  assert.equal(
    resolveSubtitleSessionId({ sessionId: 'plax-1', transcodeSessionId: 'plex-abc' }),
    'plex-abc'
  );
  assert.equal(resolveSubtitleSessionId({ sessionId: 'plax-1' }), null);
});

test('prepareClientSubtitlePlayback on HLS remux selects part only (no decision prime)', async function () {
  var savedFetch = globalThis.fetch;
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {}, method: (init && init.method) || 'GET' });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return '<MediaContainer/>'; },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  try {
    var server = { connectionUri: 'http://plex.local:32400', accessToken: 'tok' };
    var session = {
      item: { key: '/library/metadata/999' },
      version: { partKey: '/library/parts/42/video.mkv' },
      subtitleStreamId: 5,
      transcodeSessionId: 'plex-resource-session',
      mediaIndex: 0,
      partIndex: 0
    };
    await prepareClientSubtitlePlayback(
      server,
      session,
      { id: 5, codec: 'srt', delivery: 'embedded' },
      'direct-stream'
    );
    assert.equal(calls.filter(function (call) {
      return call.url.indexOf('/video/:/transcode/universal/decision') >= 0;
    }).length, 0);
    var partPut = calls.filter(function (call) {
      return call.method === 'PUT' && call.url.indexOf('/library/parts/42') >= 0;
    })[0];
    assert.ok(partPut);
    assert.ok(partPut.url.indexOf('subtitleStreamID=5') >= 0);
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = savedFetch;
  }
});

test('HAR regression: subtitle prime mirrors playback decision shape', async function () {
  var savedFetch = globalThis.fetch;
  var calls = [];
  globalThis.fetch = function (url, init) {
    calls.push({ url: String(url), init: init || {} });
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () { return '<MediaContainer/>'; },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  try {
    var server = {
      connectionUri: 'http://185.203.56.20:17054',
      accessToken: 'tok',
      activeConnection: { local: false, uri: 'http://185.203.56.20:17054' }
    };
    var session = {
      item: { key: '/library/metadata/33622', ratingKey: '33622' },
      version: { partKey: '/library/parts/231208/1779142932/file.mkv' },
      sessionId: 'plax-1779812905191',
      subtitleStreamId: 1894444,
      audioStreamId: 1894443,
      playbackOffsetMs: 676730,
      mediaIndex: 0,
      partIndex: 0
    };
    await prepareClientSubtitlePlayback(
      server,
      session,
      { id: 1894444, codec: 'srt', delivery: 'embedded' },
      'direct'
    );
    var decision = calls.filter(function (call) {
      return call.url.indexOf('/video/:/transcode/universal/decision') >= 0;
    })[0];
    assert.ok(decision);
    var q = new URL(decision.url).searchParams;
    assert.equal(q.get('path'), '/library/metadata/33622');
    assert.equal(q.get('directPlay'), '0');
    // directStream is start.m3u8-only now; decision mirrors plex-for-kodi shape.
    assert.equal(q.get('directStream'), null);
    assert.equal(q.get('X-Plex-Client-Profile-Name'), 'Generic');
    assert.equal(q.get('subtitles'), null);
    assert.equal(q.get('copyts'), null);
    assert.equal(q.get('audioBoost'), null);
    assert.equal(q.get('X-Plex-Audio-Stream'), null);
    assert.equal(q.get('X-Plex-Client-Identifier'), null);
    assert.equal(q.get('X-Plex-Token'), null);
    assert.equal(q.get('X-Plex-Session-Identifier'), null);
    assert.equal(decision.init.headers.Accept, 'application/xml');
    assert.equal(decision.init.headers['X-Plex-Token'], 'tok');
    assert.equal(decision.init.headers['X-Plex-Session-Identifier'], 'plax-1779812905191');
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = savedFetch;
  }
});

test('prepareClientSubtitlePlayback adopts server resourceSession for subtitle fetches', async function () {
  var savedFetch = globalThis.fetch;
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return '<MediaContainer resourceSession="plex-sub-session-42"/>';
      },
      headers: { get: function () { return 'application/xml'; } }
    });
  };
  try {
    var server = {
      connectionUri: 'http://185.203.56.20:17054',
      accessToken: 'tok',
      activeConnection: { local: false, uri: 'http://185.203.56.20:17054' }
    };
    var session = {
      item: { key: '/library/metadata/33622', ratingKey: '33622' },
      version: { partKey: '/library/parts/231208/1779142932/file.mkv' },
      sessionId: 'plax-1779812905191',
      subtitleStreamId: 1894444,
      mediaIndex: 0,
      partIndex: 0
    };
    var track = { id: 1894444, codec: 'srt', delivery: 'embedded' };
    await prepareClientSubtitlePlayback(server, session, track, 'direct');
    assert.equal(session.transcodeSessionId, 'plex-sub-session-42');
    var metaAuto = buildSubtitleFetchPlan(server, session, track, {
      playbackMode: 'direct'
    }).filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
    assert.ok(metaAuto);
    assert.ok(metaAuto.url.indexOf('transcodeSessionId=plex-sub-session-42') >= 0);
    assert.equal(
      metaAuto.init.headers['X-Plex-Session-Identifier'],
      'plax-1779812905191'
    );
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = savedFetch;
  }
});

test('buildSubtitleFetchPlan includes part path only when metadata path missing', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
  var session = {
    item: { key: '/library/metadata/999' },
    version: { partKey: '/library/parts/abc/video.mkv' },
    subtitleStreamId: 2,
    mediaIndex: 0,
    partIndex: 0
  };
  var attempts = buildSubtitleFetchPlan(server, session, { id: 2, codec: 'srt', delivery: 'embedded' });
  assert.equal(attempts[0].label, 'subtitles-start');
  assert.ok(attempts.filter(function (a) { return a.label === 'stream-embedded'; })[0]);
  assert.equal(
    attempts.some(function (a) { return a.label.indexOf('universal-part-') === 0; }),
    false
  );
  var noMetadata = Object.assign({}, session, { item: { ratingKey: null } });
  var fallbackAttempts = buildSubtitleFetchPlan(
    server,
    noMetadata,
    { id: 2, codec: 'srt', delivery: 'embedded' }
  );
  var partAttempt = fallbackAttempts.filter(function (a) { return a.label === 'universal-part-sidecar'; })[0];
  assert.ok(partAttempt);
  assert.ok(partAttempt.url.indexOf('path=' + encodeURIComponent('/library/parts/abc/video.mkv')) >= 0);
  assert.ok(partAttempt.url.indexOf(encodeURIComponent('http://plex.local:32400/library/parts/abc/video.mkv')) < 0);
});

test('buildSubtitleFetchPlan uses server-relative path even on remote direct-play', function () {
  var server = {
    connectionUri: 'http://185.203.56.20:17054',
    accessToken: 'tok'
  };
  var session = {
    item: { key: '/library/metadata/33612', ratingKey: '33612' },
    version: { partKey: '/library/parts/231199/1779144329/file.mkv' },
    subtitleStreamId: 1894107,
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 1894107, codec: 'srt', delivery: 'embedded' };
  var attempts = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'direct'
  });
  attempts.forEach(function (attempt) {
    if (attempt.label.indexOf('stream-') === 0) return;
    assert.ok(
      attempt.url.indexOf(encodeURIComponent('http://185.203.56.20:17054/library')) < 0,
      'path must not include the public server URL (PMS rejects with HTTP 400): ' + attempt.url
    );
    assert.ok(attempt.url.indexOf('location=wan') >= 0);
  });
  var metaAuto = attempts.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
  assert.ok(metaAuto);
  assert.ok(metaAuto.url.indexOf(
    'path=' + encodeURIComponent('/library/metadata/33612')
  ) >= 0);
  assert.equal(
    attempts.some(function (a) { return a.label.indexOf('universal-part-') === 0; }),
    false
  );
});

test('buildSubtitleFetchPlan requests ASS subtitles as compatible text', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
  var session = {
    item: { key: '/library/metadata/999' },
    subtitleStreamId: 1894445,
    transcodeSessionId: 'plex-resource-session',
    mediaIndex: 0,
    partIndex: 0
  };
  var track = { id: 1894445, codec: 'ass', format: 'ass', delivery: 'embedded' };
  var attempts = buildSubtitleFetchPlan(server, session, track, {
    playbackMode: 'direct-stream'
  });
  var primary = attempts.filter(function (a) { return a.label === 'universal-metadata-auto'; })[0];
  assert.ok(primary);
  assert.ok(primary.url.indexOf('advancedSubtitles=text') >= 0);
  assert.ok(primary.url.indexOf('advancedSubtitles=convert') < 0);
  assert.ok(primary.url.indexOf('session=plex-resource-session') >= 0);
  assert.ok(primary.url.indexOf('subtitleStreamID=') < 0);
  assert.equal(primary.init.headers['X-Plex-Token'], 'tok');
});

test('buildClientSubtitleUrl returns first fetch plan candidate', function () {
  var server = {
    connectionUri: 'http://plex.local:32400',
    accessToken: 'tok',
    activeConnection: { local: true, uri: 'http://plex.local:32400' }
  };
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

test('subtitleMenuOptionLabel appends Embedded/External source token', function () {
  assert.equal(
    subtitleMenuOptionLabel({ title: 'English', codec: 'srt', delivery: 'embedded' }),
    'English · SRT · Embedded'
  );
  assert.equal(
    subtitleMenuOptionLabel({ title: 'Spanish', codec: 'subrip', delivery: 'sidecar' }),
    'Spanish · SRT · External'
  );
  assert.equal(
    subtitleMenuOptionLabel({ title: 'French', codec: 'srt', delivery: 'onDemand' }),
    'French · SRT · External'
  );
  // Unknown/graphical delivery omits the source token gracefully.
  assert.equal(
    subtitleMenuOptionLabel({ title: 'English', codec: 'hdmv_pgs_subtitle', delivery: 'graphical' }),
    'English · PGS'
  );
  assert.equal(
    subtitleMenuOptionLabel({ title: 'English', codec: 'srt' }),
    'English · SRT'
  );
});

test('parseSubtitleTextToCues parses WebVTT and ASS fallback text', function () {
  var vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
  var vttCues = parseSubtitleTextToCues(vtt, 500);
  assert.equal(vttCues.length, 1);
  assert.equal(vttCues[0].startTime, 1.5);
  assert.equal(vttCues[0].text, 'Hello');

  var ass = '[Script Info]\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
    'Dialogue: 0,0:00:03.00,0:00:04.50,Default,,0,0,0,,{\\i1}Hi\\Nthere';
  var assCues = parseSubtitleTextToCues(ass, 0);
  assert.equal(assCues.length, 1);
  assert.equal(assCues[0].startTime, 3);
  assert.equal(assCues[0].endTime, 4.5);
  assert.equal(assCues[0].text, 'Hi\nthere');
});
