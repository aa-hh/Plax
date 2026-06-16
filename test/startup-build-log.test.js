import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatStartupBuildLine,
  logStartupBuild,
  resetStartupBuildLogForTest
} from '../src/core/startupBuildLog.js';

test('formatStartupBuildLine uses metadata when available', function () {
  var line = formatStartupBuildLine({
    builtAt: '2026-05-26T20:01:00.000Z',
    gitCommit: 'abc1234',
    summary: 'core (2 files)'
  });
  assert.equal(
    line,
    '[XPlay Lite] startup-build builtAt=2026-05-26T20:01:00.000Z commit=abc1234 summary=core (2 files)'
  );
});

test('formatStartupBuildLine falls back when metadata missing', function () {
  var line = formatStartupBuildLine(null);
  assert.equal(
    line,
    '[XPlay Lite] startup-build builtAt=unknown-time commit=no-git summary=build-metadata-missing'
  );
});

test('logStartupBuild emits exactly once per launch', function () {
  resetStartupBuildLogForTest();
  var lines = [];
  var originalInfo = console.info;
  console.info = function (line) { lines.push(line); };
  try {
    logStartupBuild({ __XPLAY_BUILD__: { builtAt: 't', gitCommit: 'c', summary: 's' } });
    logStartupBuild({ __XPLAY_BUILD__: { builtAt: 'other', gitCommit: 'other', summary: 'other' } });
  } finally {
    console.info = originalInfo;
    resetStartupBuildLogForTest();
  }
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[XPlay Lite] startup-build builtAt=t commit=c summary=s');
});
