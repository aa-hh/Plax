import { getState, setState } from '../core/store.js';
import { persistAuth } from '../core/storage.js';

function getNetworkPrefs() {
  return getState().networkPrefs || {};
}

function setNetworkPrefs(prefs) {
  var merged = Object.assign({}, getNetworkPrefs(), prefs);
  setState({ networkPrefs: merged });
  persistAuth({ networkPrefs: merged });
  return merged;
}

function renderNetworkSettings(container) {
  var prefs = getNetworkPrefs();
  container.innerHTML =
    '<div class="settings-row"><label>Allow insecure HTTP (LAN 4K)</label>' +
    '<select id="set-insecure"><option value="1">Yes</option><option value="0">No</option></select></div>' +
    '<div class="settings-row"><label>Prefer direct connections</label>' +
    '<select id="set-direct"><option value="1">Yes</option><option value="0">No</option></select></div>';

  var insecure = container.querySelector('#set-insecure');
  var direct = container.querySelector('#set-direct');
  insecure.value = prefs.allowInsecure !== false ? '1' : '0';
  direct.value = prefs.preferDirect !== false ? '1' : '0';

  insecure.addEventListener('change', function () {
    setNetworkPrefs({ allowInsecure: insecure.value === '1' });
  });
  direct.addEventListener('change', function () {
    setNetworkPrefs({ preferDirect: direct.value === '1' });
  });
}

export { getNetworkPrefs, setNetworkPrefs, renderNetworkSettings };
