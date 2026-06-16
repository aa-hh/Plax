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

function renderNetworkSettings(container, options) {
  options = options || {};
  var onChanged = typeof options.onChanged === 'function' ? options.onChanged : function () {};
  var prefs = getNetworkPrefs();
  container.innerHTML =
    '<div class="settings-row settings-row--stacked">' +
    '<label for="set-insecure">Allow insecure connections</label>' +
    '<select id="set-insecure"><option value="1">Yes</option><option value="0">No</option></select>' +
    '<p class="settings-hint">Use plain HTTP when HTTPS to your Plex server fails. ' +
    'Default <strong>On</strong> on webOS&nbsp;4 TVs (e.g. LG&nbsp;B8) — only webOS&nbsp;5+ handles secure links to a personal server reliably. ' +
    'On the Plex server set Secure Connections to <em>Preferred</em> (not Required). ' +
    'See Plex support: Secure Connections (support.plex.tv/articles/206225107-secure-connections).</p>' +
    '</div>' +
    '<div class="settings-row"><label>Prefer direct connections</label>' +
    '<select id="set-direct"><option value="1">Yes</option><option value="0">No</option></select></div>';

  var insecure = container.querySelector('#set-insecure');
  var direct = container.querySelector('#set-direct');
  insecure.value = prefs.allowInsecure === true ? '1' : '0';
  direct.value = prefs.preferDirect !== false ? '1' : '0';

  insecure.addEventListener('change', function () {
    setNetworkPrefs({ allowInsecure: insecure.value === '1' });
    onChanged('Allow insecure connections saved — relaunch to reconnect.');
  });
  direct.addEventListener('change', function () {
    setNetworkPrefs({ preferDirect: direct.value === '1' });
    onChanged('Network preference saved — relaunch to reconnect.');
  });
}

export { getNetworkPrefs, setNetworkPrefs, renderNetworkSettings };
