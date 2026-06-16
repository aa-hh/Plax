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
import { getLogSinkUrl, setLogSinkUrl, LOG_SINK_STORAGE_KEY } from '../../utils/tvDebug.js';

/**
 * TV-safe text input modal. Opens a full-screen overlay with an <input>
 * pre-filled with `defaultValue`. Calls onConfirm(value) on confirm,
 * nothing on cancel. Cleans itself up on close.
 *
 * D-pad navigation: Tab/arrow keys cycle between input, Confirm, Cancel.
 * Back key (461) cancels.
 *
 * @param {object} opts
 * @param {string} opts.title        - Heading text shown above the input
 * @param {string} opts.defaultValue - Pre-filled value
 * @param {Function} opts.onConfirm  - Called with the entered string on confirm
 * @param {Element} [opts.returnFocus] - Element to re-focus after the modal closes
 */
function openTextInputModal(opts) {
  var title = opts.title || 'Enter value';
  var defaultValue = opts.defaultValue || '';
  var onConfirm = opts.onConfirm || function () {};
  var returnFocus = opts.returnFocus || null;

  var overlay = document.createElement('div');
  overlay.className = 'detail-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML =
    '<div class="detail-modal-sheet" style="max-width:640px;width:100%;">' +
    '<h2 class="detail-modal-title">' + escapeHtml(title) + '</h2>' +
    '<div style="padding:var(--space-4) 0;">' +
    '<input id="tv-text-input-field" type="text" class="tv-text-input"' +
    ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
    ' style="width:100%;box-sizing:border-box;font-size:var(--font-body);' +
    'padding:14px 18px;background:var(--bg-surface);color:var(--text-primary);' +
    'border:1px solid var(--border);border-radius:var(--radius-md);outline:none;"' +
    ' tabindex="0" />' +
    '</div>' +
    '<div class="detail-modal-footer" style="display:flex;gap:var(--space-3);padding-top:var(--space-4);border-top:1px solid rgba(255,255,255,0.1);">' +
    '<button type="button" class="btn detail-modal-cancel" id="tv-text-input-confirm" tabindex="0"' +
    ' style="flex:1;">Confirm</button>' +
    '<button type="button" class="btn detail-modal-cancel" id="tv-text-input-cancel" tabindex="0"' +
    ' style="flex:1;background:transparent;">Cancel</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  var input = document.getElementById('tv-text-input-field');
  var confirmBtn = document.getElementById('tv-text-input-confirm');
  var cancelBtn = document.getElementById('tv-text-input-cancel');
  var focusables = [input, confirmBtn, cancelBtn];

  input.value = defaultValue;

  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', onKey, true);
    if (returnFocus && typeof returnFocus.focus === 'function') {
      returnFocus.focus();
    }
  }

  function confirm() {
    var val = input.value;
    close();
    onConfirm(val);
  }

  function onKey(e) {
    var code = e.keyCode || e.which;
    // Back key (webOS) or Escape
    if (code === 461 || code === 27) {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    // Enter confirms from any element
    if (code === 13) {
      var active = document.activeElement;
      if (active === cancelBtn) {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      }
      return;
    }
    // D-pad left/right and up/down cycle between focusables (not inside the input)
    if ((code === 37 || code === 38) && document.activeElement !== input) {
      e.preventDefault();
      var idx = focusables.indexOf(document.activeElement);
      var prev = focusables[(idx - 1 + focusables.length) % focusables.length];
      prev.focus();
    }
    if ((code === 39 || code === 40) && document.activeElement !== input) {
      e.preventDefault();
      var idx2 = focusables.indexOf(document.activeElement);
      var next = focusables[(idx2 + 1) % focusables.length];
      next.focus();
    }
  }

  document.addEventListener('keydown', onKey, true);

  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', close);

  // Focus input on open
  setTimeout(function () { input.focus(); }, 0);
}

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
    '<h2 class="settings-section-title">Developer</h2>' +
    '<div id="developer-section"></div>' +
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

  renderDeveloperSettings(document.getElementById('developer-section'));

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
        openTextInputModal({
          title: 'Rename watchlist',
          defaultValue: current ? current.name : '',
          returnFocus: btn,
          onConfirm: function (next) {
            if (!next || !next.trim()) return;
            renameWatchlist(user, id, next.trim());
            refreshList();
          }
        });
      });
    });
    Array.prototype.slice.call(listEl.querySelectorAll('.settings-watchlist-delete')).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var current = listWatchlists(user).filter(function (w) { return w.id === id; })[0];
        if (!current) return;
        deleteWatchlist(user, id);
        refreshList();
      });
    });
  }

  document.getElementById('btn-create-watchlist').addEventListener('click', function () {
    var triggerBtn = document.getElementById('btn-create-watchlist');
    openTextInputModal({
      title: 'New watchlist name',
      defaultValue: 'Watchlist',
      returnFocus: triggerBtn,
      onConfirm: function (name) {
        if (!name || !name.trim()) return;
        createWatchlist(user, name.trim());
        refreshList();
      }
    });
  });

  refreshList();
}

function renderDeveloperSettings(container) {
  function currentUrl() {
    return getLogSinkUrl() || '';
  }

  function renderContent() {
    var url = currentUrl();
    container.innerHTML =
      '<p class="settings-muted">Remote log sink: POSTs structured JSON logs to a receiver on your dev machine (port 8765).</p>' +
      '<div class="settings-row" id="dev-sink-row">' +
      '<label>Remote log sink</label>' +
      '<span id="dev-sink-url-display" style="font-size:var(--font-meta);color:var(--text-secondary);text-align:right;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
      escapeHtml(url || 'Not set') + '</span>' +
      '</div>' +
      '<div class="settings-row">' +
      '<label>Sink URL</label>' +
      '<div style="display:flex;gap:var(--space-3);">' +
      '<button type="button" class="btn" id="btn-dev-set-url" tabindex="0">Set URL</button>' +
      '<button type="button" class="btn" id="btn-dev-clear-url" tabindex="0">Clear</button>' +
      '<button type="button" class="btn" id="btn-dev-test-url" tabindex="0">Test</button>' +
      '<span id="dev-test-status" style="align-self:center;font-size:var(--font-meta);color:var(--text-secondary);min-width:60px;"></span>' +
      '</div>' +
      '</div>';

    var urlDisplay = document.getElementById('dev-sink-url-display');
    var testStatus = document.getElementById('dev-test-status');

    document.getElementById('btn-dev-set-url').addEventListener('click', function () {
      var btn = document.getElementById('btn-dev-set-url');
      openTextInputModal({
        title: 'Remote log sink URL',
        defaultValue: currentUrl(),
        returnFocus: btn,
        onConfirm: function (val) {
          setLogSinkUrl(val.trim() || null);
          if (urlDisplay) urlDisplay.textContent = getLogSinkUrl() || 'Not set';
        }
      });
    });

    document.getElementById('btn-dev-clear-url').addEventListener('click', function () {
      setLogSinkUrl(null);
      if (urlDisplay) urlDisplay.textContent = 'Not set';
      if (testStatus) testStatus.textContent = '';
    });

    document.getElementById('btn-dev-test-url').addEventListener('click', function () {
      var url = getLogSinkUrl();
      if (!url) {
        if (testStatus) {
          testStatus.textContent = 'No URL set';
          testStatus.style.color = 'var(--text-secondary)';
        }
        return;
      }
      if (testStatus) {
        testStatus.textContent = 'Sending…';
        testStatus.style.color = 'var(--text-secondary)';
      }
      var payload;
      try {
        payload = JSON.stringify({
          level: 'log',
          tag: 'test',
          message: 'ping from XPlay settings',
          ts: new Date().toISOString()
        });
      } catch (e) {
        if (testStatus) {
          testStatus.textContent = 'Failed ✗';
          testStatus.style.color = 'var(--error, #e74c3c)';
        }
        return;
      }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onload = function () {
          if (testStatus) {
            if (xhr.status >= 200 && xhr.status < 300) {
              testStatus.textContent = 'Sent ✓';
              testStatus.style.color = 'var(--accent, #f0b533)';
            } else {
              testStatus.textContent = 'Failed ✗ (' + xhr.status + ')';
              testStatus.style.color = 'var(--error, #e74c3c)';
            }
          }
        };
        xhr.onerror = function () {
          if (testStatus) {
            testStatus.textContent = 'Failed ✗';
            testStatus.style.color = 'var(--error, #e74c3c)';
          }
        };
        xhr.ontimeout = function () {
          if (testStatus) {
            testStatus.textContent = 'Timeout ✗';
            testStatus.style.color = 'var(--error, #e74c3c)';
          }
        };
        xhr.timeout = 5000;
        xhr.send(payload);
      } catch (e) {
        if (testStatus) {
          testStatus.textContent = 'Failed ✗';
          testStatus.style.color = 'var(--error, #e74c3c)';
        }
      }
    });
  }

  renderContent();
}

export { settingsScreen };
