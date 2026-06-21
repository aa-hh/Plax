import { setState } from '../../core/store.js';
import { persistAuth, getJellyfinServers } from '../../core/storage.js';
import { createListItem } from '../components/controls.js';
import { focusFirst, attachFocusNav } from '../focus.js';

/**
 * Jellyfin server picker — shown on the 'jellyfin-servers' route (and via the
 * 'pairing' route when known servers exist) so a returning user never re-types a
 * server address on the TV keyboard. Lists previously-used servers + an "Add a new
 * server" row. Picking a server sets it active and hands off to the user picker
 * ("Who's watching?"); adding routes to the login screen's server-entry step.
 *
 * First-run (no saved servers) skips this entirely — the router goes straight to
 * jellyfinLoginScreen. See docs/design-system/component-registry.md (Jellyfin
 * server picker) and startupRouting.resolveStartupRoute.
 */
function hostLabel(url) {
  return String(url || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function jellyfinServerPickerScreen(root, params, navigate) {
  var servers = getJellyfinServers();

  var screen = document.createElement('div');
  screen.className = 'screen screen-center jellyfin-server-picker';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Choose your server</h1>' +
    '<p class="screen-subtitle">Pick a Jellyfin server you’ve used before, or add a new one.</p>' +
    '<div class="server-picker-list" id="server-picker-list"></div>' +
    '<button class="btn login-switch-provider" id="jf-switch-provider" tabindex="0">Use a different service</button>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var listEl = screen.querySelector('#server-picker-list');

  function selectServer(srv) {
    setState({
      activeServer: {
        type: 'jellyfin',
        url: srv.url,
        name: srv.name,
        id: srv.id,
        version: srv.version,
        connectionUri: srv.url
      }
    });
    // Persist as the active server so the user picker + a cold boot resolve it.
    persistAuth({
      provider: 'jellyfin',
      jellyfinServer: { url: srv.url, name: srv.name, id: srv.id, version: srv.version }
    });
    navigate('jellyfin-users', {});
  }

  servers.forEach(function (srv) {
    listEl.appendChild(createListItem({
      label: srv.name || hostLabel(srv.url),
      sublabel: hostLabel(srv.url),
      trailing: '›',
      onSelect: function () { selectServer(srv); }
    }));
  });

  var divider = document.createElement('div');
  divider.className = 'server-picker-divider';
  divider.setAttribute('aria-hidden', 'true');
  listEl.appendChild(divider);

  listEl.appendChild(createListItem({
    label: 'Add a new server',
    trailing: '+',
    className: 'server-picker-add',
    onSelect: function () {
      navigate('pairing', { provider: 'jellyfin', addServer: true });
    }
  }));

  screen.querySelector('#jf-switch-provider').addEventListener('click', function () {
    navigate('provider-picker', {});
  });

  focusFirst(screen);

  return {
    destroy: function () { detachFocus(); }
  };
}

export { jellyfinServerPickerScreen };
