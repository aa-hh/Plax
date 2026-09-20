import { createPin, pollPin, getAuthPageUrl, getQrImageUrl } from '../../plex/auth/pinAuth.js';
import { getState, setState } from '../../core/store.js';
import { persistAuth } from '../../core/storage.js';
import { focusFirst, attachFocusNav } from '../focus.js';

var BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

function generateClientId() {
  var stored = localStorage.getItem('plax_clientId');
  if (stored) return stored;
  var id = 'plax-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('plax_clientId', id);
  return id;
}

// Plain-language copy for the ways plex.tv pairing fails. Every message names
// the recovery (the "Refresh code" button is always focusable beside it).
function describePairingError(err) {
  var msg = (err && err.message) || '';
  if (/timed out/i.test(msg)) return 'This code expired. Press Refresh code for a new one.';
  if (/timeout/i.test(msg)) return 'plex.tv is slow to answer. Check the TV’s network, then press Refresh code.';
  if (err && err.status === 429) return 'plex.tv is asking us to slow down. Wait a moment, then press Refresh code.';
  if (err && err.status >= 500) return 'plex.tv had a problem (HTTP ' + err.status + '). Press Refresh code to try again.';
  if (err && err.status) return 'plex.tv rejected the request (HTTP ' + err.status + '). Press Refresh code to try again.';
  return 'Couldn’t reach plex.tv. Check the TV’s network connection, then press Refresh code.';
}

function pairingScreen(root, params, navigate) {
  var clientId = getState().clientId || generateClientId();
  setState({ clientId: clientId });

  var screen = document.createElement('div');
  screen.className = 'screen screen-center pairing-screen';
  screen.setAttribute('data-focus-mode', 'sequential');
  screen.innerHTML =
    '<h1 class="screen-title">Sign in to Plex</h1>' +
    '<p class="screen-subtitle">Visit <strong>plex.tv/link</strong> and enter this code, or scan the QR code</p>' +
    '<div class="pairing-layout pairing-layout-centered">' +
    // Transparent 1×1 GIF until plex.tv answers: the white tile stays blank
    // instead of showing a broken-image box while the code is requested.
    '<div class="pairing-qr"><img id="qr-img" alt="QR code" src="' + BLANK_GIF + '" /></div>' +
    '<div class="pairing-code-block">' +
    '<p class="pairing-code" id="pin-code">----</p>' +
    '<p class="status-msg" id="pair-status">Starting pairing…</p>' +
    '<div class="pairing-actions">' +
    '<button class="btn" id="btn-retry" tabindex="0">Refresh code</button>' +
    '<button class="btn login-switch-provider" id="btn-switch-provider" tabindex="0">Use a different service</button>' +
    '</div>' +
    '</div></div>';

  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  var destroyed = false;
  // Each "Refresh code" starts a new generation; results from an older
  // createPin/pollPin chain are dropped so a slow first poll can never sign in
  // over a newer code (or after the user has left the screen).
  var generation = 0;
  var requesting = false;

  function $(id) { return screen.querySelector('#' + id); }
  function setStatus(text, isError) {
    var el = $('pair-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'status-msg' + (isError ? ' watch-status-error' : '');
  }
  function setPairingState(state) {
    screen.classList.remove('pairing--requesting', 'pairing--ready', 'pairing--error');
    if (state) screen.classList.add('pairing--' + state);
  }

  function startPairing() {
    if (requesting) return; // double-press guard while a code is being requested
    requesting = true;
    var gen = ++generation;
    function live() { return !destroyed && gen === generation; }

    setPairingState('requesting');
    $('pin-code').textContent = '----';
    setStatus('Requesting code…', false);
    createPin(clientId).then(function (pin) {
      if (gen === generation) requesting = false;
      if (!live()) return;
      var code = String(pin.code || '').toUpperCase();
      // Space-separate the 4-char code for readability across the room.
      $('pin-code').textContent = code.split('').join(' ');
      var authUrl = getAuthPageUrl(clientId, pin.code);
      var qrImg = $('qr-img');
      try {
        qrImg.src = getQrImageUrl(authUrl);
        screen.classList.remove('pairing--no-qr');
      } catch (e) {
        // QR rendering failed: hide the tile; the typed code still works.
        screen.classList.add('pairing--no-qr');
      }
      setPairingState('ready');
      setStatus('Waiting for sign-in…', false);
      return pollPin(pin.id, clientId, function () {
        if (live()) setStatus('Waiting for sign-in…', false);
      });
    }).then(function (pin) {
      if (!live() || !pin) return;
      setStatus('Signed in!', false);
      setState({ authToken: pin.authToken, ownerAuthToken: pin.authToken });
      persistAuth({
        authToken: pin.authToken,
        ownerAuthToken: pin.authToken,
        clientId: clientId
      });
      navigate('profile-picker', {});
    }).catch(function (err) {
      if (gen === generation) requesting = false;
      if (!live()) return;
      $('pin-code').textContent = '----';
      setPairingState('error');
      setStatus(describePairingError(err), true);
      var retry = $('btn-retry');
      if (retry) retry.focus();
    });
  }

  $('btn-retry').addEventListener('click', startPairing);
  $('btn-switch-provider').addEventListener('click', function () {
    generation += 1;
    navigate('provider-picker', {});
  });
  startPairing();
  focusFirst(screen);

  return {
    destroy: function () {
      destroyed = true;
      generation += 1;
      detachFocus();
    }
  };
}

export { pairingScreen, generateClientId, describePairingError };
