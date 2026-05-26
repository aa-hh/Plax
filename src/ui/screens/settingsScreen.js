import { getState, setState } from '../../core/store.js';
import { clearAuth, getOwnerAuthToken } from '../../core/storage.js';
import { renderNetworkSettings } from '../../settings/networkSettings.js';
import { renderPlaybackSettings } from '../../settings/playbackSettings.js';
import { fetchHomeUsers } from '../../plex/users/homeUsers.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { VERSION } from '../../plex/client.js';
import { isPerfEnabled } from '../../perf/resourceMonitor.js';
import * as cache from '../../core/cache.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import {
  listWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist
} from '../../watchlists/store.js';

function truncateId(id) {
  if (!id) return '—';
  if (id.length <= 16) return id;
  return id.slice(0, 8) + '…' + id.slice(-4);
}

function escapeHtml(s) {
  if (s == null || s === '') return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function settingsScreen(root, params, navigate) {
  var screen = document.createElement('div');
  screen.className = 'screen settings-screen';
  screen.innerHTML =
    '<div class="home-layout settings-layout">' +
    '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
    '<div class="home-main settings-main">' +
    '<h1 class="screen-title screen-title-compact">Settings</h1>' +
    '<div class="settings-content">' +
    '<p class="status-msg settings-status" id="settings-status"></p>' +
    '<h2 class="settings-section-title">Account</h2>' +
    '<div id="account-section" class="settings-info-block"></div>' +
    '<h2 class="settings-section-title">Plex Home</h2>' +
    '<div id="plex-home-section"></div>' +
    '<h2 class="settings-section-title settings-watchlists-title hidden" id="watchlists-section-title">Watchlists</h2>' +
    '<div id="watchlists-section" class="hidden"></div>' +
    '<h2 class="settings-section-title">Playback</h2>' +
    '<div id="playback-section"></div>' +
    '<h2 class="settings-section-title">Network</h2>' +
    '<div id="network-section"></div>' +
    '<h2 class="settings-section-title">About</h2>' +
    '<div id="about-section"></div>' +
    '<div class="settings-actions detail-actions">' +
    '<button class="btn" id="btn-back" tabindex="0">Back</button>' +
    '<button class="btn" id="btn-signout" tabindex="0">Sign out</button>' +
    '</div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var hubNav = mountBrowsingHubNav(document.getElementById('browsing-hub-nav-host'), {
    navigate: navigate,
    activeRoute: 'settings',
    fromRoute: 'settings'
  });

  var statusEl = document.getElementById('settings-status');
  var state = getState();
  var activeUser = state.activeHomeUser || state.user;

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.className = 'status-msg settings-status' + (isError ? ' watch-status-error' : '');
  }

  var accountSection = document.getElementById('account-section');
  accountSection.innerHTML =
    '<div class="settings-row settings-row--info"><label>Signed in as</label>' +
    '<span id="account-user-name"></span></div>' +
    '<div class="settings-row settings-row--info"><label>Server</label>' +
    '<span id="account-server-name"></span></div>' +
    '<div class="settings-row settings-row--info"><label>Client ID</label>' +
    '<span>' + truncateId(state.clientId) + '</span></div>' +
    '<div class="settings-row settings-row--info"><label>App version</label>' +
    '<span>' + escapeHtml(VERSION) + '</span></div>';

  var accountUserEl = document.getElementById('account-user-name');
  if (accountUserEl) {
    accountUserEl.textContent = activeUser && (activeUser.title || activeUser.username || activeUser.email) || '—';
  }
  var accountServerEl = document.getElementById('account-server-name');
  if (accountServerEl) {
    accountServerEl.textContent = state.activeServer && state.activeServer.name || '—';
  }

  renderPlaybackSettings(document.getElementById('playback-section'));
  renderNetworkSettings(document.getElementById('network-section'));

  if (canUseWatchlists(activeUser)) {
    var wlTitle = document.getElementById('watchlists-section-title');
    var wlSection = document.getElementById('watchlists-section');
    if (wlTitle) wlTitle.classList.remove('hidden');
    if (wlSection) {
      wlSection.classList.remove('hidden');
      renderWatchlistsSettings(wlSection, activeUser, navigate);
    }
  }

  var plexHomeSection = document.getElementById('plex-home-section');
  plexHomeSection.innerHTML =
    '<div class="settings-row settings-row--info"><label>Current profile</label>' +
    '<span id="current-profile-name"></span></div>' +
    '<div class="settings-row"><label>Switch profile</label>' +
    '<button class="btn" id="btn-switch-profile" tabindex="0">Choose profile</button></div>' +
    '<div id="home-users-list" class="settings-home-users"></div>';

  var currentProfileEl = document.getElementById('current-profile-name');
  if (currentProfileEl) {
    currentProfileEl.textContent = activeUser && (activeUser.title || activeUser.username) || '—';
  }

  document.getElementById('btn-switch-profile').addEventListener('click', function () {
    navigate('profile-picker', { _from: 'settings' });
  });

  var ownerToken = getOwnerAuthToken() || state.ownerAuthToken || state.authToken;
  fetchHomeUsers(ownerToken, state.clientId).then(function (users) {
    if (!users.length) {
      document.getElementById('home-users-list').innerHTML =
        '<p class="settings-muted">Plex Home not available on this account.</p>';
      return;
    }
    var list = document.getElementById('home-users-list');
    list.innerHTML = '<p class="settings-muted">Home profiles</p>';
    users.forEach(function (u) {
      var row = document.createElement('div');
      row.className = 'settings-home-user-row';
      var active = activeUser && activeUser.id === u.id;
      row.textContent = (u.title || u.username) +
        (u.admin ? ' (Admin)' : '') +
        (u.restricted ? ' · Restricted' : '') +
        (u.hasPin ? ' · PIN' : '') +
        (active ? ' · Active' : '');
      list.appendChild(row);
    });
  }).catch(function () {
    document.getElementById('home-users-list').innerHTML =
      '<p class="settings-muted">Could not load Plex Home profiles.</p>';
  });

  var aboutSection = document.getElementById('about-section');
  aboutSection.innerHTML =
    '<div class="settings-row"><label>Design Review</label>' +
    '<button class="btn" id="btn-design-review" tabindex="0">Open</button></div>' +
    '<div class="settings-row"><label>Performance HUD</label>' +
    '<select id="perf-hud-select"><option value="0">Off</option><option value="1">On</option></select></div>';

  document.getElementById('btn-design-review').addEventListener('click', function () {
    navigate('design-review', { _from: 'settings' });
  });

  var perfSel = document.getElementById('perf-hud-select');
  perfSel.value = isPerfEnabled() ? '1' : '0';
  perfSel.addEventListener('change', function () {
    if (window.__xplayPerf) {
      if (perfSel.value === '1') window.__xplayPerf.enable();
      else window.__xplayPerf.disable();
    }
    setStatus('Performance HUD ' + (perfSel.value === '1' ? 'enabled' : 'disabled') +
      ' — relaunch to apply fully.', false);
  });

  document.getElementById('btn-back').addEventListener('click', function () {
    navigate(params._from || 'library', {});
  });
  document.getElementById('btn-signout').addEventListener('click', function () {
    clearAuth();
    cache.invalidateAll();
    setState({
      authToken: null,
      ownerAuthToken: null,
      user: null,
      activeHomeUser: null,
      servers: [],
      libraries: []
    });
    navigate('pairing', {});
  });

  if (!hubNav.focusSidebar()) focusFirst(screen);
  return { destroy: function () { detachFocus(); } };
}

function renderWatchlistsSettings(container, user, navigate) {
  container.innerHTML =
    '<p class="settings-muted">Create lists and add titles with the bookmark on movie, season, and episode screens.</p>' +
    '<div class="settings-row"><label>New list</label>' +
    '<button class="btn" id="btn-create-watchlist" tabindex="0">Create watchlist</button></div>' +
    '<div id="watchlists-settings-list" class="settings-watchlists-list"></div>';

  function refreshList() {
    var listEl = document.getElementById('watchlists-settings-list');
    if (!listEl) return;
    var lists = listWatchlists(user);
    listEl.innerHTML = '';
    if (!lists.length) {
      listEl.innerHTML = '<p class="settings-muted">No watchlists yet.</p>';
      return;
    }
    lists.forEach(function (wl) {
      var row = document.createElement('div');
      row.className = 'settings-watchlist-row';
      row.innerHTML =
        '<span class="settings-watchlist-name">' + escapeHtml(wl.name) + '</span>' +
        '<button type="button" class="btn settings-watchlist-open" data-id="' + escapeHtml(wl.id) + '" tabindex="0">Open</button>' +
        '<button type="button" class="btn settings-watchlist-rename" data-id="' + escapeHtml(wl.id) + '" tabindex="0">Rename</button>' +
        '<button type="button" class="btn settings-watchlist-delete" data-id="' + escapeHtml(wl.id) + '" tabindex="0">Delete</button>';
      listEl.appendChild(row);
    });
    Array.prototype.slice.call(listEl.querySelectorAll('.settings-watchlist-open')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        navigate('watchlist', { watchlistId: btn.getAttribute('data-id') });
      });
    });
    Array.prototype.slice.call(listEl.querySelectorAll('.settings-watchlist-rename')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var current = listWatchlists(user).filter(function (w) { return w.id === id; })[0];
        var next = prompt('Watchlist name', current ? current.name : '');
        if (!next) return;
        renameWatchlist(user, id, next);
        refreshList();
      });
    });
    Array.prototype.slice.call(listEl.querySelectorAll('.settings-watchlist-delete')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var current = listWatchlists(user).filter(function (w) { return w.id === id; })[0];
        if (!current || !confirm('Delete "' + current.name + '"?')) return;
        deleteWatchlist(user, id);
        refreshList();
      });
    });
  }

  document.getElementById('btn-create-watchlist').addEventListener('click', function () {
    var name = prompt('Watchlist name', 'Watchlist');
    if (!name) return;
    createWatchlist(user, name);
    refreshList();
  });

  refreshList();
}

export { settingsScreen };
