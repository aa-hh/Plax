import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatStartupBuildLine,
  logStartupBuild,
  parseChromiumMajor,
  resetStartupBuildLogForTest
} from '../src/core/startupBuildLog.js';

test('formatStartupBuildLine uses metadata when available', function () {
  var line = formatStartupBuildLine({
    buildNumber: 42,
    builtAt: '2026-05-26T20:01:00.000Z',
    gitCommit: 'abc1234',
    summary: 'core (2 files)'
  });
  assert.equal(
    line,
    '[XPlay Lite] startup-build buildNumber=42 builtAt=2026-05-26T20:01:00.000Z commit=abc1234 summary=core (2 files)'
  );
});

test('formatStartupBuildLine falls back when metadata missing', function () {
  var line = formatStartupBuildLine(null);
  assert.equal(
    line,
    '[XPlay Lite] startup-build buildNumber=unknown-build builtAt=unknown-time commit=no-git summary=build-metadata-missing'
  );
});

test('logStartupBuild emits exactly once per launch', function () {
  resetStartupBuildLogForTest();
  var lines = [];
  var originalInfo = console.info;
  console.info = function (line) { lines.push(line); };
  try {
    logStartupBuild({ __XPLAY_BUILD__: { buildNumber: 12, builtAt: 't', gitCommit: 'c', summary: 's' } });
    logStartupBuild({ __XPLAY_BUILD__: { buildNumber: 99, builtAt: 'other', gitCommit: 'other', summary: 'other' } });
  } finally {
    console.info = originalInfo;
    resetStartupBuildLogForTest();
  }
  assert.equal(lines.length, 1);
  assert.equal(lines[0], '[XPlay Lite] startup-build buildNumber=12 builtAt=t commit=c summary=s');
});

test('parseChromiumMajor reads the Chrome token from a webOS UA', function () {
  // webOS 4.0 (2018 B8) ships Chromium 53; webOS 5.0 ships 68.
  var webos4 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
  var webos5 = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/68.0.3440.106 Safari/537.36 WebAppManager';
  assert.equal(parseChromiumMajor(webos4), 53);
  assert.equal(parseChromiumMajor(webos5), 68);
  assert.equal(parseChromiumMajor('Chromium/87.0.4280.88'), 87);
  assert.equal(parseChromiumMajor('no browser token here'), 0);
  assert.equal(parseChromiumMajor(null), 0);
});
