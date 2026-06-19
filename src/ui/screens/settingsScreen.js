import { getState, setState } from '../../core/store.js';
import { clearAuth, getOwnerAuthToken } from '../../core/storage.js';
import { renderNetworkSettings } from '../../settings/networkSettings.js';
import { renderPlaybackSettings } from '../../settings/playbackSettings.js';
import { fetchHomeUsers } from '../../plex/users/homeUsers.js';
import { focusFirst, getFocusables, attachFocusNav } from '../focus.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { VERSION } from '../../plex/client.js';
import { isPerfEnabled } from '../../perf/resourceMonitor.js';
import { isTvDebugEnabled, getLogSinkUrl, setLogSinkUrl, LOG_SINK_STORAGE_KEY } from '../../utils/tvDebug.js';
import * as cache from '../../core/cache.js';
import { invalidateRetention } from '../../core/router.js';
import { canUseWatchlists } from '../../watchlists/access.js';
import {
  listWatchlists,
  createWatchlist,
  renameWatchlist,
  deleteWatchlist
} from '../../watchlists/store.js';

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
var activeModalClose = null;

function openTextInputModal(opts) {
  var title = opts.title || 'Enter value';
  var defaultValue = opts.defaultValue || '';
  var onConfirm = opts.onConfirm || function () {};
  var returnFocus = opts.returnFocus || null;

  var overlay = document.createElement('div');
  overlay.className = 'detail-modal gt-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title);

  overlay.innerHTML =
    '<div class="detail-modal-sheet gt-modal-sheet" style="max-width:640px;width:100%;">' +
    '<div class="gt-text-input-wrap" id="tv-text-input-wrap">' +
    '<span class="tv-text-input-label">' + escapeHtml(title) + '</span>' +
    '<input id="tv-text-input-field" type="text" class="tv-text-input"' +
    ' autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"' +
    ' tabindex="0" />' +
    '</div>' +
    '<div class="detail-modal-footer">' +
    '<button type="button" class="btn btn-primary" id="tv-text-input-confirm" tabindex="0">Confirm</button>' +
    '<button type="button" class="btn btn-outline detail-modal-cancel" id="tv-text-input-cancel" tabindex="0">Cancel</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(overlay);

  var input = document.getElementById('tv-text-input-field');
  var inputWrap = document.getElementById('tv-text-input-wrap');
  var confirmBtn = document.getElementById('tv-text-input-confirm');
  var cancelBtn = document.getElementById('tv-text-input-cancel');
  var focusables = [input, confirmBtn, cancelBtn];

  // inputMode: true while the webOS on-screen keyboard is showing / input is active.
  // The webOS keyboard steals DOM focus but still routes key events here. In that
  // state, keyCode 461 (webOS Back key) is the keyboard's Delete button and
  // arrow keys should move the cursor — not close the modal or cycle focusables.
  var inputMode = true;

  input.addEventListener('focus', function () {
    inputMode = true;
    if (inputWrap) inputWrap.classList.add('gt-text-input-wrap--active');
  });
  input.addEventListener('blur', function () {
    if (inputWrap) inputWrap.classList.remove('gt-text-input-wrap--active');
  });
  confirmBtn.addEventListener('focus', function () { inputMode = false; });
  cancelBtn.addEventListener('focus', function () { inputMode = false; });

  input.value = defaultValue;

  function deleteChar() {
    var s = input.selectionStart, end = input.selectionEnd, v = input.value;
    if (s !== end) {
      input.value = v.slice(0, s) + v.slice(end);
      input.setSelectionRange(s, s);
    } else if (s > 0) {
      input.value = v.slice(0, s - 1) + v.slice(s);
      input.setSelectionRange(s - 1, s - 1);
    }
  }

  function moveCursor(delta) {
    var pos = input.selectionStart + delta;
    pos = Math.max(0, Math.min(pos, input.value.length));
    input.setSelectionRange(pos, pos);
  }

  function close() {
    activeModalClose = null;
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

    if (inputMode) {
      // webOS on-screen keyboard sends 461 (Back) for its Delete key.
      // Treat both 461 and 8 as "delete character" while keyboard is active.
      if (code === 461 || code === 8) {
        e.preventDefault(); e.stopPropagation();
        deleteChar();
        return;
      }
      // Arrow keys move the cursor, not focus.
      if (code === 37) { e.preventDefault(); e.stopPropagation(); moveCursor(-1); return; }
      if (code === 39) { e.preventDefault(); e.stopPropagation(); moveCursor(1); return; }
      // Escape closes even in input mode.
      if (code === 27) { e.preventDefault(); e.stopPropagation(); close(); return; }
      // Up/Down move focus to the action buttons.
      if (code === 38 || code === 40) {
        e.preventDefault();
        confirmBtn.focus();
        return;
      }
    } else {
      // Buttons focused: Back/Escape/Backspace closes.
      if (code === 461 || code === 27 || code === 8) {
        e.preventDefault(); e.stopPropagation(); close(); return;
      }
      // Left/Up → prev; Right/Down → next.
      if (code === 37 || code === 38) {
        e.preventDefault();
        var idx = focusables.indexOf(document.activeElement);
        focusables[(idx - 1 + focusables.length) % focusables.length].focus();
        return;
      }
      if (code === 39 || code === 40) {
        e.preventDefault();
        var idx2 = focusables.indexOf(document.activeElement);
        focusables[(idx2 + 1) % focusables.length].focus();
        return;
      }
    }

    // Enter confirms from any element.
    if (code === 13) {
      e.preventDefault(); e.stopPropagation();
      if (document.activeElement === cancelBtn) close();
      else confirm();
    }
  }

  document.addEventListener('keydown', onKey, true);
  activeModalClose = close;

  confirmBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', close);

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
  var hubNav = mountBrowsingHubNav(screen.querySelector('#browsing-hub-nav-host'), {
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
  renderNetworkSettings(document.getElementById('network-section'), {
    onChanged: function (message) {
      setStatus(message, false);
    }
  });

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
    '<div class="settings-row"><label for="perf-hud-select">Performance HUD</label>' +
    '<select id="perf-hud-select"><option value="0">Off</option><option value="1">On</option></select></div>' +
    '<div class="settings-row"><label>Perf trace</label>' +
    '<button class="btn" id="btn-perf-export" tabindex="0">Send to log</button>' +
    '<button class="btn" id="btn-perf-clear" tabindex="0">Clear</button>' +
    '<span class="settings-muted" id="perf-trace-status" style="margin-left:12px"></span>' +
    '</div>' +
    '<div class="settings-row"><label for="debug-log-select">Debug log overlay</label>' +
    '<select id="debug-log-select"><option value="0">Off</option><option value="1">On</option></select></div>' +
    '<div class="settings-row settings-row--stacked">' +
    '<label for="log-sink-url">Log sink URL</label>' +
    '<input id="log-sink-url" class="search-input settings-log-sink-input" type="text" tabindex="0" ' +
    'placeholder="http://192.168.4.1:8765/log" autocomplete="off" />' +
    '<p class="settings-hint">On your Mac run <code>npm run log:receive</code>, then use your Mac\'s LAN IP ' +
    '(System Settings → Network). Requires debug overlay on. Logs append to <code>logs/tv.log</code>.</p>' +
    '</div>';

  document.getElementById('btn-design-review').addEventListener('click', function () {
    navigate('design-review', { _from: 'settings' });
  });

  var perfSel = document.getElementById('perf-hud-select');
  perfSel.value = isPerfEnabled() ? '1' : '0';
  var debugSel = document.getElementById('debug-log-select');
  debugSel.value = isTvDebugEnabled() ? '1' : '0';
  debugSel.addEventListener('change', function () {
    if (window.__plaxDebug) {
      if (debugSel.value === '1') window.__plaxDebug.enable();
      else window.__plaxDebug.disable();
    }
    setStatus('Debug log overlay ' + (debugSel.value === '1' ? 'enabled' : 'disabled') +
      ' — relaunch recommended.', false);
  });

  var logSinkInput = document.getElementById('log-sink-url');
  if (logSinkInput) {
    logSinkInput.value = getLogSinkUrl() || '';
    logSinkInput.addEventListener('change', function () {
      var next = logSinkInput.value.trim();
      setLogSinkUrl(next);
      if (window.__plaxDebug && window.__plaxDebug.setLogSinkUrl) {
        window.__plaxDebug.setLogSinkUrl(next);
      }
      setStatus(next ? 'Log sink saved — debug overlay must be on.' : 'Log sink cleared.', false);
    });
  }

  perfSel.addEventListener('change', function () {
    if (window.__plaxPerf) {
      if (perfSel.value === '1') window.__plaxPerf.enable();
      else window.__plaxPerf.disable();
    }
    setStatus('Performance HUD ' + (perfSel.value === '1' ? 'enabled' : 'disabled') +
      ' — relaunch to apply fully.', false);
  });

  var perfStatusEl = document.getElementById('perf-trace-status');
  function refreshPerfStatus() {
    if (!perfStatusEl || !window.__plaxPerf) return;
    var snap = window.__plaxPerf.getSnapshot();
    perfStatusEl.textContent = snap.markCount + ' marks · ' + snap.sampleCount + ' samples';
  }
  refreshPerfStatus();

  var perfExporting = false;
  document.getElementById('btn-perf-export').addEventListener('click', function () {
    if (perfExporting) return; // guard against D-pad/Enter repeat firing duplicate traces
    if (!window.__plaxPerf) {
      setStatus('Perf telemetry not initialised.', true);
      return;
    }
    var data = window.__plaxPerf.exportData();
    if (!data.marks.length && !data.samples.length) {
      setStatus('No perf data captured yet — turn HUD on and use the app first.', true);
      return;
    }
    var sinkUrl = getLogSinkUrl();
    if (!sinkUrl) {
      setStatus('Set a Log sink URL below first (your Mac running npm run log:receive).', true);
      return;
    }
    perfExporting = true;
    setStatus('Sending perf trace…', false);
    sendPerfTraceToSink(sinkUrl, data).then(function () {
      setStatus('Perf trace sent (' + data.marks.length + ' marks, ' +
        data.samples.length + ' samples) → ' + sinkUrl, false);
    })['catch'](function (err) {
      setStatus('Could not reach log sink: ' + (err && err.message || err), true);
    })['finally'](function () {
      perfExporting = false;
    });
  });

  document.getElementById('btn-perf-clear').addEventListener('click', function () {
    if (window.__plaxPerf) window.__plaxPerf.clear();
    refreshPerfStatus();
    setStatus('Perf trace buffer cleared.', false);
  });

  renderDeveloperSettings(document.getElementById('developer-section'));

  document.getElementById('btn-back').addEventListener('click', function () {
    navigate(params._from || 'library', {});
  });

  function sendPerfTraceToSink(sinkUrl, data) {
    // POST the trace to the existing log-receiver (scripts/log-receiver.cjs).
    // The receiver stringifies `detail` naively (objects become
    // "[object Object]"), so we embed the JSON payload directly in `message`,
    // which it preserves verbatim. One header + N chunks of marks/samples,
    // each line a self-contained JSON object for easy grep/parse.
    var traceId = 'trace-' + Date.now();
    var marks = data.marks || [];
    var samples = data.samples || [];
    var chunkSize = 50;
    var records = [];
    function payloadLine(obj) {
      return { level: 'info', tag: 'perf-trace', message: JSON.stringify(obj) };
    }
    records.push(payloadLine({
      kind: 'header',
      traceId: traceId,
      markCount: marks.length,
      sampleCount: samples.length,
      userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
    }));
    for (var i = 0; i < marks.length; i += chunkSize) {
      records.push(payloadLine({
        kind: 'marks',
        traceId: traceId,
        range: [i, Math.min(marks.length, i + chunkSize)],
        marks: marks.slice(i, i + chunkSize)
      }));
    }
    for (var j = 0; j < samples.length; j += chunkSize) {
      records.push(payloadLine({
        kind: 'samples',
        traceId: traceId,
        range: [j, Math.min(samples.length, j + chunkSize)],
        samples: samples.slice(j, j + chunkSize)
      }));
    }
    var failures = 0;
    var sent = 0;
    function postOne(record) {
      return fetch(sinkUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      }).then(function (res) {
        if (!res || !res.ok) failures += 1;
        sent += 1;
      })['catch'](function () { failures += 1; sent += 1; });
    }
    // Serialise sends so the receiver writes records in order.
    var chain = Promise.resolve();
    records.forEach(function (rec) {
      chain = chain.then(function () { return postOne(rec); });
    });
    return chain.then(function () {
      if (failures > 0 && sent === failures) {
        throw new Error('all ' + sent + ' POSTs failed');
      }
    });
  }

  document.getElementById('btn-signout').addEventListener('click', function () {
    clearAuth();
    cache.invalidateAll();
    invalidateRetention();
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

  // Land focus on the first settings control (top-leftmost), not the sidebar
  // icon the user just clicked. LEFT returns to the sidebar from here.
  var settingsMain = screen.querySelector('.settings-main');
  if (settingsMain && getFocusables(settingsMain).length) {
    focusFirst(settingsMain);
  } else if (!hubNav.focusSidebar()) {
    focusFirst(screen);
  }
  return {
    destroy: function () {
      if (activeModalClose) activeModalClose();
      detachFocus();
    }
  };
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
          message: 'ping from Plax settings',
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
