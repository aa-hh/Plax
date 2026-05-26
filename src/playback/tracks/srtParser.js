/**
 * Minimal SRT → VTTCue parser for webOS TV TextTrack API.
 */

function parseTimecode(tc) {
  var m = tc.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);
  var s = parseInt(m[3], 10);
  var ms = parseInt(m[4].slice(0, 3).padEnd(3, '0'), 10);
  return ((h * 3600 + min * 60 + s) * 1000 + ms);
}

function parseSrtToCues(srtText, offsetMs) {
  offsetMs = offsetMs || 0;
  var cues = [];
  if (!srtText) return cues;
  var blocks = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split(/\n\n+/);
  blocks.forEach(function (block) {
    var lines = block.split('\n').filter(function (l) { return l.trim(); });
    if (lines.length < 2) return;
    var timeLine = lines[0].indexOf('-->') >= 0 ? lines[0] : lines[1];
    var textStart = timeLine === lines[0] ? 1 : 2;
    var parts = timeLine.split('-->');
    if (parts.length < 2) return;
    var start = parseTimecode(parts[0]) + offsetMs;
    var end = parseTimecode(parts[1]) + offsetMs;
    if (end <= start) return;
    var text = lines.slice(textStart).join('\n');
    try {
      cues.push(new VTTCue(start / 1000, end / 1000, text));
    } catch (e) {
      /* VTTCue unsupported — skip */
    }
  });
  return cues;
}

export { parseSrtToCues };
