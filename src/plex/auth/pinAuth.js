import { fetchJson } from '../../utils/fetch.js';
import { qrDataUrl } from '../../utils/qrDataUrl.js';
import { plexTvUrl, plexHeaders, PRODUCT, VERSION } from '../client.js';

function createPin(clientId) {
  // `strong: false` (the default) returns a friendly 4-character code that
  // works at https://plex.tv/link. Requesting a strong pin returns a long
  // hex token meant for the QR/OAuth flow only, which is hostile to anyone
  // who can't or doesn't want to scan a QR.
  return fetchJson(plexTvUrl('/api/v2/pins'), {
    method: 'POST',
    headers: plexHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ strong: false })
  });
}

function checkPin(pinId, clientId) {
  return fetchJson(plexTvUrl('/api/v2/pins/' + pinId), {
    headers: plexHeaders()
  });
}

function pollPin(pinId, clientId, onProgress) {
  var attempts = 0;
  var maxAttempts = 120;
  return new Promise(function (resolve, reject) {
    function tick() {
      attempts++;
      checkPin(pinId, clientId).then(function (pin) {
        if (onProgress) onProgress(pin);
        if (pin.authToken) {
          resolve(pin);
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('Pairing timed out'));
          return;
        }
        setTimeout(tick, 2000);
      }).catch(reject);
    }
    tick();
  });
}

function getAuthPageUrl(clientId, code) {
  return 'https://app.plex.tv/auth#?clientID=' + encodeURIComponent(clientId) +
    '&code=' + encodeURIComponent(code) +
    '&context%5Bdevice%5D%5Bproduct%5D=' + encodeURIComponent(PRODUCT);
}

function getQrImageUrl(authUrl) {
  return qrDataUrl(authUrl, 256);
}

function fetchUser(authToken, clientId) {
  return fetchJson(plexTvUrl('/api/v2/user'), {
    headers: plexHeaders({ 'X-Plex-Token': authToken })
  });
}

function signInWithToken(authToken, clientId) {
  return fetchUser(authToken, clientId).then(function (user) {
    return { authToken: authToken, user: user };
  });
}

export { createPin, checkPin, pollPin, getAuthPageUrl, getQrImageUrl, fetchUser, signInWithToken };
