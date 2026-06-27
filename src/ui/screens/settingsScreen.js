import { getState, setState } from '../../core/store.js';
import { getOwnerAuthToken, getSavedLinks, removeSavedLink, clearActiveSession } from '../../core/storage.js';
import { renderNetworkSettings } from '../../settings/networkSettings.js';
import { renderPlaybackSettings } from '../../settings/playbackSettings.js';
import { fetchHomeUsers } from '../../plex/users/homeUsers.js';
import { focusFirst, getFocusables, attachFocusNav } from '../focus.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import {
  createSettingsCard,
  createSettingsInfoRow,
  createSettingsPickerRow,
  createSettingsSwitchRow,
  createSettingsActionRow
} from '../components/controls.js';
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
        e.preventDefault(); e.stopPropagation();
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
        e.preventDefault(); e.stopPropagation();
        var idx = focusables.indexOf(document.activeElement);
        focusables[(idx - 1 + focusables.length) % focusables.length].focus();
        return;
      }
      if (code === 39 || code === 40) {
        e.preventDefault(); e.stopPropagation();
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

/**
 * "Log sink URL" setting: a full-width read row + an inline editor (TV-safe).
 *
 * Read state:  a full-width focusable row (label + saved value / "Not set").
 *              Being full-width it sits on the vertical D-pad column, so travel
 *              DOWN the settings list always lands on it — unlike a short input
 *              with a right-aligned CTA, which the geometric nav skipped.
 * Edit state:  selecting the row reveals the editor (input + Save/Cancel/Test)
 *              and hides the read row; the input is focused + select-all'd,
 *              raising the webOS keyboard. Keys are trapped at the document
 *              capture phase so they never reach the screen's attachFocusNav:
 *                461/8 → delete · 37/39 → move cursor (input focused)
 *                13/38/40 → close keyboard + focus Save · 27 → cancel
 *              On the buttons focus is contained: LEFT/RIGHT cycle Save/Cancel/
 *              Test, UP re-opens the keyboard, Back/Esc cancels, Enter activates.
 *              Test pings the value currently in the editor.
 */
function wireLogSinkField(setStatus) {
  var readRow = document.getElementById('log-sink-row');
  var editor = document.getElementById('log-sink-editor');
  var input = document.getElementById('log-sink-url');
  var saveBtn = document.getElementById('log-sink-save');
  var cancelBtn = document.getElementById('log-sink-cancel');
  var testBtn = document.getElementById('log-sink-test');
  if (!readRow || !editor || !input || !saveBtn || !cancelBtn) return;
  var valueSpan = readRow.querySelector('.gt-settings-value');
  var buttons = [saveBtn, cancelBtn, testBtn].filter(Boolean);

  var editing = false;

  function savedValue() { return getLogSinkUrl() || ''; }
  function refreshRead() { if (valueSpan) valueSpan.textContent = savedValue() || 'Not set'; }
  function setStatusSafe(msg, isError) { if (typeof setStatus === 'function') setStatus(msg, isError); }
  refreshRead();

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

  // Read mode is a full-width row (offset 0 → vertical D-pad always lands on it).
  // Selecting it opens this inline editor; focus is then contained between the
  // input and the Save/Cancel/Test buttons until the user commits or backs out.
  function enterEdit() {
    if (editing) return;
    editing = true;
    input.value = savedValue();
    editor.hidden = false;
    document.addEventListener('keydown', onEditKey, true);
    // Focus the input first, THEN hide the read row, so focus never collapses to
    // <body> (which would trip the screen's focus watchdog).
    setTimeout(function () {
      input.focus();
      try { input.select(); } catch (e) { /* older Chromium */ }
      readRow.hidden = true;
    }, 0);
  }

  function exitEdit() {
    editing = false;
    document.removeEventListener('keydown', onEditKey, true);
    readRow.hidden = false;
    editor.hidden = true;
    readRow.focus();
  }

  function commit() {
    var next = input.value.trim();
    setLogSinkUrl(next || null);
    if (window.__plaxDebug && window.__plaxDebug.setLogSinkUrl) {
      window.__plaxDebug.setLogSinkUrl(next);
    }
    refreshRead();
    setStatusSafe(next ? 'Log sink saved — debug overlay must be on.' : 'Log sink cleared.', false);
    exitEdit();
  }

  function cancel() { exitEdit(); }

  // Test pings the value currently in the editor (what you're about to save).
  function testSink() {
    var url = input.value.trim();
    if (!url) { setStatusSafe('Enter a Log sink URL first, then Test.', true); return; }
    var payload;
    try {
      payload = JSON.stringify({
        level: 'log',
        tag: 'test',
        message: 'ping from Plax settings',
        ts: new Date().toISOString()
      });
    } catch (e) {
      setStatusSafe('Test ping failed ✗ — could not build payload.', true);
      return;
    }
    setStatusSafe('Sending test ping…', false);
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.timeout = 5000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) setStatusSafe('Test ping sent ✓ → ' + url, false);
        else setStatusSafe('Test ping failed ✗ (HTTP ' + xhr.status + ')', true);
      };
      xhr.onerror = function () { setStatusSafe('Test ping failed ✗ — could not reach sink.', true); };
      xhr.ontimeout = function () { setStatusSafe('Test ping timed out ✗', true); };
      xhr.send(payload);
    } catch (e) {
      setStatusSafe('Test ping failed ✗', true);
    }
  }

  readRow.addEventListener('click', enterEdit);
  saveBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', cancel);
  if (testBtn) testBtn.addEventListener('click', testSink);

  function focusButton(idx) {
    if (!buttons.length) return;
    idx = (idx + buttons.length) % buttons.length;
    buttons[idx].focus();
  }

  function onEditKey(e) {
    if (!editing) return;
    var code = e.keyCode || e.which;

    if (document.activeElement === input) {
      // Keyboard up: trap editing keys so the screen nav can't grab focus.
      if (code === 461 || code === 8) { e.preventDefault(); e.stopPropagation(); deleteChar(); return; }
      if (code === 37) { e.preventDefault(); e.stopPropagation(); moveCursor(-1); return; }
      if (code === 39) { e.preventDefault(); e.stopPropagation(); moveCursor(1); return; }
      // Enter / Up / Down → unselect (close keyboard) + move to the action buttons.
      if (code === 13 || code === 38 || code === 40) { e.preventDefault(); e.stopPropagation(); saveBtn.focus(); return; }
      if (code === 27) { e.preventDefault(); e.stopPropagation(); cancel(); return; }
      return; // character keys flow through into the input
    }

    // A Save/Cancel/Test button is focused — keep focus inside the editor.
    if (code === 461 || code === 27) { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (code === 38) { e.preventDefault(); e.stopPropagation(); input.focus(); return; }       // up → re-open keyboard
    if (code === 37) { e.preventDefault(); e.stopPropagation(); focusButton(buttons.indexOf(document.activeElement) - 1); return; }
    if (code === 39) { e.preventDefault(); e.stopPropagation(); focusButton(buttons.indexOf(document.activeElement) + 1); return; }
    if (code === 40) { e.preventDefault(); e.stopPropagation(); return; }                       // down swallowed (contained)
    // Enter (13) falls through → native button click (Save / Cancel / Test).
  }
}

/* Build identifier from the generated build-info global (window.__PLAX_BUILD__).
   Surfaced in the Account card's "App version" row so a deploy can be verified
   on-device: if the build number doesn't change after ./tvpush.sh, the new
   bundle didn't actually install. */
function buildStampLabel() {
  var b = (typeof window !== 'undefined' && window.__PLAX_BUILD__) || null;
  if (!b || !b.buildNumber) return '';
  return ' · build ' + b.buildNumber + (b.gitCommit ? ' · ' + b.gitCommit : '');
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
    '<div class="settings-content" id="settings-content">' +
    '<p class="status-msg settings-status" id="settings-status"></p>' +
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

  var content = document.getElementById('settings-content');

  // ── Account (read-only info) ──
  var accountCard = createSettingsCard({ title: 'Account' });
  accountCard.body.appendChild(createSettingsInfoRow({
    label: 'Signed in as',
    value: (activeUser && (activeUser.title || activeUser.username || activeUser.email)) || '—'
  }));
  accountCard.body.appendChild(createSettingsInfoRow({
    label: 'Server',
    value: (state.activeServer && state.activeServer.name) || '—'
  }));
  // Switch server → cross-provider saved-link picker (non-destructive: keeps every
  // saved Plex/Jellyfin link; just jumps the active session to another one).
  accountCard.body.appendChild(createSettingsActionRow({
    label: 'Switch server',
    hint: 'Choose',
    onSelect: function () { navigate('server-picker', { _from: 'settings' }); }
  }));
  accountCard.body.appendChild(createSettingsInfoRow({ label: 'Client ID', value: truncateId(state.clientId) }));
  if (state.provider !== 'jellyfin') {
    accountCard.body.appendChild(createSettingsInfoRow({ label: 'Plex token', value: state.authToken || '—' }));
  }

  // App version carries the on-device build stamp so a deploy can be verified:
  // if this doesn't change after ./tvpush.sh, the new bundle didn't install.
  accountCard.body.appendChild(createSettingsInfoRow({ label: 'App version', value: VERSION + buildStampLabel() }));
  content.appendChild(accountCard);

  // ── Profiles (provider-neutral: Plex Home users or Jellyfin "who's watching") ──
  var isJellyfin = state.provider === 'jellyfin';
  var homeCard = createSettingsCard({ title: 'Profiles' });
  homeCard.body.appendChild(createSettingsInfoRow({
    label: 'Current profile',
    value: (activeUser && (activeUser.title || activeUser.username)) || '—'
  }));
  homeCard.body.appendChild(createSettingsActionRow({
    label: 'Switch profile',
    hint: 'Choose',
    onSelect: function () {
      navigate(isJellyfin ? 'jellyfin-users' : 'profile-picker', { _from: 'settings' });
    }
  }));
  var homeUsersList = document.createElement('div');
  homeUsersList.className = 'settings-home-users';
  homeCard.body.appendChild(homeUsersList);
  content.appendChild(homeCard);

  // The Plex Home profiles list is Plex-only (Jellyfin has no owner-proxy roster).
  if (!isJellyfin) {
    var ownerToken = getOwnerAuthToken() || state.ownerAuthToken || state.authToken;
    fetchHomeUsers(ownerToken, state.clientId).then(function (users) {
      if (!users.length) {
        homeUsersList.innerHTML = '<p class="settings-muted">Plex Home not available on this account.</p>';
        return;
      }
      homeUsersList.innerHTML = '<p class="settings-muted">Home profiles</p>';
      users.forEach(function (u) {
        var row = document.createElement('div');
        row.className = 'settings-home-user-row';
        var active = activeUser && activeUser.id === u.id;
        row.textContent = (u.title || u.username) +
          (u.admin ? ' (Admin)' : '') +
          (u.restricted ? ' · Restricted' : '') +
          (u.hasPin ? ' · PIN' : '') +
          (active ? ' · Active' : '');
        homeUsersList.appendChild(row);
      });
    }).catch(function () {
      homeUsersList.innerHTML = '<p class="settings-muted">Could not load Plex Home profiles.</p>';
    });
  }

  // ── Watchlists (conditional) ──
  if (canUseWatchlists(activeUser)) {
    var wlCard = createSettingsCard({ title: 'Watchlists' });
    content.appendChild(wlCard);
    renderWatchlistsSettings(wlCard.body, activeUser, navigate);
  }

  // ── Playback ──
  var playbackCard = createSettingsCard({ title: 'Playback' });
  content.appendChild(playbackCard);
  renderPlaybackSettings(playbackCard.body);

  // ── Network ──
  var networkCard = createSettingsCard({ title: 'Network' });
  content.appendChild(networkCard);
  renderNetworkSettings(networkCard.body, {
    onChanged: function (message) { setStatus(message, false); }
  });

  // ── Developer ──
  function perfTraceSummary() {
    if (!window.__plaxPerf) return 'Perf telemetry not initialised.';
    var snap = window.__plaxPerf.getSnapshot();
    return snap.markCount + ' marks · ' + snap.sampleCount + ' samples';
  }

  var devCard = createSettingsCard({ title: 'Developer' });

  devCard.body.appendChild(createSettingsActionRow({
    label: 'Design review',
    hint: 'Open',
    onSelect: function () { navigate('design-review', { _from: 'settings' }); }
  }));

  devCard.body.appendChild(createSettingsSwitchRow({
    label: 'Performance HUD',
    sublabel: 'On-screen FPS / memory overlay — relaunch to apply fully.',
    on: isPerfEnabled(),
    onToggle: function (on) {
      if (window.__plaxPerf) { if (on) window.__plaxPerf.enable(); else window.__plaxPerf.disable(); }
      setStatus('Performance HUD ' + (on ? 'enabled' : 'disabled') + ' — relaunch to apply fully.', false);
    }
  }));

  devCard.body.appendChild(createSettingsSwitchRow({
    label: 'Debug log overlay',
    sublabel: 'Shows the on-TV log panel — relaunch recommended.',
    on: isTvDebugEnabled(),
    onToggle: function (on) {
      if (window.__plaxDebug) { if (on) window.__plaxDebug.enable(); else window.__plaxDebug.disable(); }
      setStatus('Debug log overlay ' + (on ? 'enabled' : 'disabled') + ' — relaunch recommended.', false);
    }
  }));

  var perfExporting = false;
  var perfTraceRow = createSettingsActionRow({
    label: 'Send perf trace to log',
    sublabel: perfTraceSummary(),
    hint: 'Send',
    onSelect: function () {
      if (perfExporting) return; // guard against D-pad/Enter repeat firing duplicate traces
      if (!window.__plaxPerf) { setStatus('Perf telemetry not initialised.', true); return; }
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
    }
  });
  devCard.body.appendChild(perfTraceRow);

  devCard.body.appendChild(createSettingsActionRow({
    label: 'Clear perf buffer',
    hint: 'Clear',
    onSelect: function () {
      if (window.__plaxPerf) window.__plaxPerf.clear();
      perfTraceRow.setSublabel(perfTraceSummary());
      setStatus('Perf trace buffer cleared.', false);
    }
  }));

  // Log sink: a full-width read row (so vertical D-pad reaches it) that opens an
  // inline editor on select. Wired by wireLogSinkField.
  var logSinkBlock = document.createElement('div');
  logSinkBlock.id = 'log-sink-block';
  var logSinkRead = createSettingsActionRow({
    id: 'log-sink-row',
    label: 'Log sink URL',
    sublabel: 'POST debug logs to a receiver on your dev machine.',
    hint: getLogSinkUrl() || 'Not set',
    onSelect: function () { /* real handler attached in wireLogSinkField */ }
  });
  logSinkBlock.appendChild(logSinkRead);

  var logSinkEditor = document.createElement('div');
  logSinkEditor.className = 'gt-settings-stacked gt-settings-editor';
  logSinkEditor.id = 'log-sink-editor';
  logSinkEditor.hidden = true;
  logSinkEditor.innerHTML =
    '<label for="log-sink-url">Log sink URL</label>' +
    '<input id="log-sink-url" class="tv-text-input" type="text" ' +
    'placeholder="http://192.168.4.1:8765/log" autocomplete="off" autocorrect="off" ' +
    'autocapitalize="off" spellcheck="false" />' +
    '<div class="gt-settings-editor__actions">' +
    '<button type="button" class="btn" id="log-sink-save" tabindex="0">Save</button>' +
    '<button type="button" class="btn" id="log-sink-cancel" tabindex="0">Cancel</button>' +
    '<button type="button" class="btn" id="log-sink-test" tabindex="0">Test</button>' +
    '</div>' +
    '<p class="settings-hint">On your Mac run <code>npm run log:receive</code>, then use your Mac\'s LAN IP ' +
    '(System Settings → Network). Requires debug overlay on. Logs append to <code>logs/tv.log</code>.</p>';
  logSinkBlock.appendChild(logSinkEditor);
  devCard.body.appendChild(logSinkBlock);
  content.appendChild(devCard);

  wireLogSinkField(setStatus);

  // ── Footer: Forget server (destructive) ──
  // Removes ONLY the current saved link (others are never deleted), clears the
  // active session, and routes to the saved-link picker if other links remain,
  // else the provider picker to link a new one.
  var footerCard = createSettingsCard({});
  footerCard.classList.add('gt-settings-footer');
  footerCard.body.appendChild(createSettingsActionRow({
    label: 'Forget server',
    sublabel: 'Removes this server from this device. Other saved servers are kept.',
    destructive: true,
    onSelect: function () {
      var cur = getState();
      var currentLinkId = cur.provider === 'jellyfin'
        ? 'jf:' + ((cur.activeServer && (cur.activeServer.id || cur.activeServer.url)) ||
                   (cur.jellyfinServer && (cur.jellyfinServer.id || cur.jellyfinServer.url)) || '')
        : 'plex:' + cur.clientId;
      removeSavedLink(currentLinkId);
      clearActiveSession();
      cache.invalidateAll();
      invalidateRetention();
      setState({
        provider: null,
        authToken: null,
        ownerAuthToken: null,
        user: null,
        activeHomeUser: null,
        servers: [],
        activeServer: null,
        libraries: []
      });
      navigate(getSavedLinks().length > 0 ? 'server-picker' : 'provider-picker', {});
    }
  }));
  content.appendChild(footerCard);

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
    '<p class="settings-muted gt-settings-note">Create lists and add titles with the bookmark on movie, season, and episode screens.</p>' +
    '<div id="watchlists-settings-list" class="settings-watchlists-list"></div>';

  var createRow = createSettingsActionRow({
    label: 'Create watchlist',
    hint: 'New',
    onSelect: function () {
      openTextInputModal({
        title: 'New watchlist name',
        defaultValue: 'Watchlist',
        returnFocus: createRow,
        onConfirm: function (name) {
          if (!name || !name.trim()) return;
          createWatchlist(user, name.trim());
          refreshList();
        }
      });
    }
  });
  container.insertBefore(createRow, container.querySelector('#watchlists-settings-list'));

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

  refreshList();
}

export { settingsScreen };
