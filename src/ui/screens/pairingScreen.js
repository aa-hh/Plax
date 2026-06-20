import { createPin, pollPin, getAuthPageUrl, getQrImageUrl } from '../../plex/auth/pinAuth.js';
import { getState, setState } from '../../core/store.js';
import { persistAuth } from '../../core/storage.js';
import { focusFirst, attachFocusNav } from '../focus.js';

function generateClientId() {
  var stored = localStorage.getItem('plax_clientId');
  if (stored) return stored;
  var id = 'plax-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem('plax_clientId', id);
  return id;
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
    '<div class="pairing-qr"><img id="qr-img" alt="QR code" /></div>' +
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
  var pollActive = true;

  function startPairing() {
    document.getElementById('pair-status').textContent = 'Requesting code…';
    createPin(clientId).then(function (pin) {
      var code = String(pin.code || '').toUpperCase();
      var pinId = pin.id;
      // Space-separate the 4-char code for readability across the room.
      document.getElementById('pin-code').textContent = code.split('').join(' ');
      var authUrl = getAuthPageUrl(clientId, pin.code);
      document.getElementById('qr-img').src = getQrImageUrl(authUrl);
      document.getElementById('pair-status').textContent = 'Waiting for sign-in…';
      return pollPin(pinId, clientId, function () {
        document.getElementById('pair-status').textContent = 'Waiting for sign-in…';
      });
    }).then(function (pin) {
      if (!pollActive) return;
      document.getElementById('pair-status').textContent = 'Signed in!';
      setState({ authToken: pin.authToken, ownerAuthToken: pin.authToken });
      persistAuth({
        authToken: pin.authToken,
        ownerAuthToken: pin.authToken,
        clientId: clientId
      });
      navigate('profile-picker', {});
    }).catch(function (err) {
      document.getElementById('pair-status').textContent = 'Error: ' + err.message;
    });
  }

  document.getElementById('btn-retry').addEventListener('click', startPairing);
  document.getElementById('btn-switch-provider').addEventListener('click', function () {
    pollActive = false;
    navigate('provider-picker', {});
  });
  startPairing();
  focusFirst(screen);

  return {
    destroy: function () {
      pollActive = false;
      detachFocus();
    }
  };
}

export { pairingScreen, generateClientId };
