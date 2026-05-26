import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from './helpers/minimal-dom.js';

import {
  PROBE_BYTES,
  MIN_PROBE_BYTES,
  readCappedResponseBody,
  isAcceptableProbeStatus,
  measurePartDownload,
  createNetworkProbeController,
  cancelNetworkProbe,
  startNetworkProbeIfNeeded,
  setPlaybackActive
} from '../src/playback/networkProbe.js';

var testServer = {
  connectionUri: 'http://127.0.0.1:32400',
  accessToken: 'probe-test-token',
  clientIdentifier: 'xplay-test'
};
var testPartKey = '/library/parts/1/file.mkv';

function streamResponse(chunks, status, headers) {
  var stream = new ReadableStream({
    start: function (controller) {
      var i;
      for (i = 0; i < chunks.length; i++) {
        controller.enqueue(chunks[i]);
      }
      controller.close();
    }
  });
  return new Response(stream, { status: status || 200, headers: headers || {} });
}

test('isAcceptableProbeStatus accepts 206 and 200 only', function () {
  assert.equal(isAcceptableProbeStatus(206), true);
  assert.equal(isAcceptableProbeStatus(200), true);
  assert.equal(isAcceptableProbeStatus(416), false);
  assert.equal(isAcceptableProbeStatus(404), false);
});

test('readCappedResponseBody returns small bodies unchanged', async function () {
  var payload = new Uint8Array(MIN_PROBE_BYTES);
  var res = streamResponse([payload]);
  var buf = await readCappedResponseBody(res, PROBE_BYTES);
  assert.equal(buf.byteLength, MIN_PROBE_BYTES);
});

test('readCappedResponseBody caps oversized streams', async function () {
  var cap = 8192;
  var chunkA = new Uint8Array(cap);
  var chunkB = new Uint8Array(cap);
  var res = streamResponse([chunkA, chunkB]);
  var buf = await readCappedResponseBody(res, cap);
  assert.equal(buf.byteLength, cap);
});

test('readCappedResponseBody stops at exact cap across chunks', async function () {
  var cap = 6000;
  var chunkA = new Uint8Array(4000);
  var chunkB = new Uint8Array(4000);
  var res = streamResponse([chunkA, chunkB]);
  var buf = await readCappedResponseBody(res, cap);
  assert.equal(buf.byteLength, cap);
});

test('readCappedResponseBody rejects non-streamable responses', async function () {
  var res = { body: null };
  await assert.rejects(
    readCappedResponseBody(res, PROBE_BYTES),
    /not streamable/
  );
});

test('measurePartDownload is deferred while playback is active', async function () {
  setPlaybackActive(true);
  await assert.rejects(
    measurePartDownload(testServer, testPartKey),
    /deferred during playback/
  );
  setPlaybackActive(false);
});

test('measurePartDownload accepts HTTP 206 and caps read size', async function () {
  var originalFetch = globalThis.fetch;
  var payload = new Uint8Array(MIN_PROBE_BYTES + 1024);
  globalThis.fetch = function (url, opts) {
    assert.match(String(url), /127\.0\.0\.1:32400/);
    assert.equal(opts.method, 'GET');
    assert.match(opts.headers.Range, /^bytes=0-/);
    return Promise.resolve(new Response(payload, {
      status: 206,
      headers: { 'Content-Length': String(payload.byteLength) }
    }));
  };
  try {
    var result = await measurePartDownload(testServer, testPartKey, {
      forceProbe: true,
      timeoutMs: 5000
    });
    assert.ok(result.measuredMbps > 0);
    assert.equal(result.bytesRead, payload.byteLength);
    assert.ok(result.bytesRead <= PROBE_BYTES);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('measurePartDownload rejects HTTP 200 when Content-Length exceeds probe cap', async function () {
  var originalFetch = globalThis.fetch;
  globalThis.fetch = function () {
    return Promise.resolve(new Response(new Uint8Array(8), {
      status: 200,
      headers: { 'Content-Length': String(PROBE_BYTES + 1) }
    }));
  };
  try {
    await assert.rejects(
      measurePartDownload(testServer, testPartKey, { forceProbe: true, timeoutMs: 5000 }),
      /ignored Range/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('measurePartDownload rejects unacceptable HTTP status', async function () {
  var originalFetch = globalThis.fetch;
  globalThis.fetch = function () {
    return Promise.resolve(new Response(null, { status: 404 }));
  };
  try {
    await assert.rejects(
      measurePartDownload(testServer, testPartKey, { forceProbe: true, timeoutMs: 5000 }),
      /HTTP 404/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function stallAfterFirstChunk(firstByteLength) {
  var stallResolve;
  var stall = new Promise(function (resolve) {
    stallResolve = resolve;
  });
  var releasedFirst = false;
  var stream = new ReadableStream({
    pull: function (controller) {
      if (!releasedFirst) {
        releasedFirst = true;
        controller.enqueue(new Uint8Array(firstByteLength));
        return stall;
      }
      controller.close();
    }
  });
  return {
    response: new Response(stream, { status: 206 }),
    release: function () {
      if (stallResolve) stallResolve();
    }
  };
}

test('readCappedResponseBody rejects when signal aborted mid-read', async function () {
  var controller = new AbortController();
  var stalled = stallAfterFirstChunk(4096);
  var readPromise = readCappedResponseBody(stalled.response, PROBE_BYTES, controller.signal);
  await new Promise(function (resolve) { setTimeout(resolve, 10); });
  controller.abort();
  await assert.rejects(readPromise, /cancelled/);
  stalled.release();
});

test('measurePartDownload rejects cancelled when signal aborted before fetch', async function () {
  var controller = createNetworkProbeController();
  controller.cancel();
  await assert.rejects(
    measurePartDownload(testServer, testPartKey, {
      forceProbe: true,
      timeoutMs: 5000,
      signal: controller.signal,
      isCancelled: controller.isCancelled
    }),
    /cancelled/
  );
});

test('measurePartDownload aborts in-flight fetch and read on cancel', async function () {
  var originalFetch = globalThis.fetch;
  var controller = createNetworkProbeController();
  var fetchAborted = false;
  var stalled;

  globalThis.fetch = function (url, opts) {
    assert.ok(opts.signal, 'fetch should receive abort signal');
    opts.signal.addEventListener('abort', function () {
      fetchAborted = true;
    });
    stalled = stallAfterFirstChunk(4096);
    return Promise.resolve(stalled.response);
  };

  try {
    var probePromise = measurePartDownload(testServer, testPartKey, {
      forceProbe: true,
      timeoutMs: 5000,
      signal: controller.signal,
      isCancelled: controller.isCancelled
    });
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    controller.cancel();
    await assert.rejects(probePromise, /cancelled/);
    assert.equal(fetchAborted, true);
  } finally {
    if (stalled) stalled.release();
    globalThis.fetch = originalFetch;
    cancelNetworkProbe();
  }
});

test('setPlaybackActive(true) cancels active item probe download', async function () {
  installMinimalDom();
  var originalFetch = globalThis.fetch;
  var stalled;

  globalThis.fetch = function (url, opts) {
    assert.ok(opts.signal, 'fetch should receive abort signal');
    stalled = stallAfterFirstChunk(4096);
    return Promise.resolve(stalled.response);
  };

  try {
    setPlaybackActive(false);
    var probePromise = startNetworkProbeIfNeeded(testServer, {
      force: true,
      item: { ratingKey: '99', title: 'Probe item', type: 'movie' },
      version: {
        id: 'v1',
        partKey: testPartKey,
        bitrate: 8000,
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mp4'
      },
      deviceInfo: { uhd: false, modelName: 'TestTV' }
    });
    await new Promise(function (resolve) { setTimeout(resolve, 20); });
    setPlaybackActive(true);
    var result = await probePromise;
    assert.equal(result, null);
    setPlaybackActive(false);
  } finally {
    if (stalled) stalled.release();
    globalThis.fetch = originalFetch;
    cancelNetworkProbe();
  }
});
