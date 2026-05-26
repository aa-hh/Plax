/**
 * Minimal SRT → VTTCue parser for webOS TV TextTrack API.
 */

function parseTimecode(tc) {
  var m = tc.trim().match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
  if (!m) return 0;
  var h = parseInt(m[1] || '0', 10);
  var min = parseInt(m[2], 10);
  var s = parseInt(m[3], 10);
  var ms = parseInt(m[4].slice(0, 3).padEnd(3, '0'), 10);
  return ((h * 3600 + min * 60 + s) * 1000 + ms);
}

function makeCue(startMs, endMs, text, cues) {
  if (endMs <= startMs) return;
  try {
    cues.push(new VTTCue(startMs / 1000, endMs / 1000, text));
  } catch (e) {
    /* VTTCue unsupported — skip */
  }
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
    var text = lines.slice(textStart).join('\n');
    makeCue(start, end, text, cues);
  });
  return cues;
}

function parseVttToCues(vttText, offsetMs) {
  offsetMs = offsetMs || 0;
  var cues = [];
  if (!vttText) return cues;
  var blocks = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/^\uFEFF?WEBVTT[^\n]*\n/i, '')
    .split(/\n\n+/);
  blocks.forEach(function (block) {
    var lines = block.split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return;
    var timeIndex = lines[0].indexOf('-->') >= 0 ? 0 : 1;
    if (!lines[timeIndex] || lines[timeIndex].indexOf('-->') < 0) return;
    var parts = lines[timeIndex].split('-->');
    var start = parseTimecode(parts[0]) + offsetMs;
    var end = parseTimecode(parts[1]) + offsetMs;
    makeCue(start, end, lines.slice(timeIndex + 1).join('\n'), cues);
  });
  return cues;
}

function splitAssFields(value, count) {
  var fields = [];
  var rest = value;
  for (var i = 0; i < count - 1; i++) {
    var comma = rest.indexOf(',');
    if (comma < 0) break;
    fields.push(rest.slice(0, comma).trim());
    rest = rest.slice(comma + 1);
  }
  fields.push(rest.trim());
  return fields;
}

function stripAssMarkup(text) {
  return String(text || '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\h/g, ' ');
}

function parseAssToCues(assText, offsetMs) {
  offsetMs = offsetMs || 0;
  var cues = [];
  if (!assText) return cues;
  var format = [];
  var lines = assText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  lines.forEach(function (line) {
    var formatMatch = line.match(/^Format:\s*(.+)$/i);
    if (formatMatch) {
      format = formatMatch[1].split(',').map(function (field) {
        return field.trim().toLowerCase();
      });
      return;
    }
    var dialogMatch = line.match(/^Dialogue:\s*(.+)$/i);
    if (!dialogMatch || !format.length) return;
    var fields = splitAssFields(dialogMatch[1], format.length);
    var startIndex = format.indexOf('start');
    var endIndex = format.indexOf('end');
    var textIndex = format.indexOf('text');
    if (startIndex < 0 || endIndex < 0 || textIndex < 0) return;
    var start = parseTimecode(fields[startIndex]) + offsetMs;
    var end = parseTimecode(fields[endIndex]) + offsetMs;
    makeCue(start, end, stripAssMarkup(fields[textIndex]), cues);
  });
  return cues;
}

function parseSubtitleTextToCues(text, offsetMs) {
  var raw = String(text || '');
  if (/^\uFEFF?WEBVTT\b/i.test(raw)) return parseVttToCues(raw, offsetMs);
  if (/^\s*\[Script Info\]/i.test(raw) || /^Dialogue:/im.test(raw)) {
    return parseAssToCues(raw, offsetMs);
  }
  return parseSrtToCues(raw, offsetMs);
}

export { parseSrtToCues, parseVttToCues, parseAssToCues, parseSubtitleTextToCues };
