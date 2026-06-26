import { setState } from '../../core/store.js';
import {
  getSavedLinks,
  clearActiveSession,
  persistAuth
} from '../../core/storage.js';
import * as cache from '../../core/cache.js';
import { invalidateRetention } from '../../core/router.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { signalReady } from '../splashScreen.js';
import { plexMarkSvg, jellyfinMarkSvg, addServerGlyphSvg } from '../brand/providerMarks.js';

/**
 * Cross-provider server picker — a CARD grid (matches the provider/profile
 * pickers). One card per saved link (brand logo + caption) plus an "Add a new
 * server" card (outlined circle + plus). Lets a returning user — or one mid-
 * session via Settings → Switch server — jump straight back into any saved Plex
 * account or Jellyfin server without re-linking.
 *
 * Forget lives ONLY in Settings → Forget server (removes the current link); the
 * cards here are purely for choosing. Switching is non-destructive:
 * clearActiveSession() keeps the saved-links list + cached Jellyfin sessions.
 *
 * Reached from launch (not signed in, ≥1 saved link) and Settings → Switch server
 * (params._from === 'settings', which shows a Back button).
 */
function serverPickerScreen(root, params, navigate) {
  var fromSettings = !!(params && params._from === 'settings');

  function savedCardHtml(link) {
    var brand = link.provider === 'plex' ? 'plex' : 'jellyfin';
    var logo = link.provider === 'plex'
      ? plexMarkSvg({ className: 'server-card__logo' })
      : jellyfinMarkSvg({ className: 'server-card__logo' });
    var caption = link.provider === 'plex'
      ? (link.name || 'Plex account')
      : (link.url || link.name || 'Jellyfin server');
    return '<button class="server-card" data-link-id="' + escapeAttr(link.id) + '" ' +
      'data-brand="' + brand + '" tabindex="0">' +
      '<span class="server-card__media">' + logo + '</span>' +
      '<span class="server-card__label">' + escapeHtml(caption) + '</span>' +
      '</button>';
  }

  function addCardHtml() {
    return '<button class="server-card server-card--add" data-add="1" tabindex="0">' +
      '<span class="server-card__media">' + addServerGlyphSvg({ className: 'server-card__glyph' }) + '</span>' +
      '<span class="server-card__label">Add a new server</span>' +
      '</button>';
  }

  var links = getSavedLinks();
  var cardsHtml = links.map(savedCardHtml).join('') + addCardHtml();

  var screen = document.createElement('div');
  screen.className = 'screen screen-center server-picker-screen';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Choose a server</h1>' +
    '<p class="screen-subtitle">Pick a saved server or add a new one. Your saved ' +
      'servers stay linked — switching never removes them.</p>' +
    '<div class="server-card-grid" id="server-card-grid">' + cardsHtml + '</div>' +
    (fromSettings
      ? '<button class="btn server-picker-back" id="sp-back" tabindex="0">Back</button>'
      : '');

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var destroyed = false;

  // Restore a saved link's session and route into it. Non-destructive: only the
  // *active* session is cleared, never the saved-links list.
  function switchToLink(link) {
    if (destroyed) return;
    clearActiveSession();
    cache.invalidateAll();
    invalidateRetention();

    if (link.provider === 'plex') {
      setState({
        provider: 'plex',
        authToken: link.authToken,
        ownerAuthToken: link.ownerAuthToken || link.authToken,
        clientId: link.clientId,
        user: null,
        activeHomeUser: null,
        servers: [],
        activeServer: null,
        libraries: [],
        activeLibrary: null
      });
      persistAuth({
        provider: 'plex',
        authToken: link.authToken,
        ownerAuthToken: link.ownerAuthToken || link.authToken,
        clientId: link.clientId
      });
      navigate('profile-picker', { _from: 'switch', _alwaysChoose: true });
      return;
    }

    // Jellyfin: restore the server; the user picker handles per-user auth
    // (cached session → instant, else sign-in).
    var jfServer = { url: link.url, name: link.name, id: link.jfId || link.id, version: link.version || '' };
    setState({
      provider: 'jellyfin',
      authToken: null,
      ownerAuthToken: null,
      user: null,
      activeHomeUser: null,
      servers: [],
      activeServer: null,
      libraries: [],
      activeLibrary: null,
      jellyfinServer: jfServer
    });
    persistAuth({ provider: 'jellyfin', jellyfinServer: jfServer });
    navigate('jellyfin-users', { _from: 'switch' });
  }

  var grid = screen.querySelector('#server-card-grid');
  grid.addEventListener('click', function (e) {
    var card = e.target && e.target.closest ? e.target.closest('.server-card') : null;
    if (!card) return;
    if (card.getAttribute('data-add')) {
      navigate('provider-picker', {});
      return;
    }
    var id = card.getAttribute('data-link-id');
    var link = getSavedLinks().filter(function (l) { return l.id === id; })[0];
    if (link) switchToLink(link);
  });

  if (fromSettings) {
    screen.querySelector('#sp-back').addEventListener('click', function () {
      navigate('settings', { _from: 'server-picker' });
    });
  }

  focusFirst(screen);
  signalReady();

  return {
    destroy: function () {
      destroyed = true;
      detachFocus();
    }
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(s) { return escapeHtml(s); }

export { serverPickerScreen };
