import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  resetPlexDeviceInfoForTest,
  setPlexDeviceInfo
} from '../src/plex/clientIdentity.js';
import { setState } from '../src/core/store.js';

installMinimalDom();

var session = {
  server: { connectionUri: 'http://127.0.0.1:32400' },
  item: { ratingKey: '99', duration: 120000 }
};

var progressCalls = [];
var playerModule;

function mockProgressApi() {
  progressCalls = [];
  playerModule.setProgressApiForTest({
    updateProgress: function (server, ratingKey, ms, state, duration, extra) {
      progressCalls.push({
        ratingKey: ratingKey,
        ms: ms,
        state: state,
        duration: duration,
        extra: extra || {}
      });
      return Promise.resolve();
    },
    markWatched: function () {
      return Promise.resolve();
    }
  });
}

function playingCalls() {
  return progressCalls.filter(function (c) { return c.state === 'playing'; });
}

function fakeTimers() {
  var now = 0;
  var timers = [];
  return {
    setTimeout: function (fn, ms) {
      var id = timers.length + 1;
      timers.push({ id: id, fn: fn, at: now + ms });
      return id;
    },
    clearTimeout: function (id) {
      timers = timers.filter(function (t) { return t.id !== id; });
    },
    tick: function (ms) {
      now += ms;
      var due = timers.filter(function (t) { return t.at <= now; });
      timers = timers.filter(function (t) { return t.at > now; });
      due.forEach(function (t) { t.fn(); });
    }
  };
}

async function loadPlayer() {
  playerModule = await import('../src/playback/playerAdapter.js');
  return playerModule;
}

function setupVideo(overrides) {
  overrides = overrides || {};
  var video = createElement('video');
  video.id = 'native-player';
  video.duration = overrides.duration != null ? overrides.duration : 120;
  video.readyState = overrides.readyState != null ? overrides.readyState : 1;
  video.currentTime = overrides.currentTime != null ? overrides.currentTime : 0;
  video.paused = overrides.paused != null ? overrides.paused : true;
  video.textTracks = [];
  video.addTextTrack = function (kind, label, language) {
    var track = {
      kind: kind,
      label: label,
      language: language,
      mode: 'disabled',
      cues: [],
      addCue: function (cue) { track.cues.push(cue); },
      removeCue: function (cue) {
        track.cues = track.cues.filter(function (candidate) { return candidate !== cue; });
      }
    };
    video.textTracks.push(track);
    return track;
  };
  document.body.children.length = 0;
  document.body.appendChild(video);
  if (document.registerPlayer) document.registerPlayer(video);
  return video;
}

function createFakeHls() {
  function FakeHls(config) {
    this.config = config || {};
    this.handlers = {};
    this.destroyed = false;
    FakeHls.instances.push(this);
  }
  FakeHls.instances = [];
  FakeHls.Events = {
    MEDIA_ATTACHED: 'MEDIA_ATTACHED',
    MANIFEST_PARSED: 'MANIFEST_PARSED',
    ERROR: 'ERROR'
  };
  FakeHls.ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError'
  };
  FakeHls.isSupported = function () { return true; };
  FakeHls.prototype.on = function (event, handler) {
    this.handlers[event] = handler;
  };
  FakeHls.prototype.attachMedia = function (media) {
    this.media = media;
    if (this.handlers[FakeHls.Events.MEDIA_ATTACHED]) {
      this.handlers[FakeHls.Events.MEDIA_ATTACHED]();
    }
  };
  FakeHls.prototype.loadSource = function (url) {
    this.source = url;
  };
  FakeHls.prototype.destroy = function () {
    this.destroyed = true;
  };
  return FakeHls;
}

test.beforeEach(async function () {
  setupVideo();
  await loadPlayer();
  mockProgressApi();
  playerModule.init();
  playerModule.clearListeners();
});

test.afterEach(function () {
  if (playerModule) {
    playerModule.stop({ skipTimeline: true });
    playerModule.clearListeners();
    playerModule.setProgressApiForTest(null);
    playerModule.setRebufferTimersForTest(null);
    playerModule.setHlsPlayerForTest(null);
  }
  resetPlexDeviceInfoForTest();
  delete globalThis.PalmSystem;
  delete globalThis.webOS;
});

test('play defers first playing timeline until playing event', async function () {
  var video = playerModule.getVideoElement();
  video.currentTime = 0;
  playerModule.play('http://127.0.0.1/video.mkv', session);

  assert.equal(playingCalls().length, 0);

  video.dispatchEvent('playing');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 1);
  assert.equal(playingCalls()[0].ratingKey, '99');
});

test('play logs stream type with mode and redacted url', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.slice.call(arguments));
  };
  try {
    playerModule.play(
      'http://127.0.0.1/video.m3u8?X-Plex-Token=abc123&path=%2Flibrary%2Fparts%2F1%2Ffile.mkv&protocol=hls&offset=60',
      session,
      { mode: 'transcode-hls' }
    );
  } finally {
    console.info = origInfo;
  }

  var streamLog = logs.filter(function (entry) {
    return typeof entry[0] === 'string' && entry[0].indexOf('[playback] stream type: pure-transcode') === 0;
  })[0];
  assert.ok(streamLog, 'stream type log should be emitted');
  var streamLine = streamLog.join(' ');
  assert.match(streamLine, /^\[playback\] stream type: pure-transcode \(mode=transcode-hls, url=/);
  assert.ok(streamLine.indexOf('abc123') < 0);
  assert.ok(streamLine.indexOf('X-Plex-Token=%5Bredacted%5D') >= 0);

  var paramsEntry = logs.filter(function (entry) { return entry[0] === '[playback] params:'; })[0];
  assert.ok(paramsEntry, 'transcode params log should be emitted');
  var params = paramsEntry[1];
  assert.equal(params.path, '/library/parts/1/file.mkv');
  assert.equal(params.protocol, 'hls');
  assert.equal(params.offset, '60');
  assert.ok(!('X-Plex-Token' in params), 'params log must not leak token');

  assert.ok(logs.some(function (entry) {
    return entry.join(' ') === '[playback] connection: HTTP';
  }));
});

test('play logs connection scheme from HTTPS playback URL', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  try {
    playerModule.play('https://plex.example/video.m3u8', session, { mode: 'direct' });
  } finally {
    console.info = origInfo;
  }
  assert.ok(logs.some(function (line) { return line === '[playback] connection: HTTPS'; }));
});

test('play logs connection scheme from server when URL has no scheme', function () {
  var logs = [];
  var origInfo = console.info;
  console.info = function () {
    logs.push(Array.prototype.join.call(arguments, ' '));
  };
  var httpsSession = {
    server: {
      connectionUri: 'https://plex.example:32400',
      activeConnection: { uri: 'https://plex.example:32400', local: false }
    },
    item: session.item
  };
  try {
    playerModule.play('/library/metadata/1/file.mkv', httpsSession, { mode: 'direct' });
  } finally {
    console.info = origInfo;
  }
  assert.ok(logs.some(function (line) { return line === '[playback] connection: HTTPS'; }));
});

test('play uses hls.js for browser HLS compatibility', function () {
  var FakeHls = createFakeHls();
  var video = playerModule.getVideoElement();
  playerModule.setHlsPlayerForTest(FakeHls);

  playerModule.play('http://127.0.0.1/video.m3u8?X-Plex-Token=abc123', session, { mode: 'transcode-hls' });

  assert.equal(FakeHls.instances.length, 1);
  assert.equal(FakeHls.instances[0].media, video);
  assert.equal(FakeHls.instances[0].source, 'http://127.0.0.1/video.m3u8?X-Plex-Token=abc123');
  assert.equal(video.src, '');
});

test('play sets Plex auth headers on hls.js requests', function () {
  var FakeHls = createFakeHls();
  playerModule.setHlsPlayerForTest(FakeHls);
  var plexSession = {
    server: {
      connectionUri: 'http://127.0.0.1:32400',
      accessToken: 'server-token'
    },
    item: { ratingKey: '99', duration: 120000 }
  };
  playerModule.play(
    'http://127.0.0.1/video.m3u8?X-Plex-Token=query-token&session=plax-session',
    plexSession,
    { mode: 'transcode-hls' }
  );
  var inst = FakeHls.instances[0];
  assert.ok(inst);
  assert.equal(typeof inst.config.xhrSetup, 'function');
  var reqHeaders = {};
  var xhr = {
    setRequestHeader: function (k, v) { reqHeaders[k] = v; }
  };
  inst.config.xhrSetup(xhr);
  assert.equal(reqHeaders['X-Plex-Token'], 'query-token');
  assert.equal(reqHeaders['X-Plex-Session-Identifier'], 'plax-session');
});

test('play uses hls.js for H.264 transcode fallback on webOS 4 TV', function () {
  var FakeHls = createFakeHls();
  var video = playerModule.getVideoElement();
  playerModule.setHlsPlayerForTest(FakeHls);
  globalThis.PalmSystem = { identifier: 'com.webos.app.plax' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B9PUA', version: '4.9.0' });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B9PUA', version: '4.9.0' });

  playerModule.play('http://127.0.0.1/video.m3u8', session, { mode: 'transcode-hls' });

  assert.equal(FakeHls.instances.length, 1);
  assert.equal(video.querySelector('source'), null);
});

test('play uses native source mediaOption for direct play on webOS 4', function () {
  var FakeHls = createFakeHls();
  var video = playerModule.getVideoElement();
  playerModule.setHlsPlayerForTest(FakeHls);
  globalThis.PalmSystem = { identifier: 'com.webos.app.plax' };
  globalThis.webOS = {
    platform: { tv: true },
    deviceInfo: function (cb) {
      cb({ modelName: 'OLED55B8LLA', version: '4.4.0', uhd: true });
    }
  };
  setPlexDeviceInfo({ modelName: 'OLED55B8LLA', version: '4.4.0' });
  setState({ deviceInfo: { uhd: true, hdr10: true, dolbyVision: true } });

  playerModule.play('http://127.0.0.1/video.mkv', session, { mode: 'direct' });

  assert.equal(FakeHls.instances.length, 0);
  var source = video.querySelector('source');
  assert.ok(source);
  assert.equal(source.getAttribute('src'), 'http://127.0.0.1/video.mkv');
  var typeAttr = source.getAttribute('type') || '';
  assert.ok(typeAttr.indexOf('mediaOption=') >= 0);
  assert.ok(typeAttr.indexOf('3840') >= 0);
});

test('timeupdate at zero does not sync playing before progress', async function () {
  var video = playerModule.getVideoElement();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  video.currentTime = 0;
  video.dispatchEvent('timeupdate');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 0);
});

test('timeupdate with currentTime > 0 syncs initial playing timeline', async function () {
  var video = playerModule.getVideoElement();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  video.currentTime = 5;
  video.dispatchEvent('timeupdate');
  await new Promise(function (resolve) { setImmediate(resolve); });

  assert.equal(playingCalls().length, 1);
  assert.equal(playingCalls()[0].ms, 5000);
});

test('stop teardown order clears src before load and nulls session', async function () {
  var video = playerModule.getVideoElement();
  var order = [];
  var origRemove = video.removeAttribute.bind(video);
  var origLoad = video.load.bind(video);
  video.removeAttribute = function (name) {
    order.push('removeAttribute:' + name);
    return origRemove(name);
  };
  video.load = function () {
    order.push('load');
    return origLoad();
  };

  playerModule.play('http://127.0.0.1/video.mkv', session);
  order.length = 0;
  video.currentTime = 30;
  playerModule.stop();

  assert.deepEqual(order, ['removeAttribute:src', 'load']);
  assert.equal(video.src, '');
  assert.ok(video.classList.contains('hidden'));

  progressCalls.length = 0;
  await playerModule.flushProgress('stopped');
  assert.equal(progressCalls.length, 0);
});

test('stop sends stopped timeline when session present', async function () {
  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.getVideoElement().currentTime = 45;
  progressCalls.length = 0;

  playerModule.stop();
  await new Promise(function (resolve) { setImmediate(resolve); });

  var stopped = progressCalls.filter(function (c) { return c.state === 'stopped'; });
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].ms, 45000);
});

test('flushProgress integrates timeline flush with injectable updateProgress', async function () {
  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();
  video.currentTime = 60;
  progressCalls.length = 0;

  await playerModule.flushProgress('stopped');

  assert.equal(progressCalls.length, 1);
  assert.equal(progressCalls[0].state, 'stopped');
  assert.equal(progressCalls[0].ms, 60000);
});

test('rebufferFired resets when buffering clears; watchdog fires onRebufferTimeout', function () {
  var clock = fakeTimers();
  playerModule.setRebufferTimersForTest(clock);

  var timeouts = 0;
  playerModule.onRebufferTimeout(function () {
    timeouts += 1;
  });

  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();
  video.dispatchEvent('waiting');

  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 1);

  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 1);

  video.dispatchEvent('playing');
  video.dispatchEvent('waiting');
  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 2);
});

test('rebuffer watchdog does not fire when buffering cleared before timeout', function () {
  var clock = fakeTimers();
  playerModule.setRebufferTimersForTest(clock);

  var timeouts = 0;
  playerModule.onRebufferTimeout(function () {
    timeouts += 1;
  });

  playerModule.play('http://127.0.0.1/video.mkv', session);
  var video = playerModule.getVideoElement();

  video.dispatchEvent('canplay');
  clock.tick(playerModule.REBUFFER_TIMEOUT_MS);
  assert.equal(timeouts, 0);
});

test('seek replaces pending loadedmetadata listener (no stack)', function () {
  var video = setupVideo({ readyState: 0, duration: 0 });
  playerModule.init();

  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.seek(10);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  playerModule.seek(20);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  video.readyState = 1;
  video.duration = 120;
  video.dispatchEvent('loadedmetadata');
  assert.equal(Math.floor(video.currentTime), 20);
});

test('getCurrentTimeMs retains position after stop teardown', function () {
  var video = setupVideo({ currentTime: 42.5 });
  playerModule.init();
  playerModule.play('http://127.0.0.1/video.mkv', session, { offset: 0 });
  assert.equal(playerModule.getCurrentTimeMs(), 42500);
  playerModule.stop({ skipTimeline: true });
  assert.equal(playerModule.getCurrentTimeMs(), 42500);
});

test('getCurrentTimeMs adds stream base offset for transcode URL offset', function () {
  var url = 'http://127.0.0.1/video.m3u8?offset=60000';
  playerModule.play(url, session, { offset: 60000, mode: 'transcode-hls' });
  var video = playerModule.getVideoElement();
  assert.equal(playerModule.getCurrentTimeMs(), 60000);
  video.currentTime = 5;
  assert.equal(playerModule.getCurrentTimeMs(), 65000);
});

test('getCurrentTimeMs keeps last position when element currentTime resets on resume', function () {
  var url = 'http://127.0.0.1/video.m3u8?offset=60000';
  playerModule.play(url, session, { offset: 60000, mode: 'transcode-hls' });
  var video = playerModule.getVideoElement();
  video.currentTime = 12;
  assert.equal(playerModule.getCurrentTimeMs(), 72000);
  video.currentTime = 0;
  assert.equal(playerModule.getCurrentTimeMs(), 72000);
});

test('seekMs maps absolute media position to relative element time for transcode offset', function () {
  var url = 'http://127.0.0.1/video.m3u8?offset=60000';
  var video = playerModule.getVideoElement();
  video.duration = 3600;
  video.readyState = 1;
  playerModule.play(url, session, { offset: 60000, mode: 'transcode-hls' });
  playerModule.seekMs(90000);
  assert.equal(Math.floor(video.currentTime), 30);
});

test('getCurrentTimeMs avoids double offset when hls.js timeline already absolute', function () {
  var FakeHls = createFakeHls();
  playerModule.setHlsPlayerForTest(FakeHls);
  playerModule.play('http://127.0.0.1/video.m3u8?offset=2061000', session, {
    offset: 2061000,
    mode: 'transcode-hls'
  });
  var video = playerModule.getVideoElement();
  video.currentTime = 2062;
  assert.equal(playerModule.getCurrentTimeMs(), 2062000);
});

test('scrobble resets after seek back below threshold', async function () {
  var markCount = 0;
  playerModule.setProgressApiForTest({
    updateProgress: function () {
      return Promise.resolve();
    },
    markWatched: function () {
      markCount += 1;
      return Promise.resolve();
    }
  });

  var video = setupVideo({ currentTime: 93, duration: 100, paused: false });
  playerModule.init();
  playerModule.play('http://127.0.0.1/video.mkv', session);

  await playerModule.flushProgress('playing');
  assert.equal(markCount, 1);

  video.currentTime = 50;
  await playerModule.flushProgress('playing');
  assert.equal(markCount, 1);

  video.currentTime = 94;
  await playerModule.flushProgress('playing');
  assert.equal(markCount, 2);
});

test('stop cancels pending seek listener', function () {
  var video = setupVideo({ readyState: 0, duration: 0 });
  playerModule.init();

  playerModule.play('http://127.0.0.1/video.mkv', session);
  playerModule.seek(15);
  assert.equal(video.getListenerCount('loadedmetadata'), 1);

  playerModule.stop({ skipTimeline: true });
  assert.equal(video.getListenerCount('loadedmetadata'), 0);
});

test('loadClientSubtitleFromUrls renders WebVTT cues from fetch text', async function () {
  var savedFetch = globalThis.fetch;
  globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  };
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: function () {
        return Promise.resolve('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello from Plex');
      }
    });
  };
  try {
    await playerModule.loadClientSubtitleFromUrls(['http://plex.local/subtitles.vtt'], 500);
    var track = playerModule.getVideoElement().textTracks[0];
    assert.equal(track.mode, 'showing');
    assert.equal(track.cues.length, 1);
    assert.equal(track.cues[0].startTime, 1.5);
    assert.equal(track.cues[0].text, 'Hello from Plex');
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = savedFetch;
  }
});

test('loadClientSubtitleFromUrls advances after timed-out first attempt', async function () {
  var savedXhr = globalThis.XMLHttpRequest;
  var call = 0;
  globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  };
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    var self = this;
    this.status = 0;
    this.responseText = '';
    this.open = function () {};
    this.setRequestHeader = function () {};
    this.send = function () {
      call += 1;
      if (call === 1) {
        setTimeout(function () {
          if (self.ontimeout) self.ontimeout();
        }, 0);
        return;
      }
      self.status = 200;
      self.responseText = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
      setTimeout(function () {
        if (self.onload) self.onload();
      }, 0);
    };
  };
  try {
    await playerModule.loadClientSubtitleFromUrls([
      { label: 'first-hang', url: 'http://plex.local/subtitles-hang' },
      { label: 'second-ok', url: 'http://plex.local/subtitles-ok' }
    ], 0);
    assert.equal(call, 2);
    assert.equal(playerModule.hasClientSubtitlesLoaded(), true);
  } finally {
    if (savedXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = savedXhr;
  }
});

test('loadClientSubtitleFromUrls advances after HTTP 404 on first attempt', async function () {
  var savedXhr = globalThis.XMLHttpRequest;
  var call = 0;
  globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  };
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    var self = this;
    this.status = 0;
    this.responseText = '';
    this.open = function () {};
    this.setRequestHeader = function () {};
    this.send = function () {
      call += 1;
      if (call === 1) {
        self.status = 404;
        self.responseText = 'Not found';
        setTimeout(function () {
          if (self.onload) self.onload();
        }, 0);
        return;
      }
      self.status = 200;
      self.responseText = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello';
      setTimeout(function () {
        if (self.onload) self.onload();
      }, 0);
    };
  };
  try {
    await playerModule.loadClientSubtitleFromUrls([
      { label: 'first-404', url: 'http://plex.local/subtitles-miss' },
      { label: 'second-ok', url: 'http://plex.local/subtitles-ok' }
    ], 0);
    assert.equal(call, 2);
    assert.equal(playerModule.hasClientSubtitlesLoaded(), true);
  } finally {
    if (savedXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = savedXhr;
  }
});

test('loadClientSubtitleFromUrls salvages chunked WebVTT responseText after fetch failure', async function () {
  var savedFetch = globalThis.fetch;
  var savedXhr = globalThis.XMLHttpRequest;
  var xhrHeaders = {};
  globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  };
  globalThis.fetch = function () {
    return Promise.reject(new TypeError('Failed to fetch'));
  };
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    this.status = 200;
    this.responseText = 'WEBVTT\n\n00:00:04.000 --> 00:00:05.000\nRecovered cue';
    this.open = function (method, url) {
      this.method = method;
      this.url = url;
    };
    this.setRequestHeader = function (key, value) {
      xhrHeaders[key] = value;
    };
    this.send = function () {
      this.onerror();
    };
  };
  try {
    await playerModule.loadClientSubtitleFromUrls([{
      label: 'universal-metadata-auto',
      url: 'http://plex.local/video/:/transcode/universal/subtitles',
      init: { headers: { Accept: 'text/vtt', 'X-Plex-Session-Identifier': 'plax-test' } }
    }], 0);
    var track = playerModule.getVideoElement().textTracks[0];
    assert.equal(track.mode, 'showing');
    assert.equal(track.cues.length, 1);
    assert.equal(track.cues[0].startTime, 4);
    assert.equal(track.cues[0].text, 'Recovered cue');
    assert.equal(xhrHeaders.Accept, 'text/vtt');
    assert.equal(xhrHeaders['X-Plex-Session-Identifier'], 'plax-test');
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = savedFetch;
    if (savedXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = savedXhr;
  }
});

test('loadClientSubtitleFromUrls follows manifest hop to subtitle text', async function () {
  var savedXhr = globalThis.XMLHttpRequest;
  var requests = [];
  globalThis.VTTCue = globalThis.VTTCue || function VTTCue(startTime, endTime, text) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.text = text;
  };
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    var self = this;
    this.status = 0;
    this.responseText = '';
    this.open = function (_method, url) {
      self.url = url;
      requests.push(url);
    };
    this.setRequestHeader = function () {};
    this.send = function () {
      if (String(self.url).indexOf('/video/:/transcode/universal/subtitles') >= 0) {
        self.status = 200;
        self.responseText =
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="session/subs-1.vtt"\n' +
          '#EXT-X-STREAM-INF:BANDWIDTH=1,SUBTITLES="subs"\n' +
          'session/video-1.m3u8';
      } else {
        self.status = 200;
        self.responseText = 'WEBVTT\n\n00:00:02.000 --> 00:00:03.000\nManifest subtitle';
      }
      setTimeout(function () {
        if (self.onload) self.onload();
      }, 0);
    };
  };
  try {
    await playerModule.loadClientSubtitleFromUrls([{
      label: 'universal-metadata-auto',
      url: 'http://plex.local/video/:/transcode/universal/subtitles'
    }], 0);
    var track = playerModule.getVideoElement().textTracks[0];
    assert.equal(track.mode, 'showing');
    assert.equal(track.cues.length, 1);
    assert.equal(track.cues[0].startTime, 2);
    assert.equal(track.cues[0].text, 'Manifest subtitle');
    assert.equal(requests.length, 2);
    assert.equal(requests[1], 'http://plex.local/video/:/transcode/universal/session/subs-1.vtt');
  } finally {
    if (savedXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = savedXhr;
  }
});

test('loadClientSubtitleFromUrls does not follow video variant manifest entries', async function () {
  var savedXhr = globalThis.XMLHttpRequest;
  var requests = [];
  globalThis.XMLHttpRequest = function XMLHttpRequest() {
    var self = this;
    this.status = 0;
    this.responseText = '';
    this.open = function (_method, url) {
      self.url = url;
      requests.push(url);
    };
    this.setRequestHeader = function () {};
    this.send = function () {
      self.status = 200;
      self.responseText = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nsession/video-1.m3u8';
      setTimeout(function () {
        if (self.onload) self.onload();
      }, 0);
    };
  };
  try {
    await assert.rejects(function () {
      return playerModule.loadClientSubtitleFromUrls([{
        label: 'universal-metadata-auto',
        url: 'http://plex.local/video/:/transcode/universal/subtitles'
      }], 0);
    }, /Subtitle file had no parseable cues/);
    assert.equal(requests.length, 1);
  } finally {
    if (savedXhr === undefined) delete globalThis.XMLHttpRequest;
    else globalThis.XMLHttpRequest = savedXhr;
  }
});

test('serializeTimeRanges helper limits output to three ranges', function () {
  var ranges = {
    length: 5,
    start: function (index) { return index * 10; },
    end: function (index) { return (index * 10) + 5; }
  };
  var out = playerModule.__serializeTimeRangesForTest(ranges, 3);
  assert.deepEqual(out, [
    { start: 0, end: 5 },
    { start: 10, end: 15 },
    { start: 20, end: 25 }
  ]);
});

test('truncatePlaybackString helper bounds long strings', function () {
  var truncated = playerModule.__truncatePlaybackStringForTest('abcdefghijklmnopqrstuvwxyz', 10);
  assert.equal(truncated, 'abcdefg...');
  assert.equal(playerModule.__truncatePlaybackStringForTest('short', 10), 'short');
});
