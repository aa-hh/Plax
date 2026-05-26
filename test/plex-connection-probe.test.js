import test from 'node:test';
import assert from 'node:assert/strict';

import {
  logHttpsRejected,
  logHttpFallbackAfterHttps,
  logUsingConnection
} from '../src/plex/servers/discovery.js';

test('logHttpsRejected redacts token in probe URL', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    logHttpsRejected(
      'probe failed',
      'https://plex.example/?X-Plex-Token=secret&foo=1'
    );
    assert.equal(logs.length, 1);
    assert.ok(logs[0].indexOf('[plex] HTTPS connection rejected: probe failed') >= 0);
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
