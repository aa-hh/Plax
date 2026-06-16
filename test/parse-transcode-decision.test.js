import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTranscodeDecision,
  strategyFromPartDecision
} from '../src/playback/parseTranscodeDecision.js';

var SAMPLE_COPY = [
  '<MediaContainer resourceSession="plex-sess-1" size="1">',
  '<Video ratingKey="1">',
  '<Media protocol="hls" selected="1">',
  '<Part decision="copy" protocol="hls" selected="1" id="99"/>',
  '</Media>',
  '</Video>',
  '</MediaContainer>'
].join('');

var SAMPLE_DIRECT = [
  '<MediaContainer resourceSession="plex-sess-2">',
  '<Video>',
  '<Media>',
  '<Part decision="directplay" protocol="http"/>',
  '</Media>',
  '</Video>',
  '</MediaContainer>'
].join('');

test('parseTranscodeDecision reads resourceSession and Part decision', function () {
  var parsed = parseTranscodeDecision(SAMPLE_COPY, { mediaIndex: 0, partIndex: 0 });
  assert.equal(parsed.resourceSession, 'plex-sess-1');
  assert.equal(parsed.part.decision, 'copy');
  assert.equal(parsed.part.protocol, 'hls');
});

test('strategyFromPartDecision maps Plex Part decisions', function () {
  assert.equal(strategyFromPartDecision('directplay'), 'direct');
  assert.equal(strategyFromPartDecision('copy'), 'direct-stream');
  assert.equal(strategyFromPartDecision('transcode'), 'transcode');
});

test('parseTranscodeDecision handles directplay', function () {
  var parsed = parseTranscodeDecision(SAMPLE_DIRECT, {});
  assert.equal(parsed.resourceSession, 'plex-sess-2');
  assert.equal(strategyFromPartDecision(parsed.part.decision), 'direct');
});
