import { getState, setState } from '../../core/store.js';
import { persistAuth, getOwnerAuthToken } from '../../core/storage.js';
import { fetchHomeUsers, switchToHomeUser } from '../../plex/users/homeUsers.js';
import { createPinEntry, isNumericKeyCode } from '../pinEntry.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import * as cache from '../../core/cache.js';

var BACK_KEYCODE = 461;

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
    '<h1 class="screen-title screen-title-compact">Who\'s watching?</h1>' +
    '<p class="screen-subtitle profile-picker-subtitle">Choose a Plex Home profile. No extra sign-in — your TV is already linked.</p>' +
    '<p class="status-msg profile-picker-status" id="profile-status"></p>' +
    '<div class="profile-picker-body" id="profile-body">' +
    '<div class="profile-picker-row" id="profile-row"></div>' +
    '<div class="profile-picker-pin" id="profile-pin" hidden>' +
    '<p class="pin-display" id="pin-display"></p>' +
    '<p class="pin-error" id="pin-error" hidden></p>' +
    '<div class="pin-pad" id="pin-pad" data-cols="3"></div>' +
    '</div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

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
    statusEl.textContent = text || '';
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
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (key) {
      addPinKeyButton(grid, key);
    });
    pinPad.appendChild(grid);

    var bottom = document.createElement('div');
    bottom.className = 'pin-pad-row-bottom';
    bottom.appendChild(document.createElement('span')).className = 'pin-pad-spacer';
    addPinKeyButton(bottom, '0');
    addPinKeyButton(bottom, 'Delete');
    pinPad.appendChild(bottom);
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
    setStatus('Switching profile…', false);
    var ownerToken = getOwnerToken();
    var switchTimeout = setTimeout(function () {
      if (!switching) return;
      switching = false;
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
    setStatus('Loading profiles…', false);
    rowEl.innerHTML = '';
    switching = false;
    var loadTimeout = setTimeout(function () {
      if (rowEl.innerHTML === '' && statusEl.textContent.indexOf('Loading') >= 0) {
        if (params._from) showLoadError('Loading profiles timed out. Check your connection.');
        else navigate('bootstrap', {});
      }
    }, 20000);

    fetchHomeUsers(getOwnerToken(), getState().clientId).then(function (homeUsers) {
      clearTimeout(loadTimeout);
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

export { profilePickerScreen, shouldRejectManagedSwitchToken };
