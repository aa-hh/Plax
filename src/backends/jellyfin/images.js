/**
 * Jellyfin image URL builders. Validated against a live 10.11 server:
 *   GET /Items/{id}/Images/Primary?tag=&maxWidth=  → 200 image/jpeg
 * Image GETs need no auth token. maxWidth keeps poster payloads small on the B8.
 */
import { jfUrl } from './client.js';

function imageUrl(server, itemId, type, tag, maxWidth) {
  if (!server || !server.url || !itemId) return '';
  var params = {};
  if (tag) params.tag = tag;
  if (maxWidth) params.maxWidth = maxWidth;
  return jfUrl(server.url, '/Items/' + itemId + '/Images/' + type, params);
}

function primaryUrl(server, itemId, tag, maxWidth) {
  return imageUrl(server, itemId, 'Primary', tag, maxWidth || 450);
}

function thumbStillUrl(server, itemId, tag, maxWidth) {
  return imageUrl(server, itemId, 'Thumb', tag, maxWidth || 640);
}

function backdropUrl(server, itemId, tag, maxWidth) {
  // Backdrop is an indexed image type; index 0 is the first backdrop.
  return imageUrl(server, itemId, 'Backdrop/0', tag, maxWidth || 1280);
}

export { imageUrl, primaryUrl, thumbStillUrl, backdropUrl };
