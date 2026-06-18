/**
 * Lightweight runtime telemetry for webOS TV performance sessions.
 * Enabled only when:
 *  - URL contains ?perf=1, or
 *  - localStorage.plax_perf_enabled === "1"
 */

var enabled = false;
var sampleTimer = null;
var samples = [];
var marks = [];
var MAX_SAMPLES = 720; // ~1 hour at 5s interval
var SAMPLE_INTERVAL_MS = 5000;

function canUsePerformance() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function';
}

function nowMs() {
  return canUsePerformance() ? Math.round(performance.now()) : Date.now();
}

function shouldEnable() {
  try {
    if (window.location && window.location.search && window.location.search.indexOf('perf=1') >= 0) {
      return true;
    }
    return localStorage.getItem('plax_perf_enabled') === '1';
  } catch (e) {
    return false;
  }
}

function pushBounded(arr, value) {
  arr.push(value);
  if (arr.length > MAX_SAMPLES) arr.shift();
}

function getHeapUsage() {
  var m = performance && performance.memory;
  if (!m) return null;
  return {
    used: Math.round(m.usedJSHeapSize / 1024 / 1024),
    total: Math.round(m.totalJSHeapSize / 1024 / 1024),
    limit: Math.round(m.jsHeapSizeLimit / 1024 / 1024)
  };
}

function getVideoStats() {
  var video = document.getElementById('native-player');
  if (!video) return null;
  var stats = {
    paused: !!video.paused,
    currentTimeSec: Math.floor(video.currentTime || 0),
    readyState: video.readyState,
    networkState: video.networkState,
    playbackRate: video.playbackRate
  };
  try {
    if (video.buffered && video.buffered.length > 0) {
      var end = video.buffered.end(video.buffered.length - 1);
      stats.bufferAheadSec = Math.max(0, Math.round((end - video.currentTime) * 10) / 10);
    }
  } catch (e) { /* ignore */ }
  if (typeof video.getVideoPlaybackQuality === 'function') {
    var q = video.getVideoPlaybackQuality();
    stats.droppedFrames = q.droppedVideoFrames;
    stats.totalFrames = q.totalVideoFrames;
  }
  return stats;
}

function mark(label, data) {
  if (!enabled) return;
  pushBounded(marks, {
    t: nowMs(),
    label: label,
    data: data || null
  });
}

function sample(routeGetter) {
  if (!enabled) return;
  pushBounded(samples, getCurrentSample(routeGetter));
}

function getCurrentSample(routeGetter) {
  if (!enabled) return null;
  var route = null;
  if (typeof routeGetter === 'function') {
    try {
      var r = routeGetter();
      route = r && r.name;
    } catch (e) { /* ignore */ }
  }
  return {
    t: nowMs(),
    route: route,
    heap: getHeapUsage(),
    video: getVideoStats()
  };
}

function startSampling(routeGetter) {
  if (!enabled || sampleTimer) return;
  sample(routeGetter);
  sampleTimer = setInterval(function () {
    sample(routeGetter);
  }, SAMPLE_INTERVAL_MS);
}

function stopSampling() {
  if (sampleTimer) {
    clearInterval(sampleTimer);
    sampleTimer = null;
  }
}

function getSnapshot() {
  return {
    enabled: enabled,
    sampleCount: samples.length,
    markCount: marks.length,
    latestSample: samples[samples.length - 1] || null,
    latestMark: marks[marks.length - 1] || null
  };
}

function exportData() {
  return {
    enabled: enabled,
    samples: samples.slice(),
    marks: marks.slice()
  };
}

function initResourceMonitor() {
  enabled = shouldEnable();
  window.__plaxPerf = {
    isEnabled: function () { return enabled; },
    enable: function () {
      try { localStorage.setItem('plax_perf_enabled', '1'); } catch (e) { /* ignore */ }
      enabled = true;
    },
    disable: function () {
      try { localStorage.removeItem('plax_perf_enabled'); } catch (e) { /* ignore */ }
      enabled = false;
      stopSampling();
    },
    mark: mark,
    getSnapshot: getSnapshot,
    exportData: exportData,
    clear: function () {
      samples = [];
      marks = [];
    }
  };
  if (enabled) {
    console.log('[Plax] Perf mode enabled. Use window.__plaxPerf.exportData()');
  }
  return enabled;
}

function isPerfEnabled() {
  return enabled;
}

export { initResourceMonitor, isPerfEnabled, mark, startSampling, stopSampling, getSnapshot, getCurrentSample };
