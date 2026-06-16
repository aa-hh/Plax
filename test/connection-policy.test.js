import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankConnections,
  pickBestConnection,
  httpsRankingRejections,
  scoreConnection,
  connectionSchemeLabel
} from '../src/plex/servers/connectionPolicy.js';
import { redactPlexUrl } from '../src/plex/client.js';

var REMOTE_HTTP = {
  uri: 'http://185.203.56.20:17054',
  local: false,
  relay: false,
  protocol: 'http'
};
var REMOTE_HTTPS = {
  uri: 'https://185-203-56-20.abcd1234.plex.direct:17054',
  local: false,
  relay: false,
  protocol: 'https'
};
var LAN_HTTP = {
  uri: 'http://192.168.1.10:32400',
  local: true,
  relay: false,
  protocol: 'http'
};
var LAN_HTTPS = {
  uri: 'https://192-168-1-10.abcd1234.plex.direct:32400',
  local: true,
  relay: false,
  protocol: 'https'
};
var RELAY_HTTPS = {
  uri: 'https://relay.plex.direct:443',
  local: false,
  relay: true,
  protocol: 'https'
};

test('rankConnections prefers HTTPS over HTTP for remote PMS (default prefs)', function () {
  var best = pickBestConnection([REMOTE_HTTP, REMOTE_HTTPS]);
  assert.equal(best.uri, REMOTE_HTTPS.uri);
});

test('rankConnections prefers HTTPS over HTTP on LAN (default prefs)', function () {
  var best = pickBestConnection([LAN_HTTP, LAN_HTTPS]);
  assert.equal(best.uri, LAN_HTTPS.uri);
});

test('rankConnections prefers LAN HTTP when allow insecure is on', function () {
  var best = pickBestConnection(
    [LAN_HTTP, LAN_HTTPS],
    { allowInsecure: true }
  );
  assert.equal(best.uri, LAN_HTTP.uri);
});

test('rankConnections still prefers remote HTTPS when allow insecure is on', function () {
  var best = pickBestConnection(
    [REMOTE_HTTP, REMOTE_HTTPS],
    { allowInsecure: true }
  );
  assert.equal(best.uri, REMOTE_HTTPS.uri);
});

test('rankConnections falls back to HTTP when no HTTPS candidate exists', function () {
  var best = pickBestConnection([REMOTE_HTTP]);
  assert.equal(best.uri, REMOTE_HTTP.uri);
});

test('rankConnections keeps HTTP in list as last resort even when insecure is off', function () {
  var ranked = rankConnections([REMOTE_HTTP, REMOTE_HTTPS]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].uri, REMOTE_HTTPS.uri);
  assert.equal(ranked[1].uri, REMOTE_HTTP.uri);
});

test('rankConnections prefers LAN HTTPS over remote HTTPS', function () {
  var best = pickBestConnection([REMOTE_HTTPS, LAN_HTTPS]);
  assert.equal(best.uri, LAN_HTTPS.uri);
});

test('rankConnections deprioritizes relay below direct remote', function () {
  var ranked = rankConnections([RELAY_HTTPS, REMOTE_HTTPS]);
  assert.equal(ranked[0].uri, REMOTE_HTTPS.uri);
  assert.equal(ranked[1].uri, RELAY_HTTPS.uri);
});

test('httpsRankingRejections empty when HTTPS is ranked first', function () {
  var rejections = httpsRankingRejections([REMOTE_HTTP, REMOTE_HTTPS]);
  assert.equal(rejections.length, 0);
});

test('httpsRankingRejections reports HTTPS when LAN HTTP outranks remote HTTPS', function () {
  var rejections = httpsRankingRejections(
    [LAN_HTTP, REMOTE_HTTPS],
    { preferSecure: false, allowInsecure: true }
  );
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0].conn.uri, REMOTE_HTTPS.uri);
  assert.equal(rejections[0].reason, 'preferSecure disabled');
});

test('scoreConnection penalizes HTTP when allowInsecure is off', function () {
  var httpScore = scoreConnection(REMOTE_HTTP, { allowInsecure: false });
  var httpsScore = scoreConnection(REMOTE_HTTPS, { allowInsecure: false });
  assert.ok(httpsScore > httpScore);
});

test('connectionSchemeLabel detects HTTP and HTTPS URIs', function () {
  assert.equal(connectionSchemeLabel(REMOTE_HTTPS.uri), 'HTTPS');
  assert.equal(connectionSchemeLabel(REMOTE_HTTP.uri), 'HTTP');
  assert.equal(connectionSchemeLabel(''), 'unknown');
  assert.equal(connectionSchemeLabel(null), 'unknown');
});

test('redactPlexUrl strips token from probe URLs', function () {
  var raw = 'https://plex.example/?X-Plex-Token=secret&foo=1';
  var redacted = redactPlexUrl(raw);
  assert.ok(redacted.indexOf('secret') < 0);
  assert.ok(redacted.indexOf('[redacted]') >= 0);
});
