import { setState } from '../../core/store.js';
import { persistAuth, upsertJellyfinSession, upsertJellyfinServer } from '../../core/storage.js';
import { runAppBootstrap } from '../../core/appBootstrap.js';
import { focusFirst, attachFocusNav, invalidateFocusableCache } from '../focus.js';
import { openTextInputModal } from '../components/controls.js';
import {
  validateServer,
  quickConnectEnabled,
  runQuickConnect,
  authenticateByName
} from '../../backends/jellyfin/auth.js';

/**
 * Jellyfin sign-in: server URL → Quick Connect (primary, remote-friendly) with a
 * username/password fallback. Reached via the 'pairing' route when
 * params.provider === 'jellyfin'. All text entry uses openTextInputModal (the
 * Text Field (outlined) spec + webOS on-screen-keyboard handling). On success it
 * persists the session and navigates to Home — mirroring pairingScreen.
 */
function jellyfinLoginScreen(root, params, navigate) {
  // If arriving from the server picker, the server is pre-resolved.
  var server = (params && params.savedServer) || null;
  var username = '';
  var qc = null;            // active Quick Connect controller
  var destroyed = false;

  var screen = document.createElement('div');
  screen.className = 'screen screen-center jellyfin-login';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Connect to Jellyfin</h1>' +
    '<p class="screen-subtitle" id="jf-subtitle">Enter your Jellyfin server address to begin.</p>' +

    '<div class="login-step is-active" id="step-server">' +
      '<div class="login-fields">' +
        '<div class="login-field">' +
          '<span class="login-field__label">Server address</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-url" tabindex="0">http://192.168.1.10:8096</button>' +
        '</div>' +
      '</div>' +
      '<div class="login-actions">' +
        '<button class="btn btn-primary" id="jf-connect" tabindex="0">Connect</button>' +
      '</div>' +
    '</div>' +

    '<div class="login-step" id="step-quickconnect">' +
      '<p class="screen-subtitle" id="qc-hint">On another device, open your Jellyfin app, go to ' +
        '<strong>Quick Connect</strong>, and enter this code:</p>' +
      '<p class="pairing-code" id="qc-code">------</p>' +
      '<p class="status-msg" id="qc-status">Requesting a code…</p>' +
      '<div class="login-actions">' +
        '<button class="btn" id="jf-use-password" tabindex="0">Use username &amp; password</button>' +
      '</div>' +
    '</div>' +

    '<div class="login-step" id="step-password">' +
      '<div class="login-fields">' +
        '<div class="login-field">' +
          '<span class="login-field__label">Username</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-username" tabindex="0">Enter username</button>' +
        '</div>' +
        '<div class="login-field">' +
          '<span class="login-field__label">Password</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-password" tabindex="0">Enter password</button>' +
        '</div>' +
      '</div>' +
      '<p class="status-msg" id="pw-status"></p>' +
      '<div class="login-actions">' +
        '<button class="btn btn-primary" id="jf-signin" tabindex="0">Sign in</button>' +
      '</div>' +
    '</div>' +
    '<button class="btn login-switch-provider" id="jf-switch-provider" tabindex="0">Use a different service</button>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);

  function $(id) { return screen.querySelector('#' + id); }

  function showStep(id) {
    var steps = screen.querySelectorAll('.login-step');
    Array.prototype.forEach.call(steps, function (s) {
      s.classList.toggle('is-active', s.id === id);
    });
    invalidateFocusableCache();
    var active = $(id);
    if (active) {
      var first = active.querySelector('[tabindex], button');
      if (first) first.focus();
    }
  }

  function setFieldValue(btn, value, placeholder) {
    if (value) {
      btn.textContent = value;
      btn.classList.remove('is-placeholder');
    } else {
      btn.textContent = placeholder;
      btn.classList.add('is-placeholder');
    }
  }

  // Pre-fill URL field if arriving from the server picker with a known server.
  if (server) {
    setFieldValue($('jf-url'), server.url, 'http://192.168.1.10:8096');
  }

  // ---- session finalize ----
  function finalize(authResult) {
    if (!authResult || !authResult.AccessToken || !authResult.User) {
      throw new Error('Unexpected sign-in response');
    }
    var token = authResult.AccessToken;
    var user = { id: authResult.User.Id, name: authResult.User.Name };
    // Remember this user so the launch picker can offer instant switch next time.
    upsertJellyfinSession({
      userId: user.id, name: user.name, token: token,
      imageTag: authResult.User.PrimaryImageTag || null
    });
    var activeServer = {
      type: 'jellyfin',
      url: server.url,
      name: server.name,
      id: server.id,
      version: server.version,
      userId: user.id,
      accessToken: token,
      connectionUri: server.url // so shared playback/image paths that read connectionUri work
    };
    setState({ provider: 'jellyfin', authToken: token, user: user, activeServer: activeServer });
    persistAuth({
      provider: 'jellyfin',
      authToken: token,
      user: user,
      jellyfinServer: { url: server.url, name: server.name, id: server.id, version: server.version }
    });
    // Persist to the saved-server list (survives sign-out, drives the server picker).
    upsertJellyfinServer({ url: server.url, name: server.name, id: server.id, version: server.version });
    // Load libraries before Home (mirrors how profilePicker bootstraps for Plex).
    $('jf-subtitle').textContent = 'Loading your library…';
    runAppBootstrap({
      onStatus: function (m) { if (!destroyed) $('jf-subtitle').textContent = m; }
    }).then(function () {
      if (!destroyed) navigate('home', { _from: 'launch' });
    }).catch(function () {
      if (!destroyed) navigate('home', { _from: 'launch' });
    });
  }

  // ---- step: server URL ----
  $('jf-url').addEventListener('click', function () {
    openTextInputModal({
      variant: 'auth',
      title: 'Server address',
      defaultValue: server ? server.url : '',
      confirmLabel: 'Set',
      onConfirm: function (val) {
        setFieldValue($('jf-url'), val, 'http://192.168.1.10:8096');
      }
    });
  });

  $('jf-connect').addEventListener('click', function () {
    var raw = $('jf-url').classList.contains('is-placeholder') ? '' : $('jf-url').textContent;
    if (!raw) { $('jf-subtitle').textContent = 'Enter your server address first.'; return; }
    $('jf-subtitle').textContent = 'Connecting to server…';
    validateServer(raw).then(function (srv) {
      if (destroyed) return;
      server = srv;
      $('jf-subtitle').textContent = 'Connected to ' + srv.name + '.';
      return quickConnectEnabled(srv.url).then(function (enabled) {
        if (destroyed) return;
        if (enabled) startQuickConnect();
        else showStep('step-password');
      });
    }).catch(function (err) {
      if (destroyed) return;
      $('jf-subtitle').textContent = err && err.message ? err.message : 'Could not reach that server.';
    });
  });

  // ---- step: quick connect ----
  function startQuickConnect() {
    showStep('step-quickconnect');
    $('qc-status').textContent = 'Requesting a code…';
    qc = runQuickConnect(server.url, function (code) {
      if (destroyed) return;
      $('qc-code').textContent = code != null ? String(code) : '------';
      $('qc-status').textContent = 'Waiting for approval…';
    });
    qc.promise.then(function (authResult) {
      if (destroyed) return;
      $('qc-status').textContent = 'Signed in!';
      finalize(authResult);
    }).catch(function (err) {
      if (destroyed || (err && err.message === 'cancelled')) return;
      $('qc-status').textContent = (err && err.message) || 'Quick Connect failed.';
    });
  }

  $('jf-use-password').addEventListener('click', function () {
    if (qc) { qc.cancel(); qc = null; }
    showStep('step-password');
  });

  // ---- step: username / password ----
  $('jf-username').addEventListener('click', function () {
    openTextInputModal({
      variant: 'auth', title: 'Username', defaultValue: username, confirmLabel: 'Set',
      onConfirm: function (val) { username = val; setFieldValue($('jf-username'), val, 'Enter username'); }
    });
  });

  var password = '';
  $('jf-password').addEventListener('click', function () {
    openTextInputModal({
      variant: 'auth', title: 'Password', defaultValue: password, confirmLabel: 'Set',
      onConfirm: function (val) {
        password = val;
        setFieldValue($('jf-password'), val ? '••••••••' : '', 'Enter password');
      }
    });
  });

  $('jf-signin').addEventListener('click', function () {
    if (!server) { $('pw-status').textContent = 'Connect to a server first.'; return; }
    if (!username) { $('pw-status').textContent = 'Enter a username.'; return; }
    $('pw-status').textContent = 'Signing in…';
    authenticateByName(server.url, username, password).then(function (authResult) {
      if (destroyed) return;
      finalize(authResult);
    }).catch(function (err) {
      if (destroyed) return;
      var msg = (err && err.status === 401) ? 'Incorrect username or password.'
        : (err && err.message) || 'Sign-in failed.';
      $('pw-status').textContent = msg;
    });
  });

  $('jf-switch-provider').addEventListener('click', function () {
    if (qc) { qc.cancel(); qc = null; }
    navigate('provider-picker', {});
  });

  focusFirst(screen);

  return {
    destroy: function () {
      destroyed = true;
      if (qc) qc.cancel();
      detachFocus();
    }
  };
}

export { jellyfinLoginScreen };
