import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectHubPrefetchPosterUrls,
  warmHubPrefetchPosters,
  waitForPosterUrls,
  prefetchPosterUrls,
  clearPosterUrlMaps
} from '../src/ui/posterImages.js';
import { DEFAULT_POSTER_WARM } from '../src/core/appBootstrap.js';

function installMockImage(onAssign) {
  var originalImage = global.Image;
  global.Image = function MockImage() {
    var img = {
      complete: false,
      naturalWidth: 0,
      decoding: '',
      loading: '',
      dataset: Object.create(null),
      onload: null,
      onerror: null,
      _src: '',
      getAttribute: function (name) {
        if (name === 'src') return img._src || null;
        return null;
      },
      setAttribute: function (name, value) {
        if (name === 'src') img._src = value;
      },
      removeAttribute: function () {},
      classList: { add: function () {}, remove: function () {} },
      addEventListener: function () {}
    };
    Object.defineProperty(img, 'src', {
      get: function () { return img._src || ''; },
      set: function (value) {
        img._src = value;
        if (onAssign) onAssign(img, value);
      }
    });
    return img;
  };
  return function restore() {
    global.Image = originalImage;
  };
}

test('collectHubPrefetchPosterUrls sizes row thumbs for first two hub rows', function () {
  var hubPrefetchResult = {
    rows: [
      {
        items: [
          { type: 'movie', thumb: 'https://plex.example/m1?width=300&height=450' },
          { type: 'show', thumb: 'https://plex.example/s1?width=300&height=450' }
        ]
      },
      {
        items: [
          { type: 'movie', thumb: 'https://plex.example/m2?width=300&height=450' }
        ]
      }
    ]
  };
  var urls = collectHubPrefetchPosterUrls(hubPrefetchResult, { perRow: 12, maxRows: 2 });
  assert.equal(urls.length, 3);
  assert.match(urls[0], /width=210/);
  assert.match(urls[0], /height=315/);
});

test('collectHubPrefetchPosterUrls dedupes and caps maxUrls', function () {
  var shared = 'https://plex.example/shared?width=300';
  var hubPrefetchResult = {
    rows: [{
      items: [
        { thumb: shared },
        { thumb: 'https://plex.example/other?width=300' },
        { thumb: shared }
      ]
    }]
  };
  var urls = collectHubPrefetchPosterUrls(hubPrefetchResult, { maxUrls: 2, perRow: 12 });
  assert.equal(urls.length, 2);
});

test('warmHubPrefetchPosters waits for all targeted URLs by default', function () {
  clearPosterUrlMaps();
  var restore = installMockImage(function (img) {
    setTimeout(function () {
      img.complete = true;
      img.naturalWidth = 180;
      if (typeof img.onload === 'function') img.onload();
    }, 0);
  });

  var hubPrefetchResult = {
    rows: [{
      items: [
        { thumb: 'https://plex.example/a?width=300' },
        { thumb: 'https://plex.example/b?width=300' }
      ]
    }]
  };

  return warmHubPrefetchPosters(hubPrefetchResult, {
    maxUrls: 2,
    timeoutMs: 5000
  }).then(function (result) {
    assert.equal(result.urls.length, 2);
    assert.equal(result.warmed, 2);
    assert.equal(result.complete, true);
  }).finally(function () {
    restore();
    clearPosterUrlMaps();
  });
});

test('waitForPosterUrls rejects on timeout when failOnTimeout and requireAll', function () {
  clearPosterUrlMaps();
  var urls = ['https://plex.example/slow?width=300'];
  return waitForPosterUrls(urls, {
    requireAll: true,
    failOnTimeout: true,
    timeoutMs: 50
  }).then(function () {
    assert.fail('expected timeout rejection');
  }).catch(function (err) {
    assert.match(err.message, /Artwork load timed out \(0\/1\)/);
  }).finally(function () {
    clearPosterUrlMaps();
  });
});

test('waitForPosterUrls reports progress while loading', function () {
  clearPosterUrlMaps();
  var restore = installMockImage(function (img, value) {
    if (value.indexOf('a?') >= 0) {
      setTimeout(function () {
        img.complete = true;
        img.naturalWidth = 180;
        if (typeof img.onload === 'function') img.onload();
      }, 0);
    }
  });
  var progress = [];

  var urls = ['https://plex.example/a?width=300', 'https://plex.example/b?width=300'];
  prefetchPosterUrls(urls);

  return waitForPosterUrls(urls, {
    requireAll: false,
    minReady: 1,
    timeoutMs: 2000,
    onProgress: function (loaded, total) {
      progress.push(loaded + '/' + total);
    }
  }).then(function () {
    assert.equal(progress.length >= 1, true);
    assert.equal(progress.some(function (entry) { return entry === '1/2'; }), true);
  }).finally(function () {
    restore();
    clearPosterUrlMaps();
  });
});

test('appBootstrap poster warm defaults require full visible window', function () {
  assert.equal(DEFAULT_POSTER_WARM.maxUrls, 16);
  assert.equal(DEFAULT_POSTER_WARM.perRow, 8);
  assert.equal(DEFAULT_POSTER_WARM.requireAll, true);
  assert.equal(DEFAULT_POSTER_WARM.failOnTimeout, true);
  assert.equal(DEFAULT_POSTER_WARM.timeoutMs, 90000);
});

test('appBootstrap shows artwork progress before opening Home', function () {
  var src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../src/core/appBootstrap.js'),
    'utf8'
  );
  assert.match(src, /Loading artwork… \(\' \+ loaded \+ '\/' \+ total \+ '\)'/);
  assert.match(src, /warmResult\.complete/);
  assert.match(src, /Artwork did not finish loading/);
});
