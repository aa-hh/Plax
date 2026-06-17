import { getState, setState } from '../../core/store.js';
import {
  persistAuth,
  getOwnerAuthToken,
  readSessionHomeSize,
  writeSessionHomeSize
} from '../../core/storage.js';
import { runAppBootstrap } from '../../core/appBootstrap.js';
import { fetchHomeSize } from '../../plex/auth/pinAuth.js';
import { fetchHomeUsers, switchToHomeUser } from '../../plex/users/homeUsers.js';
import { createPinEntry, isNumericKeyCode } from '../pinEntry.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { createSpinner } from '../components/spinner.js';
import * as cache from '../../core/cache.js';
import { invalidateRetention } from '../../core/router.js';
import { tvLog } from '../../utils/tvDebug.js';
import { isPerfEnabled, mark as perfMark } from '../../perf/resourceMonitor.js';
import { prefetchAndPersistBlobs, resolvePosterSrc } from '../posterImages.js';

var BACK_KEYCODE = 461;
var ENTER_KEYCODE = 13;
var SWITCH_TIMEOUT_MS = 25000;
var BOOTSTRAP_TIMEOUT_MS = 120000;
var PIN_FLOW_TIMEOUT_MS = 120000;
var PROFILE_PICKER_MAX_COLS = 4;

function clampProfilePickerCols(count) {
  var n = Number(count);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), PROFILE_PICKER_MAX_COLS);
}

function profilePickerCols(homeSize, userCount) {
  var fromHome = homeSize != null ? clampProfilePickerCols(homeSize) : null;
  if (userCount == null) {
    return fromHome || 1;
  }
  var fromUsers = clampProfilePickerCols(userCount);
  if (fromHome == null) return fromUsers;
  if (fromUsers > fromHome) {
    return Math.min(fromUsers, PROFILE_PICKER_MAX_COLS);
  }
  return fromHome;
}

function profileInitials(user) {
  var name = user.title || user.username || '?';
  var parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function appendProfileAvatar(parent, user) {
  var avatar = document.createElement('span');
  avatar.className = 'profile-card-avatar';
  if (user.thumb) {
    avatar.classList.add('profile-card-avatar--img');
    var img = document.createElement('img');
    var perfOn = isPerfEnabled();
    var requestedAt = 0;
    if (perfOn) {
      requestedAt = (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
      perfMark('userSelect:avatar-requested', { user: user.id || user.uuid || user.title });
    }
    img.src = resolvePosterSrc(user.thumb);
    img.alt = '';
    img.addEventListener('load', function () {
      if (perfOn) {
        var now = (typeof performance !== 'undefined' && performance.now)
          ? performance.now() : Date.now();
        perfMark('userSelect:avatar-visible', {
          user: user.id || user.uuid || user.title,
          ms: Math.round(now - requestedAt)
        });
      }
    });
    img.addEventListener('error', function () {
      avatar.classList.remove('profile-card-avatar--img');
      img.remove();
      avatar.textContent = profileInitials(user);
    });
    avatar.appendChild(img);
  } else {
    avatar.textContent = profileInitials(user);
  }
  parent.appendChild(avatar);
}

function shouldRejectManagedSwitchToken(user, switchedToken, ownerToken) {
  var isManagedUser = !(user && user.admin);
  return isManagedUser && !switchedToken;
}

function profilePickerScreen(root, params, navigate) {
  var screen = document.createElement('div');
  screen.className = 'screen profile-picker-screen profile-picker--loading profile-picker--awaiting-size';
  screen.innerHTML =
    '<div class="profile-picker-main" id="profile-picker-main">' +
    '<div class="profile-picker-header" id="profile-header">' +
    '<h1 class="screen-title screen-title-compact profile-picker-title">Select User</h1>' +
    '</div>' +
    '<p class="status-msg profile-picker-status" id="profile-status" hidden></p>' +
    '<div class="profile-picker-body" id="profile-body">' +
    '<div class="profile-picker-row" id="profile-row" data-focus-zone="profile-picker-profiles"></div>' +
    '<div class="profile-picker-pin" id="profile-pin" hidden>' +
    '<p class="pin-display" id="pin-display"></p>' +
    '<p class="pin-error" id="pin-error" hidden></p>' +
    '<div class="pin-pad" id="pin-pad"></div>' +
    '</div></div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  var headerEl = document.getElementById('profile-header');
  var titleEl = headerEl ? headerEl.querySelector('.profile-picker-title') : null;
  var profileSpinner = createSpinner({ size: 'em', label: 'Loading profiles' });
  profileSpinner.id = 'profile-spinner';
  if (headerEl) headerEl.appendChild(profileSpinner);

  var statusEl = document.getElementById('profile-status');
  var rowEl = document.getElementById('profile-row');
  var pinPanel = document.getElementById('profile-pin');
  var pinDisplay = document.getElementById('pin-display');
  var pinError = document.getElementById('pin-error');
  var pinPad = document.getElementById('pin-pad');
  var bodyEl = document.getElementById('profile-body');

  var users = [];
  var mode = 'browsing';
  var selectedUser = null;
  var selectedCard = null;
  var switching = false;
  var profilesLoading = true;
  var sizeReady = false;
  var resolvedHomeSize = readSessionHomeSize();

  function applyProfilePickerCols(cols) {
    var n = clampProfilePickerCols(cols);
    screen.style.setProperty('--profile-picker-cols', String(n));
    if (rowEl) rowEl.setAttribute('data-cols', String(n));
  }

  function commitPickerSize(homeSize) {
    if (homeSize != null) {
      resolvedHomeSize = homeSize;
      writeSessionHomeSize(homeSize);
    }
    applyProfilePickerCols(profilePickerCols(resolvedHomeSize, null));
  }

  function revealPickerChrome() {
    if (sizeReady) return;
    sizeReady = true;
    screen.classList.remove('profile-picker--awaiting-size');
    syncHeaderSpinner();
    if (params._retry) {
      setStatus('Session expired. Choose your profile again.', true);
    }
  }

  if (resolvedHomeSize != null) {
    commitPickerSize(resolvedHomeSize);
    revealPickerChrome();
  }

  function spinnerLabel() {
    if (profilesLoading) return 'Loading profiles';
    if (mode === 'pinEntry' && switching) return 'Verifying PIN';
    if (switching) return 'Signing in';
    return 'Loading';
  }

  function syncHeaderSpinner() {
    var show = profilesLoading || switching;
    if (!profileSpinner) return;
    profileSpinner.hidden = !show;
    var ring = profileSpinner.querySelector('.xplay-spinner');
    if (ring) ring.setAttribute('aria-label', spinnerLabel());
  }

  function setProfileLoading(loading) {
    profilesLoading = !!loading;
    screen.classList.toggle('profile-picker--loading', profilesLoading);
    syncHeaderSpinner();
  }

  function syncHeaderTitle() {
    if (titleEl) titleEl.textContent = mode === 'pinEntry' ? 'Enter PIN' : 'Select User';
  }

  var pinEntry = createPinEntry({
    onChange: function () {
      pinDisplay.textContent = pinEntry.getDisplayMask();
      if (!switching) showPinFlowMessage('', false);
    },
    onComplete: function (pin) {
      submitPin(pin);
    }
  });

  function setStatus(text, isError) {
    if (!statusEl) return;
    var msg = text || '';
    statusEl.textContent = msg;
    statusEl.hidden = !msg;
    statusEl.className = 'status-msg profile-picker-status' + (isError ? ' watch-status-error' : '');
  }

  function setPinError(msg) {
    if (msg) showPinFlowMessage(msg, true);
    else showPinFlowMessage('', false);
  }

  var switchGeneration = 0;
  var pinFlowTimer = null;
  var switchApiTimer = null;
  var bootstrapTimer = null;

  function clearPinFlowTimers() {
    if (pinFlowTimer) {
      clearTimeout(pinFlowTimer);
      pinFlowTimer = null;
    }
    if (switchApiTimer) {
      clearTimeout(switchApiTimer);
      switchApiTimer = null;
    }
    if (bootstrapTimer) {
      clearTimeout(bootstrapTimer);
      bootstrapTimer = null;
    }
  }

  function pinFlowLog(step, detail) {
    tvLog('profile-picker', step, detail);
  }

  function showPinFlowMessage(msg, isError) {
    var text = msg || '';
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.hidden = !text;
      statusEl.className = 'status-msg profile-picker-status' +
        (isError ? ' watch-status-error' : '');
    }
    if (pinError) {
      pinError.textContent = isError ? text : '';
      if (isError && text) {
        pinError.hidden = false;
        pinError.removeAttribute('hidden');
        pinError.classList.add('pin-error--visible');
      } else {
        pinError.hidden = true;
        pinError.setAttribute('hidden', '');
        pinError.classList.remove('pin-error--visible');
      }
    }
    if (isError && text && bodyEl) bodyEl.classList.add('profile-picker--pin-error');
    else if (bodyEl) bodyEl.classList.remove('profile-picker--pin-error');
  }

  function reportPinFlowProgress(msg) {
    showPinFlowMessage(msg, false);
    pinFlowLog('progress: ' + msg);
  }

  function reportPinFlowFailure(msg, err, phase) {
    clearPinFlowTimers();
    switchGeneration += 1;
    switching = false;
    syncHeaderSpinner();
    var message = msg || (err && err.message) || 'Could not sign in. Try again.';
    pinFlowLog('failed' + (phase ? ' (' + phase + ')' : ''), err || message);
    showPinFlowMessage(message, true);
    if (mode === 'pinEntry') {
      pinEntry.clear();
      if (pinDisplay) pinDisplay.textContent = '';
    }
  }

  function isActiveSwitch(op) {
    return op === switchGeneration;
  }

  function getOwnerToken() {
    var state = getState();
    return getOwnerAuthToken() || state.ownerAuthToken || state.authToken;
  }

  function addPinKeyButton(parent, key) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pin-pad-btn btn';
    btn.textContent = key;
    btn.tabIndex = 0;
    btn.dataset.key = key;
    if (key === 'Delete') btn.classList.add('pin-pad-btn--delete');
    if (key === '0') btn.classList.add('pin-pad-btn--zero');
    function activatePinKey() {
      if (key === 'Delete') pinEntry.deleteDigit();
      else pinEntry.appendDigit(key);
    }
    btn.addEventListener('click', activatePinKey);
    btn.addEventListener('keydown', function (e) {
      if (e.keyCode === ENTER_KEYCODE || e.key === 'Enter') {
        e.preventDefault();
        activatePinKey();
      }
    });
    parent.appendChild(btn);
    return btn;
  }

  function renderPinPad() {
    pinPad.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'pin-pad-grid';
    grid.setAttribute('data-cols', '3');
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    var row;
    for (row = 0; row < 3; row++) {
      var rowEl = document.createElement('div');
      rowEl.className = 'pin-pad-row';
      var col;
      for (col = 0; col < 3; col++) {
        addPinKeyButton(rowEl, keys[row * 3 + col]);
      }
      grid.appendChild(rowEl);
    }
    var bottomRow = document.createElement('div');
    bottomRow.className = 'pin-pad-row pin-pad-row-bottom';
    var spacer = document.createElement('span');
    spacer.className = 'pin-pad-spacer';
    bottomRow.appendChild(spacer);
    addPinKeyButton(bottomRow, '0');
    addPinKeyButton(bottomRow, 'Delete');
    grid.appendChild(bottomRow);
    pinPad.appendChild(grid);
  }

  function setProfileRowVisible(showAll) {
    if (!rowEl) return;
    var cards = rowEl.querySelectorAll('.profile-card');
    cards.forEach(function (c) {
      if (showAll) {
        c.hidden = false;
        c.classList.remove('profile-card--hidden');
      } else if (c !== selectedCard) {
        c.hidden = true;
        c.classList.add('profile-card--hidden');
      } else {
        c.hidden = false;
        c.classList.remove('profile-card--hidden');
      }
    });
  }

  function enterPinMode(user, card) {
    if (!sizeReady) return;
    mode = 'pinEntry';
    syncHeaderTitle();
    selectedUser = user;
    selectedCard = card;
    screen.classList.add('profile-picker--pin-mode');
    if (selectedCard) selectedCard.classList.add('profile-card--selected');
    setProfileRowVisible(false);
    pinPanel.hidden = false;
    pinEntry.clear();
    pinDisplay.textContent = '';
    setPinError('');
    renderPinPad();
    var firstPadBtn = pinPad.querySelector('.pin-pad-btn');
    if (firstPadBtn) firstPadBtn.focus();
  }

  function exitPinMode() {
    mode = 'browsing';
    syncHeaderTitle();
    syncHeaderSpinner();
    pinEntry.clear();
    pinPanel.hidden = true;
    setPinError('');
    screen.classList.remove('profile-picker--pin-mode');
    if (selectedCard) selectedCard.classList.remove('profile-card--selected');
    setProfileRowVisible(true);
    selectedUser = null;
    selectedCard = null;
    if (rowEl) {
      var first = rowEl.querySelector('.profile-card:not(.profile-card--hidden)');
      if (first) first.focus();
    }
  }

  function runBootstrapWithTimeout(op) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      bootstrapTimer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error(
          'Connecting to Plex timed out. Check network and server, then try again.'
        ));
      }, BOOTSTRAP_TIMEOUT_MS);
      pinFlowLog('bootstrap start');
      runAppBootstrap({
        onStatus: function (statusMsg) {
          if (!isActiveSwitch(op)) return;
          reportPinFlowProgress(statusMsg);
        }
      }).then(function () {
        if (settled) return;
        if (!isActiveSwitch(op)) return;
        settled = true;
        clearTimeout(bootstrapTimer);
        bootstrapTimer = null;
        pinFlowLog('bootstrap complete');
        resolve();
      }).catch(function (err) {
        if (settled) return;
        settled = true;
        clearTimeout(bootstrapTimer);
        bootstrapTimer = null;
        pinFlowLog('bootstrap error', err);
        reject(err);
      });
    });
  }

  function openHomeAfterBootstrap(op) {
    switching = true;
    syncHeaderSpinner();
    reportPinFlowProgress('Connecting to Plex…');
    return runBootstrapWithTimeout(op).then(function () {
      if (!isActiveSwitch(op)) return;
      switching = false;
      syncHeaderSpinner();
      pinFlowLog('navigate home');
      navigate('home', {});
    });
  }

  function completeSwitch(user, pin) {
    if (switching) return;
    var op = ++switchGeneration;
    clearPinFlowTimers();
    switching = true;
    syncHeaderSpinner();
    var ownerToken = getOwnerToken();
    pinFlowLog('switch start', {
      profile: user && (user.title || user.username),
      hasPin: !!(user && (user.hasPin || user.protected))
    });
    reportPinFlowProgress(mode === 'pinEntry' ? 'Verifying PIN…' : 'Signing in…');

    pinFlowTimer = setTimeout(function () {
      if (!isActiveSwitch(op)) return;
      reportPinFlowFailure(
        'Sign-in timed out. Check network, Plex server, and PIN, then try again.',
        null,
        'flow'
      );
    }, PIN_FLOW_TIMEOUT_MS);

    switchApiTimer = setTimeout(function () {
      if (!isActiveSwitch(op)) return;
      reportPinFlowFailure('Profile switch timed out. Try again.', null, 'switch-api');
    }, SWITCH_TIMEOUT_MS);

    switchToHomeUser(user, pin, ownerToken).then(function (result) {
      if (!isActiveSwitch(op)) return;
      if (switchApiTimer) {
        clearTimeout(switchApiTimer);
        switchApiTimer = null;
      }
      pinFlowLog('switch ok');
      var nextUser = result.user || user;
      var switchedToken = result.authToken || '';
      if (shouldRejectManagedSwitchToken(nextUser, switchedToken, ownerToken)) {
        throw new Error('Profile session incomplete. Choose your profile again.');
      }
      var token = switchedToken || ownerToken;
      cache.invalidateAll();
      invalidateRetention();
      setState({
        activeHomeUser: nextUser,
        authToken: token,
        ownerAuthToken: ownerToken,
        libraries: [],
        activeLibrary: null,
        servers: [],
        activeServer: null
      });
      persistAuth({
        activeHomeUser: nextUser,
        authToken: token,
        ownerAuthToken: ownerToken
      });
      return openHomeAfterBootstrap(op);
    }).then(function () {
      if (!isActiveSwitch(op)) return;
      clearPinFlowTimers();
    }).catch(function (err) {
      if (!isActiveSwitch(op)) return;
      var msg = (err && err.message) || 'Could not switch profile.';
      if (mode === 'pinEntry' && err && !err.message) {
        msg = 'Incorrect PIN. Try again.';
      }
      reportPinFlowFailure(msg, err, 'switch-or-bootstrap');
    });
  }

  function submitPin(pin) {
    if (!selectedUser || switching) return;
    pinFlowLog('pin complete (4 digits)');
    completeSwitch(selectedUser, pin);
  }

  function onProfileSelect(user, card) {
    if (switching) return;
    if (user.hasPin || user.protected) {
      enterPinMode(user, card);
      return;
    }
    completeSwitch(user, '');
  }

  function renderProfiles(homeUsers) {
    users = homeUsers;
    applyProfilePickerCols(profilePickerCols(resolvedHomeSize, homeUsers.length));
    rowEl.innerHTML = '';
    if (isPerfEnabled()) {
      perfMark('userSelect:avatars-requested', {
        count: homeUsers.length,
        withThumb: homeUsers.filter(function (u) { return !!u.thumb; }).length
      });
    }
    // Pre-cache avatar bytes in IDB. On a warm cache resolvePosterSrc() above
    // already returns a `blob:` URL for instant decode; on cold the fetch
    // happens off-path and seeds the next session.
    var avatarUrls = homeUsers
      .map(function (u) { return u && u.thumb; })
      .filter(function (u) { return !!u; });
    if (avatarUrls.length) {
      try { prefetchAndPersistBlobs(avatarUrls); } catch (e) { /* ignore */ }
    }
    homeUsers.forEach(function (u) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'profile-card card';
      card.tabIndex = 0;
      if (u.admin) card.classList.add('profile-card--admin');
      appendProfileAvatar(card, u);
      var name = document.createElement('span');
      name.className = 'profile-card-name';
      name.textContent = u.title || u.username;
      card.appendChild(name);
      if (u.hasPin) {
        var lock = document.createElement('span');
        lock.className = 'profile-card-lock';
        lock.setAttribute('aria-hidden', 'true');
        lock.textContent = '\uD83D\uDD12';
        card.appendChild(lock);
      }
      card.addEventListener('click', function () { onProfileSelect(u, card); });
      rowEl.appendChild(card);
    });
    focusFirst(screen);
  }

  function onKeyDown(e) {
    if (mode !== 'pinEntry') return;
    var digit = isNumericKeyCode(e.keyCode);
    if (digit) {
      e.preventDefault();
      e.stopPropagation();
      pinEntry.appendDigit(digit);
      return;
    }
    if (e.keyCode === BACK_KEYCODE || e.key === 'Backspace' || e.key === 'GoBack') {
      e.preventDefault();
      e.stopPropagation();
      exitPinMode();
    }
  }

  document.addEventListener('keydown', onKeyDown, true);

  function showLoadError(msg) {
    setStatus(msg || 'Could not load profiles.', true);
    rowEl.innerHTML =
      '<button type="button" class="btn" id="profile-retry" tabindex="0">Try again</button>';
    var retryBtn = document.getElementById('profile-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', loadProfiles);
      retryBtn.focus();
    }
  }

  function bootstrapWithoutProfiles() {
    var op = ++switchGeneration;
    clearPinFlowTimers();
    switching = true;
    syncHeaderSpinner();
    openHomeAfterBootstrap(op).then(function () {
      if (!isActiveSwitch(op)) return;
      clearPinFlowTimers();
    }).catch(function (err) {
      if (!isActiveSwitch(op)) return;
      switching = false;
      syncHeaderSpinner();
      pinFlowLog('bootstrap without profiles failed', err);
      var msg = err.message || 'Could not connect.';
      if (params._from) {
        showLoadError(msg);
      } else {
        showPinFlowMessage(msg, true);
      }
    });
  }

  function loadProfiles() {
    setProfileLoading(true);
    rowEl.innerHTML = '';
    switching = false;
    setStatus('', false);
    var ownerToken = getOwnerToken();
    var clientId = getState().clientId;
    var loadTimeout = setTimeout(function () {
      if (profilesLoading && rowEl.innerHTML === '') {
        setProfileLoading(false);
        if (params._from) showLoadError('Loading profiles timed out. Check your connection.');
        else bootstrapWithoutProfiles();
      }
    }, 20000);

    fetchHomeSize(ownerToken, clientId)
      .then(function (homeSize) {
        commitPickerSize(homeSize);
        revealPickerChrome();
        return fetchHomeUsers(ownerToken, clientId);
      })
      .then(function (homeUsers) {
        clearTimeout(loadTimeout);
        setProfileLoading(false);
        if (!homeUsers.length) {
          if (params._from) {
            showLoadError('No Plex Home profiles found.');
            return;
          }
          bootstrapWithoutProfiles();
          return;
        }
        renderProfiles(homeUsers);
      }).catch(function (err) {
        clearTimeout(loadTimeout);
        setProfileLoading(false);
        if (params._from) {
          showLoadError(err.message || 'Could not load profiles.');
          return;
        }
        bootstrapWithoutProfiles();
      });
  }

  loadProfiles();

  return {
    destroy: function () {
      switchGeneration += 1;
      clearPinFlowTimers();
      document.removeEventListener('keydown', onKeyDown, true);
      detachFocus();
    }
  };
}

export {
  profilePickerScreen,
  shouldRejectManagedSwitchToken,
  profilePickerCols,
  clampProfilePickerCols
};
