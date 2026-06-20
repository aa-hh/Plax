import { setState } from '../../core/store.js';
import { persistAuth, clearAuth } from '../../core/storage.js';
import { focusFirst, attachFocusNav } from '../focus.js';

// Brand logos rendered as inline SVG (brand colors, recognizable marks + wordmarks).
var PLEX_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Plex">' +
  '<path d="M20 8 L44 32 L20 56 L33 56 L57 32 L33 8 Z" fill="#E5A00D"/>' +
  '<text x="74" y="46" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="800" ' +
  'letter-spacing="2" fill="#E5A00D">PLEX</text></svg>';

var JELLYFIN_LOGO =
  '<svg class="provider-card__logo" viewBox="0 0 250 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jellyfin">' +
  '<defs><linearGradient id="jfg" x1="0" y1="1" x2="1" y2="0">' +
  '<stop offset="0" stop-color="#AA5CC3"/><stop offset="1" stop-color="#00A4DC"/></linearGradient></defs>' +
  '<path d="M32 8c-6 9-16 25-16 31 0 5.3 7.2 9 16 9s16-3.7 16-9c0-6-10-22-16-31z" fill="url(#jfg)" opacity="0.5"/>' +
  '<path d="M32 22c-3.4 5.4-9 14.5-9 17.6 0 2.9 4 5.2 9 5.2s9-2.3 9-5.2c0-3.1-5.6-12.2-9-17.6z" fill="url(#jfg)"/>' +
  '<text x="72" y="44" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" ' +
  'fill="#F2F2F7">Jellyfin</text></svg>';

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
    '<p class="screen-subtitle">XPlay works with Plex or Jellyfin. Pick the one you use — ' +
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
