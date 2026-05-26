import { getState, setState } from '../core/store.js';
import { persistAuth } from '../core/storage.js';
import { listProfiles } from '../playback/qualityProfiles.js';

var DEFAULT_PREFS = {
  subtitleOffsetMs: 0,
  subtitleSize: 'm',
  subtitleBackground: true
};

function getPlaybackPrefs() {
  return Object.assign({}, getState().playbackPrefs || {}, DEFAULT_PREFS);
}

function setPlaybackPrefs(partial) {
  var merged = Object.assign({}, getPlaybackPrefs(), partial);
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
    var id = qsel.value || 'auto';
    if (id === 'auto') {
      qualityHint.textContent =
        'Recommended on LG B8 and most TVs — tries direct play, then HLS remux (stream copy), then server transcode.';
    } else if (id === 'original' || id === 'directOnly') {
      qualityHint.textContent =
        'Plays the original Plex file only — no automatic remux or transcode fallback.';
    } else {
      qualityHint.textContent = 'Requests server transcode at the selected cap.';
    }
  }
  qsel.value = prefs.quality || 'auto';
  if (prefs.quality === 'directOnly') qsel.value = 'original';
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
