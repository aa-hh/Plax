import { getState, setState } from '../../core/store.js';
import {
  persistAuth,
  getOwnerAuthToken,
  readSessionHomeSize,
  writeSessionHomeSize
} from '../../core/storage.js';
import { fetchHomeSize } from '../../plex/auth/pinAuth.js';
import { fetchHomeUsers, switchToHomeUser } from '../../plex/users/homeUsers.js';
import { createPinEntry, isNumericKeyCode } from '../pinEntry.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { createSpinner } from '../components/spinner.js';
import * as cache from '../../core/cache.js';

var BACK_KEYCODE = 461;
var PROFILE_PICKER_MAX_COLS = 4;

function clampProfilePickerCols(count) {
  var n = Number(count);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), PROFILE_PICKER_MAX_COLS);
}

function profilePickerCols(homeSize, userCount) {
  var fromHome = homeSize != null ? clampProfilePickerCols(homeSize) : null;
  var fromUsers = userCount != null ? clampProfilePickerCols(userCount) : null;
  if (fromHome != null && fromUsers != null) {
    return Math.min(Math.max(fromHome, fromUsers), PROFILE_PICKER_MAX_COLS);
  }
  return fromUsers || fromHome || 1;
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
    img.src = user.thumb;
    img.alt = '';
    img.loading = 'lazy';
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
  screen.className = 'screen profile-picker-screen';
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
  var profilesLoading = false;
  var resolvedHomeSize = readSessionHomeSize();

  function applyProfilePickerCols(cols) {
    var n = clampProfilePickerCols(cols);
    screen.style.setProperty('--profile-picker-cols', String(n));
    if (rowEl) rowEl.setAttribute('data-cols', String(n));
  }

  if (resolvedHomeSize != null) {
    applyProfilePickerCols(profilePickerCols(resolvedHomeSize, null));
  }

  function spinnerLabel() {
    if (profilesLoading) return 'Loading profiles';
    if (mode === 'pinEntry' && switching) return 'Verifying PIN';
    return 'Loading';
  }

  function syncHeaderSpinner() {
    var show = profilesLoading || (mode === 'pinEntry' && switching);
    if (!profileSpinner) return;
    profileSpinner.hidden = !show;
    var ring = profileSpinner.querySelector('.xplay-spinner');
    if (ring) ring.setAttribute('aria-label', spinnerLabel());
  }

  function setProfileLoading(loading) {
    profilesLoading = !!loading;
    syncHeaderSpinner();
  }

  function syncHeaderTitle() {
    if (titleEl) titleEl.textContent = mode === 'pinEntry' ? 'Enter PIN' : 'Select User';
  }

  var pinEntry = createPinEntry({
    onChange: function () {
      pinDisplay.textContent = pinEntry.getDisplayMask();
      pinError.hidden = true;
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
    pinError.textContent = msg || '';
    pinError.hidden = !msg;
    if (msg && bodyEl) bodyEl.classList.add('profile-picker--pin-error');
    else if (bodyEl) bodyEl.classList.remove('profile-picker--pin-error');
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
    btn.addEventListener('click', function () {
      if (key === 'Delete') pinEntry.deleteDigit();
      else pinEntry.appendDigit(key);
    });
    parent.appendChild(btn);
    return btn;
  }

  function renderPinPad() {
    pinPad.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'pin-pad-grid';
    grid.setAttribute('data-cols', '3');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (key) {
      addPinKeyButton(grid, key);
    });
    var spacer = document.createElement('span');
    spacer.className = 'pin-pad-spacer';
    grid.appendChild(spacer);
    addPinKeyButton(grid, '0');
    addPinKeyButton(grid, 'Delete');
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

  function completeSwitch(user, pin) {
    if (switching) return;
    switching = true;
    if (mode === 'pinEntry') {
      syncHeaderSpinner();
    } else {
      setStatus('Switching profile…', false);
    }
    var ownerToken = getOwnerToken();
    var switchTimeout = setTimeout(function () {
      if (!switching) return;
      switching = false;
      syncHeaderSpinner();
      var msg = 'Profile switch timed out. Try again.';
      if (mode === 'pinEntry') setPinError(msg);
      else setStatus(msg, true);
    }, 20000);

    switchToHomeUser(user, pin, ownerToken).then(function (result) {
      clearTimeout(switchTimeout);
      var nextUser = result.user || user;
      var switchedToken = result.authToken || '';
      if (shouldRejectManagedSwitchToken(nextUser, switchedToken, ownerToken)) {
        throw new Error('Profile session incomplete. Choose your profile again.');
      }
      var token = switchedToken || ownerToken;
      cache.invalidateAll();
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
      navigate('bootstrap', {});
    }).catch(function (err) {
      clearTimeout(switchTimeout);
      switching = false;
      syncHeaderSpinner();
      if (mode === 'pinEntry') {
        setPinError(err.message || 'Incorrect PIN. Try again.');
        pinEntry.clear();
        pinDisplay.textContent = '';
      } else {
        setStatus(err.message || 'Could not switch profile.', true);
      }
    });
  }

  function submitPin(pin) {
    if (!selectedUser || switching) return;
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

  function loadProfiles() {
    setProfileLoading(true);
    rowEl.innerHTML = '';
    switching = false;
    var ownerToken = getOwnerToken();
    var clientId = getState().clientId;
    var loadTimeout = setTimeout(function () {
      if (profilesLoading && rowEl.innerHTML === '') {
        setProfileLoading(false);
        if (params._from) showLoadError('Loading profiles timed out. Check your connection.');
        else navigate('bootstrap', {});
      }
    }, 20000);

    fetchHomeSize(ownerToken, clientId)
      .then(function (homeSize) {
        if (homeSize != null) {
          resolvedHomeSize = homeSize;
          writeSessionHomeSize(homeSize);
          applyProfilePickerCols(profilePickerCols(homeSize, null));
        }
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
          navigate('bootstrap', {});
          return;
        }
        setStatus('', false);
        renderProfiles(homeUsers);
      }).catch(function (err) {
        clearTimeout(loadTimeout);
        setProfileLoading(false);
        if (params._from) {
          showLoadError(err.message || 'Could not load profiles.');
          return;
        }
        navigate('bootstrap', {});
      });
  }

  if (params._retry) {
    setStatus('Session expired. Choose your profile again.', true);
  }

  loadProfiles();

  return {
    destroy: function () {
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
