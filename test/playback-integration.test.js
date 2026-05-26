import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPlaybackFallbackState,
  applyRestartPlaybackFallbackFlags,
  decideErrorFallback,
  decideRebufferFallback
} from '../src/playback/playbackFallback.js';

/**
 * Mirrors playerScreen error/restart wiring without Plex or <video>.
 * @returns {{ actions: string[], streamChanges: string[], terminal: boolean }}
 */
function simulateErrorFallbackLadder(initialMode) {
  var state = createPlaybackFallbackState();
  var actions = [];
  var streamChanges = [];
  var mode = initialMode;
  var protocol = mode === 'transcode-http' ? 'http' : 'hls';
  var maxSteps = 8;

  for (var step = 0; step < maxSteps; step++) {
    var decision = decideErrorFallback(state, {
      playbackMode: mode,
      codecUnsupported: step > 0,
      isHls: mode !== 'transcode-http'
    });
    actions.push(decision.action);
    if (decision.action === 'terminal') {
      return { actions: actions, streamChanges: streamChanges, terminal: true };
    }

    var streamChange;
    if (decision.action === 'direct-stream') {
      streamChange = 'direct-stream-fallback';
      mode = 'direct-stream';
    } else if (decision.action === 'full-transcode') {
      streamChange = 'full-transcode-fallback';
      mode = 'transcode-hls';
      protocol = 'hls';
    } else if (decision.action === 'http-transcode') {
      streamChange = 'http-transcode-fallback';
      mode = 'transcode-http';
      protocol = 'http';
    } else {
      break;
    }

    streamChanges.push(streamChange);
    applyRestartPlaybackFallbackFlags(state, streamChange);
  }

  return { actions: actions, streamChanges: streamChanges, terminal: false };
}

test('integration: error ladder direct → remux → transcode → HTTP → terminal', function () {
  var result = simulateErrorFallbackLadder('direct');
  assert.deepEqual(result.actions, [
    'direct-stream',
    'full-transcode',
    'http-transcode',
    'terminal'
  ]);
  assert.deepEqual(result.streamChanges, [
    'direct-stream-fallback',
    'full-transcode-fallback',
    'http-transcode-fallback'
  ]);
  assert.equal(result.terminal, true);
});

test('integration: restart flags accumulate across ladder steps', function () {
  var state = createPlaybackFallbackState();
  applyRestartPlaybackFallbackFlags(state, 'direct-stream-fallback');
  applyRestartPlaybackFallbackFlags(state, 'full-transcode-fallback');
  applyRestartPlaybackFallbackFlags(state, 'http-transcode-fallback');
  assert.equal(state.directStreamFallbackTried, true);
  assert.equal(state.fullTranscodeFallbackTried, true);
  assert.equal(state.httpFallbackTried, true);
  assert.equal(state.hlsFallbackTried, true);
});

test('integration: rebuffer on HLS then error ladder ends at terminal', function () {
  var state = createPlaybackFallbackState();
  var rebuffer = decideRebufferFallback(state, { transcodeProtocol: 'hls' });
  assert.equal(rebuffer.action, 'http-transcode');
  applyRestartPlaybackFallbackFlags(state, 'http-transcode-fallback');

  var terminal = decideErrorFallback(state, {
    playbackMode: 'transcode-http',
    codecUnsupported: false,
    isHls: false
  });
  assert.deepEqual(terminal, { action: 'terminal' });
  assert.equal(state.httpFallbackTried, true);
});
