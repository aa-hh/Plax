import { getState, setState } from '../core/store.js';
import { persistAuth } from '../core/storage.js';
import { listProfiles } from '../playback/qualityProfiles.js';

var DEFAULT_PREFS = {
  subtitleOffsetMs: 0,
  subtitleSize: 'm',
  subtitleBackground: true
};
var SUBTITLE_OFFSET_MIN_MS = -5000;
var SUBTITLE_OFFSET_MAX_MS = 5000;
var VALID_SUBTITLE_SIZES = { s: true, m: true, l: true };

function getPlaybackPrefs() {
  return Object.assign({}, getState().playbackPrefs || {}, DEFAULT_PREFS);
}

function clampPlaybackPrefs(partial) {
  var next = Object.assign({}, partial);
  if (next.quality != null) {
    var allowed = listProfiles().map(function (p) { return p.id; });
    if (allowed.indexOf(next.quality) < 0) delete next.quality;
  }
  if (next.subtitleSize != null && !VALID_SUBTITLE_SIZES[next.subtitleSize]) {
    delete next.subtitleSize;
  }
  if (next.subtitleOffsetMs != null) {
    var ms = parseInt(next.subtitleOffsetMs, 10);
    if (isNaN(ms)) ms = 0;
    next.subtitleOffsetMs = Math.max(
      SUBTITLE_OFFSET_MIN_MS,
      Math.min(SUBTITLE_OFFSET_MAX_MS, ms)
    );
  }
  return next;
}

function setPlaybackPrefs(partial) {
  var merged = Object.assign({}, getPlaybackPrefs(), clampPlaybackPrefs(partial || {}));
  setState({ playbackPrefs: merged });
  persistAuth({ playbackPrefs: merged });
  return merged;
}

function renderPlaybackSettings(container) {
  var prefs = getPlaybackPrefs();
  container.innerHTML =
    '<div class="settings-row settings-row--stacked">' +
    '<label for="quality-select">Quality profile</label>' +
    '<select id="quality-select"></select>' +
    '<p class="settings-hint" id="quality-hint"></p></div>' +
    '<div class="settings-row"><label>Default subtitle delay (ms)</label>' +
    '<select id="subtitle-offset-select"></select></div>' +
    '<div class="settings-row"><label>Subtitle size</label>' +
    '<select id="subtitle-size-select"><option value="s">Small</option>' +
    '<option value="m">Medium</option><option value="l">Large</option></select></div>' +
    '<div class="settings-row"><label>Subtitle background</label>' +
    '<select id="subtitle-bg-select"><option value="1">On</option><option value="0">Off</option></select></div>';

  var profiles = listProfiles();
  var qsel = container.querySelector('#quality-select');
  profiles.forEach(function (p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    qsel.appendChild(opt);
  });
  var qualityHint = container.querySelector('#quality-hint');
  function syncQualityHint() {
    if (!qualityHint) return;
    var id = qsel.value || 'original';
    if (id === 'original' || id === 'directOnly') {
      qualityHint.textContent =
        'Plays the original Plex file when possible — Plex picks direct play or HLS remux.';
    } else {
      qualityHint.textContent = 'Requests server transcode at the selected bitrate cap.';
    }
  }
  var initialQuality = prefs.quality || 'original';
  if (initialQuality === 'auto' || initialQuality === 'directOnly') initialQuality = 'original';
  qsel.value = initialQuality;
  syncQualityHint();
  qsel.addEventListener('change', function () {
    setPlaybackPrefs({ quality: qsel.value });
    syncQualityHint();
  });

  var offsetSel = container.querySelector('#subtitle-offset-select');
  [-2000, -1000, -500, 0, 500, 1000, 2000].forEach(function (ms) {
    var opt = document.createElement('option');
    opt.value = String(ms);
    opt.textContent = (ms > 0 ? '+' : '') + ms + ' ms';
    offsetSel.appendChild(opt);
  });
  offsetSel.value = String(prefs.subtitleOffsetMs || 0);
  offsetSel.addEventListener('change', function () {
    setPlaybackPrefs({ subtitleOffsetMs: parseInt(offsetSel.value, 10) || 0 });
  });

  var sizeSel = container.querySelector('#subtitle-size-select');
  sizeSel.value = prefs.subtitleSize || 'm';
  sizeSel.addEventListener('change', function () {
    setPlaybackPrefs({ subtitleSize: sizeSel.value });
  });

  var bgSel = container.querySelector('#subtitle-bg-select');
  bgSel.value = prefs.subtitleBackground !== false ? '1' : '0';
  bgSel.addEventListener('change', function () {
    setPlaybackPrefs({ subtitleBackground: bgSel.value === '1' });
  });
}

export { getPlaybackPrefs, setPlaybackPrefs, renderPlaybackSettings, DEFAULT_PREFS };
