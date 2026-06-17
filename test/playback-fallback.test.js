import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlaybackFallbackState,
  resetPlaybackFallbackFlags,
  isLadderFallbackStreamChange,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback,
  clearHlsFallbackAfterHlsTranscodeStart
} from '../src/playback/playbackFallback.js';
import {
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest
} from '../src/plex/clientIdentity.js';

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
  resetPlaybackFallbackFlags(state);
  assert.equal(state.directStreamFallbackTried, false);
  assert.equal(state.fullTranscodeFallbackTried, false);
  assert.equal(state.hlsFallbackTried, false);
  assert.equal(state.httpFallbackTried, false);
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
  assert.equal(state.httpFallbackTried, true);

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

test('subtitle burn-in never reverts to a sub-dropping direct mode', function () {
  var state = createPlaybackFallbackState();

  /* On a direct-stream error the normal ladder would try direct-stream first;
   * with burn-in active it must skip straight to a burn-capable transcode and
   * never offer direct / direct-stream / direct-no-subs. */
  var step1 = decideErrorFallback(state, {
    playbackMode: 'direct',
    subtitleBurnIn: true,
    codecUnsupported: false,
    isHls: false
  });
  assert.deepEqual(step1, { action: 'full-transcode', codecUnsupported: false });
  assert.notEqual(step1.action, 'direct-stream');
  assert.notEqual(step1.action, 'direct-no-subs');

  /* Next failure escalates to the terminal transcode path (http-transcode),
   * still preserving the burn. */
  var step2 = decideErrorFallback(state, {
    playbackMode: 'transcode-hls',
    subtitleBurnIn: true,
    codecUnsupported: false,
    isHls: true
  });
  assert.deepEqual(step2, { action: 'http-transcode' });
  assert.equal(state.httpFallbackTried, true);

  /* Once http-transcode has been tried, terminate — never loop, never drop subs. */
  var step3 = decideErrorFallback(state, {
    playbackMode: 'transcode-http',
    subtitleBurnIn: true,
    codecUnsupported: false,
    isHls: false
  });
  assert.deepEqual(step3, { action: 'terminal' });
});

test('subtitle burn-in: enteredRemuxForSubtitlesOnly cannot trigger direct-no-subs', function () {
  var state = createPlaybackFallbackState();
  /* Even if the remux-for-subs flag is set, a burn-in session must not drop
   * the chosen subtitle by reverting to direct-no-subs. */
  state.enteredRemuxForSubtitlesOnly = true;
  var step = decideErrorFallback(state, {
    playbackMode: 'direct-stream',
    subtitleBurnIn: true,
    codecUnsupported: false,
    isHls: true
  });
  assert.equal(step.action, 'full-transcode');
  assert.notEqual(step.action, 'direct-no-subs');
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

test('decideRebufferFallback: switches HLS transcode to HTTP without downgrading quality', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, { transcodeProtocol: 'hls' }),
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

test('decideRebufferFallback: HLS remux stalls escalate to full transcode before HTTP', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, {
      playbackMode: 'direct-stream',
      transcodeProtocol: 'hls'
    }),
    { action: 'full-transcode' }
  );
  assert.equal(state.fullTranscodeFallbackTried, true);
  assert.deepEqual(
    decideRebufferFallback(state, {
      playbackMode: 'direct-stream',
      transcodeProtocol: 'hls'
    }),
    { action: 'http-transcode' }
  );
});

test('decideRebufferFallback: skips HTTP when PMS committed to HLS delivery', function () {
  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideRebufferFallback(state, {
      transcodeProtocol: 'hls',
      commitToHlsDelivery: true,
      pmsDeliveryProtocol: 'hls'
    }),
    { action: 'none' }
  );
  assert.equal(state.httpFallbackTried, false);
});

test('decideErrorFallback: transcode-hls tries HTTP even when PMS committed to HLS', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  state.fullTranscodeFallbackTried = true;
  assert.deepEqual(
    decideErrorFallback(state, {
      playbackMode: 'transcode-hls',
      isHls: true,
      commitToHlsDelivery: true,
      pmsDeliveryProtocol: 'hls'
    }),
    { action: 'http-transcode' }
  );
  assert.equal(state.httpFallbackTried, true);
});

test('decideErrorFallback: skips HTTP when PMS committed to HLS delivery', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  state.fullTranscodeFallbackTried = true;
  assert.deepEqual(
    decideErrorFallback(state, {
      playbackMode: 'direct-stream',
      isHls: true,
      commitToHlsDelivery: true,
      pmsDeliveryProtocol: 'hls'
    }),
    { action: 'terminal' }
  );
  assert.equal(state.hlsFallbackTried, false);
});

test('decideErrorFallback: HLS codec error allows HTTP despite PMS HLS commit', function () {
  var state = createPlaybackFallbackState();
  state.directStreamFallbackTried = true;
  state.fullTranscodeFallbackTried = true;
  assert.deepEqual(
    decideErrorFallback(state, {
      playbackMode: 'transcode-hls',
      codecUnsupported: true,
      isHls: true,
      commitToHlsDelivery: true,
      pmsDeliveryProtocol: 'hls'
    }),
    { action: 'http-transcode' }
  );
  assert.equal(state.httpFallbackTried, true);
});

test('decideErrorFallback: webOS 4 skips remux after direct play failure', function () {
  globalThis.PalmSystem = { identifier: 'com.webos.app.xplay-lite' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0' });
    }
  };
  resetPlexDeviceInfoForTest();
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });

  var state = createPlaybackFallbackState();
  assert.deepEqual(
    decideErrorFallback(state, { playbackMode: 'direct', codecUnsupported: true, isHls: true }),
    { action: 'full-transcode', codecUnsupported: true }
  );
  assert.equal(state.directStreamFallbackTried, true);
  assert.equal(state.fullTranscodeFallbackTried, true);

  delete globalThis.PalmSystem;
  delete globalThis.webOS;
  resetPlexDeviceInfoForTest();
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
