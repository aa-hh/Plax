import { getState, setState } from '../core/store.js';
import { persistAuth } from '../core/storage.js';
import { createSettingsSwitchRow } from '../ui/components/controls.js';

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

  container.appendChild(createSettingsSwitchRow({
    label: 'Allow insecure connections',
    sublabel: 'Use plain HTTP when HTTPS to your Plex server fails. Recommended On for webOS 4 TVs ' +
      '(e.g. LG B8). On the Plex server set Secure Connections to Preferred (not Required).',
    on: prefs.allowInsecure === true,
    onToggle: function (on) {
      setNetworkPrefs({ allowInsecure: on });
      onChanged('Allow insecure connections saved — relaunch to reconnect.');
    }
  }));

  container.appendChild(createSettingsSwitchRow({
    label: 'Prefer direct connections',
    on: prefs.preferDirect !== false,
    onToggle: function (on) {
      setNetworkPrefs({ preferDirect: on });
      onChanged('Network preference saved — relaunch to reconnect.');
    }
  }));
}

export { getNetworkPrefs, setNetworkPrefs, renderNetworkSettings };
