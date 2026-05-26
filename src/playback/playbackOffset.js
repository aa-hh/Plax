var TRANSCODE_MODES = {
  'transcode-hls': true,
  'transcode-http': true,
  'direct-stream': true
};

function playbackUrlHasOffset(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    var parsed = new URL(url, 'http://localhost/');
    var o = parsed.searchParams.get('offset');
    if (o == null || o === '') return false;
    var n = parseInt(o, 10);
    return !isNaN(n) && n > 0;
  } catch (e) {
    return /[?&]offset=\d+/i.test(url);
  }
}

function shouldSkipClientPlaybackOffset(url, mode, offsetMs) {
  if (!offsetMs || offsetMs <= 0) return true;
  if (!TRANSCODE_MODES[mode]) return false;
  return playbackUrlHasOffset(url);
}

export { playbackUrlHasOffset, shouldSkipClientPlaybackOffset, TRANSCODE_MODES };
