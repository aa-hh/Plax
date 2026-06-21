import { getState, setState } from '../core/store.js';
import { persistAuth } from '../core/storage.js';
import { listProfiles } from '../playback/qualityProfiles.js';
import {
  createSettingsPickerRow,
  createSettingsSwitchRow
} from '../ui/components/controls.js';

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

function qualityHintFor(id) {
  if (id === 'original' || id === 'directOnly') {
    return 'Plays the original Plex file when possible — Plex picks direct play or HLS remux.';
  }
  return 'Requests server transcode at the selected bitrate cap.';
}

function renderPlaybackSettings(container) {
  var prefs = getPlaybackPrefs();

  var initialQuality = prefs.quality || 'original';
  if (initialQuality === 'auto' || initialQuality === 'directOnly') initialQuality = 'original';

  var qualityRow = createSettingsPickerRow({
    label: 'Quality profile',
    sublabel: qualityHintFor(initialQuality),
    options: listProfiles().map(function (p) { return { id: p.id, label: p.label }; }),
    selectedId: initialQuality,
    onPick: function (id) {
      setPlaybackPrefs({ quality: id });
      var sub = qualityRow.querySelector('.gt-list-item__sublabel');
      if (sub) sub.textContent = qualityHintFor(id);
    }
  });
  container.appendChild(qualityRow);

  container.appendChild(createSettingsPickerRow({
    label: 'Default subtitle delay',
    options: [-2000, -1000, -500, 0, 500, 1000, 2000].map(function (ms) {
      return { id: String(ms), label: (ms > 0 ? '+' : '') + ms + ' ms' };
    }),
    selectedId: String(prefs.subtitleOffsetMs || 0),
    onPick: function (id) { setPlaybackPrefs({ subtitleOffsetMs: parseInt(id, 10) || 0 }); }
  }));

  container.appendChild(createSettingsPickerRow({
    label: 'Subtitle size',
    options: [{ id: 's', label: 'Small' }, { id: 'm', label: 'Medium' }, { id: 'l', label: 'Large' }],
    selectedId: prefs.subtitleSize || 'm',
    onPick: function (id) { setPlaybackPrefs({ subtitleSize: id }); }
  }));

  container.appendChild(createSettingsSwitchRow({
    label: 'Subtitle background',
    on: prefs.subtitleBackground !== false,
    onToggle: function (on) { setPlaybackPrefs({ subtitleBackground: on }); }
  }));
}

export { getPlaybackPrefs, setPlaybackPrefs, renderPlaybackSettings, DEFAULT_PREFS };
