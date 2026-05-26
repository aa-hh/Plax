import { getRoute } from '../core/router.js';
import { getCurrentSample, isPerfEnabled } from './resourceMonitor.js';

var HUD_KEYCODE = 72; // H
var REFRESH_MS = 1000;

function formatHeap(heap) {
  if (!heap || heap.used == null || heap.total == null) return 'n/a';
  return heap.used + '/' + heap.total + ' MB';
}

function formatFrames(video) {
  if (!video || video.droppedFrames == null || video.totalFrames == null) return 'n/a';
  return video.droppedFrames + '/' + video.totalFrames;
}

function formatTimeSec(seconds) {
  if (seconds == null || !isFinite(seconds)) return '--:--';
  var total = Math.max(0, Math.floor(seconds));
  var mins = Math.floor(total / 60);
  var secs = total % 60;
  return mins + ':' + (secs < 10 ? '0' : '') + secs;
}

function initPerfHud() {
  if (!isPerfEnabled()) {
    return function noop() {};
  }

  var hud = document.createElement('div');
  hud.id = 'perf-hud';
  hud.className = 'perf-hud';
  document.body.appendChild(hud);

  var visible = true;
  var timer = null;

  function render() {
    var sample = getCurrentSample(getRoute);
    if (!sample) return;
    var video = sample.video || null;
    var lines = [
      'Route  ' + (sample.route || '-'),
      'Heap   ' + formatHeap(sample.heap),
      'Buffer ' + (video && video.bufferAheadSec != null ? video.bufferAheadSec + 's' : 'n/a'),
      'Frames ' + formatFrames(video),
      'Time   ' + formatTimeSec(video && video.currentTimeSec != null ? video.currentTimeSec : null)
    ];
    hud.textContent = lines.join('\n');
  }

  function onKeyDown(e) {
    var code = e.keyCode || 0;
    var target = e.target;
    var typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);
    if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
    if (code !== HUD_KEYCODE) return;
    visible = !visible;
    hud.classList.toggle('hidden', !visible);
    e.preventDefault();
  }

  render();
  timer = setInterval(render, REFRESH_MS);
  document.addEventListener('keydown', onKeyDown);

  return function destroyPerfHud() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    if (hud && hud.parentNode) {
      hud.parentNode.removeChild(hud);
    }
  };
}

export { initPerfHud };
