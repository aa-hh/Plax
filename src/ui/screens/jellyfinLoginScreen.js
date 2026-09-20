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

var URL_PLACEHOLDER = 'http://192.168.1.10:8096';

/**
 * Plain-language copy for Jellyfin request failures. `context` is 'server'
 * (probing an address) or 'signin' (username/password). Every message names
 * the problem and what to do next; raw "HTTP 401" / "Request timeout" strings
 * never reach the screen.
 */
function describeJellyfinError(err, context) {
  var status = err && err.status;
  var msg = (err && err.message) || '';
  var signin = context === 'signin';
  if (status === 401) {
    return signin ? 'Incorrect username or password.' : 'That server refused the connection. Check the address.';
  }
  if (status === 403) {
    return signin ? 'This account isn’t allowed to sign in here. Check with the server owner.'
      : 'That server refused the connection (HTTP 403).';
  }
  if (status === 404) return 'Nothing answered at that address. Check the address and port.';
  if (status >= 500) return 'The server had a problem (HTTP ' + status + '). Try again in a moment.';
  if (status) return 'The server rejected the request (HTTP ' + status + ').';
  if (/timeout|timed out/i.test(msg)) {
    return signin ? 'Sign-in timed out. Check the server and network, then try again.'
      : 'No answer from that address. Check it and that the server is on, then try again.';
  }
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return 'Couldn’t reach the server. Check the address and the TV’s network connection.';
  }
  if (msg) return msg;
  return signin ? 'Sign-in failed. Try again.' : 'Could not reach that server.';
}

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
  var password = '';
  var qc = null;            // active Quick Connect controller
  var destroyed = false;
  var connecting = false;   // Connect in flight (double-press guard)
  var signingIn = false;    // Sign in in flight (double-press guard)
  // Bumped whenever the address changes so a probe of an older address that
  // resolves late can't move the flow forward with the wrong server.
  var addressGen = 0;

  var screen = document.createElement('div');
  screen.className = 'screen screen-center jellyfin-login';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Connect to Jellyfin</h1>' +
    '<p class="screen-subtitle" id="jf-subtitle">Enter your Jellyfin server address to begin.</p>' +

    '<div class="login-step is-active" id="step-server">' +
      '<div class="login-fields">' +
        '<div class="login-field" id="field-url">' +
          '<span class="login-field__label">Server address</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-url" tabindex="0">' + URL_PLACEHOLDER + '</button>' +
          '<span class="login-field__error" id="jf-url-error" hidden></span>' +
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
        '<div class="login-field" id="field-username">' +
          '<span class="login-field__label">Username</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-username" tabindex="0">Enter username</button>' +
          '<span class="login-field__error" id="jf-username-error" hidden></span>' +
        '</div>' +
        '<div class="login-field" id="field-password">' +
          '<span class="login-field__label">Password</span>' +
          '<button class="btn login-field__btn is-placeholder" id="jf-password" tabindex="0">Enter password</button>' +
          '<span class="login-field__error" id="jf-password-error" hidden></span>' +
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

  // Error sits directly under its field (red outline + line); the typed value
  // stays in the field so the user can correct rather than retype.
  function setFieldError(fieldId, msg) {
    var field = $(fieldId);
    if (!field) return;
    var line = field.querySelector('.login-field__error');
    field.classList.toggle('login-field--error', !!msg);
    if (line) {
      line.textContent = msg || '';
      line.hidden = !msg;
    }
  }

  function setStatus(id, msg, isError) {
    var el = $(id);
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status-msg' + (isError ? ' watch-status-error' : '');
  }

  function setBusy(btnId, busy, busyLabel, idleLabel) {
    var btn = $(btnId);
    if (!btn) return;
    btn.classList.toggle('is-busy', !!busy);
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    btn.textContent = busy ? busyLabel : idleLabel;
  }

  // Pre-fill URL field if arriving from the server picker with a known server.
  if (server) {
    setFieldValue($('jf-url'), server.url, URL_PLACEHOLDER);
  }

  // ---- session finalize ----
  function finalize(authResult) {
    if (!authResult || !authResult.AccessToken || !authResult.User) {
      throw new Error('Jellyfin sent an unexpected sign-in response. Try again.');
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
      defaultValue: $('jf-url').classList.contains('is-placeholder') ? (server ? server.url : '') : $('jf-url').textContent,
      confirmLabel: 'Set',
      onConfirm: function (val) {
        addressGen += 1;
        setFieldValue($('jf-url'), val, URL_PLACEHOLDER);
        setFieldError('field-url', '');
      }
    });
  });

  $('jf-connect').addEventListener('click', function () {
    if (connecting) return;
    var raw = $('jf-url').classList.contains('is-placeholder') ? '' : $('jf-url').textContent;
    if (!raw) {
      setFieldError('field-url', 'Enter your server address first.');
      $('jf-url').focus();
      return;
    }
    var gen = addressGen;
    connecting = true;
    setFieldError('field-url', '');
    setBusy('jf-connect', true, 'Connecting…', 'Connect');
    $('jf-subtitle').textContent = 'Connecting to server…';
    validateServer(raw).then(function (srv) {
      if (destroyed || gen !== addressGen) return;
      server = srv;
      $('jf-subtitle').textContent = 'Connected to ' + srv.name + '.';
      return quickConnectEnabled(srv.url).then(function (enabled) {
        if (destroyed || gen !== addressGen) return;
        if (enabled) startQuickConnect();
        else showStep('step-password');
      });
    }).catch(function (err) {
      if (destroyed || gen !== addressGen) return;
      $('jf-subtitle').textContent = 'Enter your Jellyfin server address to begin.';
      setFieldError('field-url', describeJellyfinError(err, 'server'));
    }).then(function () {
      // Only one probe is ever in flight (guarded above), so always release it.
      connecting = false;
      if (!destroyed) setBusy('jf-connect', false, 'Connecting…', 'Connect');
    });
  });

  // ---- step: quick connect ----
  function startQuickConnect() {
    showStep('step-quickconnect');
    setStatus('qc-status', 'Requesting a code…', false);
    $('qc-code').textContent = '------';
    qc = runQuickConnect(server.url, function (code) {
      if (destroyed) return;
      $('qc-code').textContent = code != null ? String(code) : '------';
      setStatus('qc-status', 'Waiting for approval…', false);
    });
    var mine = qc;
    qc.promise.then(function (authResult) {
      if (destroyed || mine !== qc) return;
      setStatus('qc-status', 'Signed in!', false);
      finalize(authResult);
    }).catch(function (err) {
      if (destroyed || mine !== qc || (err && err.message === 'cancelled')) return;
      var msg = (err && err.message) || '';
      if (/timed out/i.test(msg)) {
        // Code expired: send the user back to Connect (address preserved) for a fresh one.
        qc = null;
        showStep('step-server');
        setFieldError('field-url', 'The Quick Connect code expired. Press Connect for a new one.');
        return;
      }
      if (/unavailable/i.test(msg)) {
        setStatus('qc-status', 'Quick Connect is turned off on this server. Use your username and password instead.', true);
        return;
      }
      setStatus('qc-status', describeJellyfinError(err, 'server'), true);
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
      onConfirm: function (val) {
        username = val;
        setFieldValue($('jf-username'), val, 'Enter username');
        setFieldError('field-username', '');
      }
    });
  });

  $('jf-password').addEventListener('click', function () {
    openTextInputModal({
      variant: 'auth', title: 'Password', defaultValue: password, confirmLabel: 'Set', secret: true,
      onConfirm: function (val) {
        password = val;
        setFieldValue($('jf-password'), val ? '••••••••' : '', 'Enter password');
        setFieldError('field-password', '');
      }
    });
  });

  $('jf-signin').addEventListener('click', function () {
    if (signingIn) return;
    if (!server) { setStatus('pw-status', 'Connect to a server first.', true); return; }
    if (!username) {
      setFieldError('field-username', 'Enter a username.');
      $('jf-username').focus();
      return;
    }
    signingIn = true;
    setFieldError('field-username', '');
    setFieldError('field-password', '');
    setBusy('jf-signin', true, 'Signing in…', 'Sign in');
    setStatus('pw-status', 'Signing in…', false);
    authenticateByName(server.url, username, password).then(function (authResult) {
      if (destroyed) return;
      setStatus('pw-status', '', false);
      finalize(authResult);
    }).catch(function (err) {
      if (destroyed) return;
      setStatus('pw-status', '', false);
      var msg = describeJellyfinError(err, 'signin');
      // Credential errors belong under the password field; anything else is
      // about the server/network and reads better as the step's status line.
      if (err && (err.status === 401 || err.status === 403)) {
        setFieldError('field-password', msg);
        $('jf-password').focus();
      } else {
        setStatus('pw-status', msg, true);
      }
    }).then(function () {
      signingIn = false;
      if (!destroyed) setBusy('jf-signin', false, 'Signing in…', 'Sign in');
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

export { jellyfinLoginScreen, describeJellyfinError };
