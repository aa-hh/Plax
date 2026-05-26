/** Shared UI formatting helpers. */

function formatDuration(ms) {
  var totalMin = Math.round((parseInt(ms, 10) || 0) / 60000);
  if (!totalMin) return '';
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  return h ? (h + 'h ' + m + 'm') : (m + 'm');
}

export { formatDuration };
