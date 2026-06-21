/**
 * Chrome 53 / webOS 4 CSS feature guardrail.
 *
 * The B8 (and the whole supported webOS 4 fleet) runs Chromium 53 (2016). Many
 * modern CSS features silently break there — and the modern webOS 26 simulator
 * canNOT reproduce it, so these regressions only surface on real hardware. JS is
 * already covered: rollup runs @babel/preset-env targeting `chrome 53`. CSS is
 * NOT transpiled (postcss only extracts/minifies), so it is enforced here.
 *
 * This scans src/ CSS for features unsupported by Chromium 53 and FAILS unless
 * the offending line carries an explicit acknowledgement:
 *
 *     gap: 12px;  / * chrome53-ok: reason it's acceptable or has a JS fallback * /
 *
 * That escape hatch is the whole point: you cannot add one of these features
 * without consciously deciding it's safe on Chrome 53 — which is exactly the
 * "every future decision considers Chrome 53" guarantee, at zero token cost.
 *
 * Run standalone:  npm run check:css-compat
 * Enforced by:     test/chrome53-css-guardrail.test.js  (so plain `npm test` gates it)
 */
'use strict';

var fs = require('fs');
var path = require('path');

var STYLES_DIR = path.join(__dirname, '..', 'src', 'styles');
var ACK = 'chrome53-ok'; // same-line marker that grandfathers a usage

// Each rule: { id, why (Chrome version it landed / why it breaks), re }.
// Regexes run against COMMENT-STRIPPED text so the many explanatory comments
// (e.g. "we do NOT use :focus-within") never trip the guard.
var RULES = [
  { id: 'css-grid',        why: 'CSS Grid landed Chrome 57 — absent on 53',            re: /(^|[^-\w])display\s*:\s*(inline-)?grid\b/i },
  { id: 'grid-template',   why: 'CSS Grid landed Chrome 57 — absent on 53',            re: /(^|[^-\w])grid-(template|auto|area|row|column|gap)\b\s*:/i },
  { id: 'flex-gap',        why: 'flexbox gap landed Chrome 84 — ignored on 53',         re: /(^|[^-\w])(gap|row-gap|column-gap|grid-gap)\s*:/i },
  { id: 'aspect-ratio',    why: 'aspect-ratio landed Chrome 88 — absent on 53',         re: /(^|[^-\w])aspect-ratio\s*:/i },
  { id: 'position-sticky', why: 'position:sticky landed Chrome 56 — absent on 53',      re: /position\s*:\s*sticky\b/i },
  { id: 'inset-shorthand', why: 'inset shorthand landed Chrome 87 — use top/right/bottom/left', re: /(^|[^-\w])inset\s*:/i },
  { id: 'logical-props',   why: 'logical properties landed Chrome 69+ — absent on 53',  re: /(^|[^-\w])(margin|padding|inset)-(inline|block)(-(start|end))?\s*:/i },
  { id: 'focus-within',    why: ':focus-within landed Chrome 60 — Chrome 53 DROPS the whole rule (drive with a JS class)', re: /:focus-within\b/i },
  { id: 'is-where',        why: ':is()/:where() landed Chrome 88 — absent on 53',       re: /:(is|where)\s*\(/i },
  { id: 'css-math',        why: 'clamp()/min()/max() landed Chrome 79 — absent on 53',  re: /(^|[^-\w])(clamp|min|max)\s*\(/i },
  { id: 'backdrop-filter', why: 'backdrop-filter landed Chrome 76 — absent on 53',      re: /(^|[^-\w])backdrop-filter\s*:/i },
  { id: 'container-query', why: 'container queries landed Chrome 105 — absent on 53',   re: /@container\b/i },
  { id: 'content-vis',     why: 'content-visibility landed Chrome 85 — absent on 53',   re: /(^|[^-\w])content-visibility\s*:/i },
  { id: 'place-shorthand', why: 'place-items/place-content are grid/flex-gap era — absent on 53', re: /(^|[^-\w])place-(items|content|self)\s*:/i },
  { id: 'mix-blend',       why: 'mix-blend-mode mis-composites on Chrome 53 (soft-light floods blue)', re: /(^|[^-\w])(mix-blend-mode|background-blend-mode)\s*:/i }
];

// Replace /* ... */ comments with blanks, preserving newlines so line numbers
// stay exact. Multiline comments collapse to the right number of \n.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, function (m) {
    var nl = m.split('\n').length - 1;
    return new Array(nl + 1).join('\n');
  });
}

function listCssFiles(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listCssFiles(full));
    else if (/\.css$/i.test(e.name)) out.push(full);
  });
  return out;
}

/** @returns {Array<{file,line,rule,why,text}>} un-acknowledged violations */
function findViolations() {
  if (!fs.existsSync(STYLES_DIR)) return [];
  var violations = [];
  listCssFiles(STYLES_DIR).forEach(function (file) {
    var rel = path.relative(path.join(__dirname, '..'), file);
    var original = fs.readFileSync(file, 'utf8').split('\n');
    var stripped = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    for (var i = 0; i < stripped.length; i++) {
      var code = stripped[i];
      if (!code.trim()) continue;
      for (var r = 0; r < RULES.length; r++) {
        if (RULES[r].re.test(code)) {
          // The ack marker lives in a trailing comment on the ORIGINAL line.
          if (original[i].indexOf(ACK) !== -1) continue;
          violations.push({
            file: rel, line: i + 1, rule: RULES[r].id,
            why: RULES[r].why, text: original[i].trim()
          });
        }
      }
    }
  });
  return violations;
}

module.exports = { findViolations: findViolations, RULES: RULES, ACK: ACK };

// CLI mode
if (require.main === module) {
  var v = findViolations();
  if (!v.length) {
    console.log('OK chrome53-css: no un-acknowledged Chrome 53-unsupported CSS features.');
    process.exit(0);
  }
  console.error('\n✗ chrome53-css: ' + v.length + ' Chrome 53-unsupported CSS feature(s) without a `' + ACK + '` acknowledgement:\n');
  v.forEach(function (x) {
    console.error('  ' + x.file + ':' + x.line + '  [' + x.rule + ']  ' + x.why);
    console.error('      ' + x.text);
  });
  console.error('\nFix it for Chrome 53, or — if it genuinely degrades gracefully / has a JS');
  console.error('fallback — append a same-line comment:  /* ' + ACK + ': <reason> */\n');
  process.exit(1);
}
