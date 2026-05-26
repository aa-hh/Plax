import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlaybackFallbackState,
  resetPlaybackFallbackFlags,
  resetRebufferDownshiftForEpisode,
  isLadderFallbackStreamChange,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback,
  clearHlsFallbackAfterHlsTranscodeStart
} from '../src/playback/playbackFallback.js';

test('isLadderFallbackStreamChange: ladder and subtitle-fallback', function () {
  assert.equal(isLadderFallbackStreamChange('direct-stream-fallback'), true);
  assert.equal(isLadderFallbackStreamChange('http-transcode-fallback'), true);
  assert.equal(isLadderFallbackStreamChange('subtitle-fallback'), true);
  assert.equal(isLadderFallbackStreamChange('quality'), false);
  assert.equal(isLadderFallbackStreamChange(null), false);
});

test('resetPlaybackFallbackFlags clears all tried flags', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  state.httpFallbackTried = true;
  state.rebufferDownshiftTried = true;
  resetPlaybackFallbackFlags(state);
  assert.equal(state.directStreamFallbackTried, false);
  assert.equal(state.fullTranscodeFallbackTried, false);
  assert.equal(state.hlsFallbackTried, false);
  assert.equal(state.httpFallbackTried, false);
  assert.equal(state.rebufferDownshiftTried, false);
});

test('resetRebufferDownshiftForEpisode clears downshift only', function () {
  var state = createPlaybackFallbackState();
  state.rebufferDownshiftTried = true;
  state.httpFallbackTried = true;
  resetRebufferDownshiftForEpisode(state);
  assert.equal(state.rebufferDownshiftTried, false);
  assert.equal(state.httpFallbackTried, true);
});

test('applyRestartPlaybackFallbackFlags: manual restart resets ladder flags', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  applyRestartPlaybackFallbackFlags(state, 'quality');
  assert.equal(state.directStreamFallbackTried, false);
});

test('applyRestartPlaybackFallbackFlags: auto fallback preserves then marks step', function () {
  var state = createPlaybackFallbackState();
  applyRestartPlaybackFallbackFlags(state, 'direct-stream-fallback');
  assert.equal(state.directStreamFallbackTried, true);
  applyRestartPlaybackFallbackFlags(state, 'full-transcode-fallback');
  assert.equal(state.directStreamFallbackTried, true);
  assert.equal(state.fullTranscodeFallbackTried, true);
});

test('applyRestartPlaybackFallbackFlags: http fallback marks hls and http', function () {
  var state = createPlaybackFallbackState();
  applyRestartPlaybackFallbackFlags(state, 'http-transcode-fallback');
  assert.equal(state.hlsFallbackTried, true);
  assert.equal(state.httpFallbackTried, true);
});

test('decideErrorFallback ladder: direct → direct-stream → full-transcode → http → terminal', function () {
  var state = createPlaybackFallbackState();

  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'direct', codecUnsupported: false, isHls: false }),
    { action: 'direct-stream' }
  );
  assert.equal(state.directStreamFallbackTried, true);

  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'direct-stream', codecUnsupported: true, isHls: true }),
    { action: 'full-transcode', codecUnsupported: true }
  );
  assert.equal(state.fullTranscodeFallbackTried, true);

  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'transcode-hls', codecUnsupported: false, isHls: true }),
    { action: 'http-transcode' }
  );
  assert.equal(state.hlsFallbackTried, true);

  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'transcode-http', codecUnsupported: false, isHls: false }),
    { action: 'terminal' }
  );
  assert.equal(state.httpFallbackTried, true);
});

test('subtitle-remux marks state and triggers direct-no-subs on remux failure', function () {
  var state = createPlaybackFallbackState();

  applyRestartPlaybackFallbackFlags(state, 'subtitle-remux');
  assert.equal(state.enteredRemuxForSubtitlesOnly, true);

  /* Remux failed: prefer reverting to direct play with subtitles cleared
   * rather than escalating to full transcode against the same broken
   * universal endpoint. */
  assert.deepEqual(
    decideErrorFallback(state, {
      playbackMode: 'direct-stream',
      codecUnsupported: false,
      isHls: true
    }),
    { action: 'direct-no-subs' }
  );
  assert.equal(state.directNoSubsFallbackTried, true);
  assert.equal(state.enteredRemuxForSubtitlesOnly, false);
  assert.equal(state.fullTranscodeFallbackTried, false);
});

test('direct-no-subs-fallback restart records the step', function () {
  var state = createPlaybackFallbackState();
  applyRestartPlaybackFallbackFlags(state, 'subtitle-remux');
  applyRestartPlaybackFallbackFlags(state, 'direct-no-subs-fallback');
  assert.equal(state.directNoSubsFallbackTried, true);
  assert.equal(state.enteredRemuxForSubtitlesOnly, false);
});

test('direct-no-subs is not offered when remux was a regular fallback', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true; /* came from direct-play error */
  assert.deepEqual(
    decideErrorFallback(state, {
      playbackMode: 'direct-stream',
      codecUnsupported: false,
      isHls: true
    }),
    { action: 'full-transcode', codecUnsupported: false }
  );
});

test('decideErrorFallback: skips HLS→HTTP when already on transcode-http', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  state.fullTranscodeFallbackTried = true;
  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'transcode-http', codecUnsupported: false, isHls: true }),
    { action: 'terminal' }
  );
});

test('decideRebufferFallback: quality downshift before HTTP on HLS transcode', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, {
      transcodeProtocol: 'hls',
      onHlsTranscode: true,
      nextLowerQuality: '720'
    }),
    { action: 'quality-downshift', nextQuality: '720' }
  );
  assert.equal(state.rebufferDownshiftTried, true);
  assert.deepEqual(
    decideRebufferFallback(state, {
      transcodeProtocol: 'hls',
      onHlsTranscode: true,
      nextLowerQuality: '480'
    }),
    { action: 'http-transcode' }
  );
  assert.equal(state.httpFallbackTried, true);
});

test('decideRebufferFallback: switches to HTTP when no downshift available', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, {
      transcodeProtocol: 'hls',
      onHlsTranscode: true,
      nextLowerQuality: null
    }),
    { action: 'http-transcode' }
  );
  assert.equal(state.httpFallbackTried, true);
  assert.deepEqual(
    decideRebufferFallback(state, { transcodeProtocol: 'hls' }),
    { action: 'none' }
  );
});

test('decideRebufferFallback: no op when already on HTTP', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, { transcodeProtocol: 'http' }),
    { action: 'none' }
  );
});

test('clearHlsFallbackAfterHlsTranscodeStart resets hls flag for HLS URL', function () {
  var state = createPlaybackFallbackState();
  state.hlsFallbackTried = true;
  clearHlsFallbackAfterHlsTranscodeStart(state, 'transcode-hls', true);
  assert.equal(state.hlsFallbackTried, false);
  state.hlsFallbackTried = true;
  clearHlsFallbackAfterHlsTranscodeStart(state, 'transcode-hls', false);
  assert.equal(state.hlsFallbackTried, true);
});
