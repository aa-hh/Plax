import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

var require = createRequire(import.meta.url);
var logReceiver = require('../scripts/log-receiver.cjs');

test('normalizeLogEntry: JSON fields', function () {
  var row = logReceiver.normalizeLogEntry({
    level: 'error',
    tag: 'player',
    message: 'buffering',
    ts: '2026-05-29T12:00:00.000Z',
    detail: 'extra'
  });
  assert.match(row.line, /\[error\] \[player\] buffering extra/);
  assert.equal(row.ts, '2026-05-29T12:00:00.000Z');
});

test('parseLogBody: plain text lines', function () {
  var lines = logReceiver.parseLogBody('one line\nsecond line\n', 'text/plain');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /\[tv\] one line/);
  assert.match(lines[1], /\[tv\] second line/);
});

test('parseLogBody: JSON array', function () {
  var body = JSON.stringify([
    { level: 'log', tag: 'boot', message: 'start', ts: '2026-01-01T00:00:00.000Z' },
    { tag: 'session', message: 'created' }
  ]);
  var lines = logReceiver.parseLogBody(body, 'application/json');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /\[boot\] start/);
  assert.match(lines[1], /\[session\] created/);
});

test('createLogReceiverServer: POST /log appends file', function (t, done) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plax-log-'));
  var logFile = path.join(dir, 'tv.log');
  var server = logReceiver.createLogReceiverServer({ logFile: logFile });

  server.listen(0, '127.0.0.1', function () {
    var port = server.address().port;
    var payload = JSON.stringify({ level: 'log', tag: 'test', message: 'hello', ts: '2026-05-29T00:00:00.000Z' });
    var req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: '/log',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, function (res) {
      assert.equal(res.statusCode, 204);
      res.resume();
      res.on('end', function () {
        server.close(function () {
          var text = fs.readFileSync(logFile, 'utf8');
          assert.match(text, /\[test\] hello/);
          fs.rmSync(dir, { recursive: true, force: true });
          done();
        });
      });
    });
    req.on('error', done);
    req.end(payload);
  });
});
