import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankConnections,
  pickBestConnection
} from '../src/plex/servers/connectionPolicy.js';

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

test('rankConnections still prefers HTTPS when "Allow insecure" toggle is on', function () {
  var best = pickBestConnection(
    [LAN_HTTP, LAN_HTTPS],
    { allowInsecure: true }
  );
  assert.equal(best.uri, LAN_HTTPS.uri);
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
