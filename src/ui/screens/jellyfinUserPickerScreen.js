import { getState, setState } from '../../core/store.js';
import {
  persistAuth,
  loadPersistedAuth,
  getJellyfinSessions,
  upsertJellyfinSession
} from '../../core/storage.js';
import { runAppBootstrap } from '../../core/appBootstrap.js';
import { invalidateRetention } from '../../core/router.js';
import * as cache from '../../core/cache.js';
import { fetchPublicUsers, authenticateByName } from '../../backends/jellyfin/auth.js';
import { primaryUrl } from '../../backends/jellyfin/images.js';
import { getCachedAvatar, fetchAndCacheAvatar, evictAvatarsNotIn } from '../../core/avatarCache.js';
import { openTextInputModal } from '../components/controls.js';
import { clampProfilePickerCols } from './profilePickerScreen.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { signalReady } from '../splashScreen.js';

/**
 * Jellyfin "who's watching" picker — the multi-user analog of Plex's profile
 * picker, but built on Jellyfin's per-user auth model: there's no owner-proxy
 * token, so each user has their own session token. We cache a token per user
 * (storage.jellyfinSessions); passwordless users sign in instantly, passworded
 * users prompt once then are cached. Reuses the .profile-card DOM/CSS.
 */
function jellyfinUserPickerScreen(root, params, navigate) {
  var persisted = loadPersistedAuth();
  var server = getState().activeServer ||
    (persisted.jellyfinServer ? Object.assign({ type: 'jellyfin', connectionUri: persisted.jellyfinServer.url }, persisted.jellyfinServer) : null);
  var baseUrl = server && server.url;

  var screen = document.createElement('div');
  screen.className = 'screen profile-picker-screen';
  screen.innerHTML =
    '<div class="profile-picker-main">' +
    '<div class="profile-picker-header">' +
    '<h1 class="screen-title screen-title-compact profile-picker-title">Who’s watching?</h1>' +
    '</div>' +
    '<p class="status-msg profile-picker-status" id="jf-pick-status" hidden></p>' +
    '<div class="profile-picker-body">' +
    '<div class="profile-picker-row" id="jf-pick-row" data-focus-zone="jellyfin-users"></div>' +
    '</div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var rowEl = screen.querySelector('#jf-pick-row');
  var statusEl = screen.querySelector('#jf-pick-status');
  var destroyed = false;
  var busy = false;

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.hidden = !msg;
    statusEl.className = 'status-msg profile-picker-status' + (isError ? ' watch-status-error' : '');
  }

  function initials(name) {
    var n = (name || '?').trim();
    var parts = n.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }

  // ---- activate a resolved session: set active user, bootstrap, open Home ----
  function activate(session) {
    if (busy) return;
    busy = true;
    setStatus('Signing in…');
    var activeServer = Object.assign({}, server, {
      type: 'jellyfin',
      url: baseUrl,
      connectionUri: baseUrl,
      userId: session.userId,
      accessToken: session.token
    });
    cache.invalidateAll();
    invalidateRetention();
    upsertJellyfinSession(session);
    setState({
      provider: 'jellyfin',
      authToken: session.token,
      user: { id: session.userId, name: session.name },
      activeServer: activeServer,
      libraries: [],
      activeLibrary: null
    });
    persistAuth({
      provider: 'jellyfin',
      authToken: session.token,
      user: { id: session.userId, name: session.name },
      jellyfinServer: { url: baseUrl, name: server.name, id: server.id, version: server.version }
    });
    runAppBootstrap({
      onStatus: function (m) { if (!destroyed) setStatus(m); }
    }).then(function () {
      if (!destroyed) navigate('home', {});
    }).catch(function (err) {
      busy = false;
      if (!destroyed) setStatus((err && err.message) || 'Could not load library.', true);
    });
  }

  function authThen(name, password) {
    setStatus('Signing in as ' + name + '…');
    authenticateByName(baseUrl, name, password).then(function (res) {
      if (destroyed) return;
      if (!res || !res.AccessToken || !res.User) throw new Error('Sign-in failed');
      activate({
        userId: res.User.Id,
        name: res.User.Name,
        token: res.AccessToken,
        imageTag: res.User.PrimaryImageTag || null
      });
    }).catch(function (err) {
      busy = false;
      if (destroyed) return;
      var msg = (err && err.status === 401) ? 'Incorrect password.' : ((err && err.message) || 'Sign-in failed.');
      setStatus(msg, true);
    });
  }

  function promptPassword(name) {
    openTextInputModal({
      variant: 'auth',
      title: 'Password for ' + name,
      confirmLabel: 'Sign in',
      onConfirm: function (pw) { authThen(name, pw); }
    });
  }

  // entry: { userId, name, hasPassword, imageTag, cachedToken }
  function onSelect(entry) {
    if (busy) return;
    if (entry.cachedToken) {
      activate({ userId: entry.userId, name: entry.name, token: entry.cachedToken, imageTag: entry.imageTag });
      return;
    }
    if (entry.hasPassword) {
      promptPassword(entry.name);
      return;
    }
    authThen(entry.name, '');
  }

  function onOtherUser() {
    if (busy) return;
    openTextInputModal({
      variant: 'auth',
      title: 'Username',
      confirmLabel: 'Next',
      onConfirm: function (name) {
        if (!name) return;
        promptPassword(name);
      }
    });
  }

  function makeCard(entry) {
    var card = document.createElement('button');
    card.type = 'button';
    card.className = 'profile-card card';
    card.tabIndex = 0;
    var avatar = document.createElement('span');
    avatar.className = 'profile-card-avatar';
    if (entry.imageTag && baseUrl) {
      avatar.classList.add('profile-card-avatar--img');
      var img = document.createElement('img');
      var networkUrl = primaryUrl({ url: baseUrl }, entry.userId, entry.imageTag, 300);
      var cached = getCachedAvatar(entry.userId);
      if (cached) {
        img.src = cached;
      } else {
        img.src = networkUrl;
        // Fetch and cache in the background — does not block render
        fetchAndCacheAvatar(entry.userId, networkUrl);
      }
      img.alt = '';
      img.addEventListener('error', function () {
        avatar.classList.remove('profile-card-avatar--img');
        img.remove();
        avatar.textContent = initials(entry.name);
      });
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(entry.name);
    }
    card.appendChild(avatar);
    var nameEl = document.createElement('span');
    nameEl.className = 'profile-card-name';
    nameEl.textContent = entry.name;
    card.appendChild(nameEl);
    // Lock only when a password is required AND we don't already hold a token.
    if (entry.hasPassword && !entry.cachedToken) {
      var lock = document.createElement('span');
      lock.className = 'profile-card-lock';
      lock.setAttribute('aria-hidden', 'true');
      lock.textContent = '🔒';
      card.appendChild(lock);
    }
    card.addEventListener('click', function () { onSelect(entry); });
    return card;
  }

  function render(entries) {
    rowEl.innerHTML = '';
    entries.forEach(function (e) { rowEl.appendChild(makeCard(e)); });
    // "Other user" (hidden accounts / type a username)
    var other = document.createElement('button');
    other.type = 'button';
    other.className = 'profile-card card profile-card--other';
    other.tabIndex = 0;
    other.innerHTML =
      '<span class="profile-card-avatar">+</span>' +
      '<span class="profile-card-name">Other user</span>';
    other.addEventListener('click', onOtherUser);
    rowEl.appendChild(other);

    // Drive the row's width from the card count (incl. the "Other user" tile) so it
    // lays out horizontally like Plex. Without this, --profile-picker-cols stays at
    // its default of 1 and the centered flex-wrap row collapses to a vertical stack.
    var cols = clampProfilePickerCols(entries.length + 1);
    screen.style.setProperty('--profile-picker-cols', String(cols));
    rowEl.setAttribute('data-cols', String(cols));

    var first = rowEl.querySelector('.profile-card');
    if (first) first.focus(); else focusFirst(screen);
  }

  function buildEntries(publicUsers, sessions) {
    var byId = {};
    var order = [];
    function ensure(id, name) {
      if (!byId[id]) { byId[id] = { userId: id, name: name, hasPassword: false, imageTag: null, cachedToken: null }; order.push(id); }
      return byId[id];
    }
    publicUsers.forEach(function (u) {
      var e = ensure(u.Id, u.Name);
      e.name = u.Name;
      e.hasPassword = !!u.HasPassword;
      if (u.PrimaryImageTag) e.imageTag = u.PrimaryImageTag;
    });
    sessions.forEach(function (s) {
      var e = ensure(s.userId, s.name);
      e.cachedToken = s.token;
      if (s.imageTag && !e.imageTag) e.imageTag = s.imageTag;
    });
    return order.map(function (id) { return byId[id]; });
  }

  // Wait for all <img> elements inside container to load or error, then signal.
  // Cap at 1.5 s so a slow/missing avatar never holds the splash indefinitely.
  function signalAfterImages(container) {
    var imgs = container.querySelectorAll('img');
    var pending = imgs.length;
    if (!pending) { signalReady(); return; }
    var done = false;
    var timer = setTimeout(function () { if (!done) { done = true; signalReady(); } }, 1500);
    function settle() {
      pending--;
      if (pending <= 0 && !done) { done = true; clearTimeout(timer); signalReady(); }
    }
    Array.prototype.forEach.call(imgs, function (img) {
      if (img.complete) { settle(); return; }
      img.addEventListener('load', settle);
      img.addEventListener('error', settle);
    });
  }

  function load() {
    if (!baseUrl) {
      setStatus('No Jellyfin server configured. Sign in again.', true);
      return;
    }
    setStatus('Loading users…');
    var sessions = getJellyfinSessions();
    fetchPublicUsers(baseUrl).then(function (publicUsers) {
      if (destroyed) return;
      setStatus('');
      var entries = buildEntries(publicUsers, sessions);
      evictAvatarsNotIn(entries.map(function (e) { return e.userId; }));
      if (!entries.length) {
        // No public users and no cached sessions — go straight to manual sign-in.
        onOtherUser();
        render([]);
        signalReady(); // no images to wait for
        return;
      }
      render(entries);
      signalAfterImages(rowEl);
    }).catch(function () {
      if (destroyed) return;
      setStatus('');
      render(buildEntries([], sessions));
      signalAfterImages(rowEl);
    });
  }

  load();

  return {
    destroy: function () { destroyed = true; detachFocus(); }
  };
}

export { jellyfinUserPickerScreen };
