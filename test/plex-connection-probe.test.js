import test from 'node:test';
import assert from 'node:assert/strict';

import {
  logHttpsRejected,
  logHttpFallbackAfterHttps,
  logUsingConnection,
  formatProbeFailure,
  probeTimeoutMs,
  logConnectionCandidates
} from '../src/plex/servers/discovery.js';

test('formatProbeFailure maps timeout and HTTP status', function () {
  assert.equal(formatProbeFailure({ message: 'Request timeout' }), 'timeout');
  assert.equal(formatProbeFailure({ status: 401, message: 'HTTP 401' }), 'HTTP 401 (auth)');
  assert.equal(formatProbeFailure({ status: 503, message: 'HTTP 503' }), 'HTTP 503');
});

test('probeTimeoutMs uses longer timeout for remote HTTPS', function () {
  assert.equal(
    probeTimeoutMs({ uri: 'https://x.plex.direct:17054', local: false, relay: false }),
    15000
  );
  assert.equal(
    probeTimeoutMs({ uri: 'https://192-168-1-1.plex.direct:32400', local: true, relay: false }),
    8000
  );
  assert.equal(probeTimeoutMs({ uri: 'http://10.0.0.1:32400', local: true }), 8000);
});

test('logConnectionCandidates logs when no HTTPS published', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    logConnectionCandidates([
      { uri: 'http://185.203.56.20:17054', local: false, relay: false }
    ]);
    assert.equal(logs.length, 1);
    assert.ok(logs[0].indexOf('[plex] no HTTPS connection published') >= 0);
    assert.ok(logs[0].indexOf('1 HTTP candidate') >= 0);
  } finally {
    console.info = origInfo;
  }
});

test('logHttpsRejected redacts token in probe URL', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    logHttpsRejected(
      'probe failed: timeout',
      'https://plex.example/?X-Plex-Token=secret&foo=1'
    );
    assert.equal(logs.length, 1);
    assert.ok(logs[0].indexOf('[plex] HTTPS connection rejected: probe failed: timeout') >= 0);
    assert.ok(logs[0].indexOf('secret') < 0);
    assert.ok(logs[0].indexOf('[redacted]') >= 0);
  } finally {
    console.info = origInfo;
  }
});

test('logUsingConnection logs scheme and redacts token', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    logUsingConnection('http://185.203.56.20:17054/?X-Plex-Token=secret');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].indexOf('[plex] using HTTP connection:') >= 0);
    assert.ok(logs[0].indexOf('185.203.56.20') >= 0);
    assert.ok(logs[0].indexOf('secret') < 0);
    logUsingConnection('https://plex.example:32400');
    assert.ok(logs[1].indexOf('[plex] using HTTPS connection:') >= 0);
  } finally {
    console.info = origInfo;
  }
});

test('logHttpFallbackAfterHttps formats fallback line', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    logHttpFallbackAfterHttps('http://192.168.1.10:32400');
    assert.equal(logs.length, 1);
    assert.ok(logs[0].indexOf('[plex] falling back to HTTP after HTTPS probe failed') >= 0);
    assert.ok(logs[0].indexOf('192.168.1.10') >= 0);
  } finally {
    console.info = origInfo;
  }
});
