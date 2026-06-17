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

var SAMPLE_BURNED_SUBTITLE = [
  '<MediaContainer resourceSession="plex-sess-3" size="1">',
  '<Video ratingKey="7" transcodeReason="Subtitles burned in">',
  '<Media protocol="http" selected="1">',
  '<Part decision="transcode" protocol="http" selected="1" id="42">',
  '<Stream streamType="1" codec="h264" decision="transcode" ',
  'decisionText="Convert video (subtitle burn-in)"/>',
  '<Stream streamType="2" codec="ac3" decision="copy" ',
  'decisionText="Direct stream audio"/>',
  '<Stream streamType="3" codec="pgs" burn="1" decision="burn" ',
  'decisionText="Burn subtitles"/>',
  '</Part>',
  '</Media>',
  '</Video>',
  '</MediaContainer>'
].join('');

test('parseTranscodeDecision surfaces per-stream decisions and burned subtitle', function () {
  var parsed = parseTranscodeDecision(SAMPLE_BURNED_SUBTITLE, { partIndex: 0 });
  assert.equal(parsed.subtitleBurned, true);
  assert.equal(parsed.videoDecision, 'transcode');
  assert.equal(parsed.audioDecision, 'copy');
  assert.equal(parsed.transcodeReason, 'Subtitles burned in');
  assert.equal(parsed.part.decision, 'transcode');
  assert.equal(parsed.streams.length, 3);

  var subtitle = parsed.streams.filter(function (s) { return s.kind === 'subtitle'; })[0];
  assert.equal(subtitle.codec, 'pgs');
  assert.equal(subtitle.burn, true);
});

test('parseTranscodeDecision: no subtitle burn for a plain copy decision', function () {
  var parsed = parseTranscodeDecision(SAMPLE_COPY, { partIndex: 0 });
  assert.equal(parsed.subtitleBurned, false);
  assert.deepEqual(parsed.streams, []);
});
