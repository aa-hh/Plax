import { setState } from '../../core/store.js';
import { persistAuth, clearAuth } from '../../core/storage.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { plexMarkSvg, jellyfinMarkSvg } from '../brand/providerMarks.js';

// Official brand marks (single source of truth: src/ui/brand/providerMarks.js) —
// crisp vectors so the cards never look low-res. Plex 2022 wordmark (letters =
// currentColor, gold chevron); Jellyfin icon with its purple→blue brand gradient.
var PLEX_LOGO = plexMarkSvg({ className: 'provider-card__logo' });
var JELLYFIN_LOGO = jellyfinMarkSvg({ className: 'provider-card__logo' });

function providerCard(id, desc, logo, brand) {
  return '<button class="provider-card card" data-provider="' + id + '" data-brand="' + brand + '" tabindex="0">' +
    '<span class="provider-card__media">' + logo + '</span>' +
    '<span class="provider-card__desc">' + desc + '</span>' +
    '</button>';
}

/**
 * First-run backend chooser. Two large branded cards (logo as the image + a line
 * describing how each connects). One backend is active at a time; the choice is
 * persisted and changeable later via Settings → Sign out.
 */
function providerPickerScreen(root, params, navigate) {
  var screen = document.createElement('div');
  screen.className = 'screen screen-center provider-picker';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Choose your media server</h1>' +
    '<p class="screen-subtitle">Plax works with Plex or Jellyfin. Pick the one you use — ' +
    'you can switch later by signing out.</p>' +
    '<div class="provider-cards">' +
      providerCard('plex', 'Sign in with your plex.tv account and pick a server', PLEX_LOGO, 'plex') +
      providerCard('jellyfin', 'Connect directly to your own Jellyfin server', JELLYFIN_LOGO, 'jellyfin') +
    '</div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  function choose(provider) {
    // Choosing a backend is a deliberate reset. Clear any stale session from a
    // prior provider so we never carry e.g. a Plex token into a Jellyfin context
    // (which would route a server-less session to an empty "who's watching").
    clearAuth();
    setState({
      provider: provider,
      authToken: null,
      ownerAuthToken: null,
      user: null,
      activeHomeUser: null,
      servers: [],
      activeServer: null,
      libraries: [],
      activeLibrary: null
    });
    persistAuth({ provider: provider });
    navigate('pairing', { provider: provider });
  }

  var cards = screen.querySelectorAll('.provider-card');
  Array.prototype.forEach.call(cards, function (card) {
    card.addEventListener('click', function () {
      choose(card.getAttribute('data-provider'));
    });
  });

  focusFirst(screen);

  return {
    destroy: function () { detachFocus(); }
  };
}

export { providerPickerScreen };
