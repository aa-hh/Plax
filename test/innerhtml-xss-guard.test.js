import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * XSS regression guard.
 *
 * The app builds DOM by assigning strings to `innerHTML` / `outerHTML` and via
 * `insertAdjacentHTML`. Concatenating UNTRUSTED data (remote server metadata,
 * HTTP error bodies, user input) into those sinks without escaping is
 * DOM-based XSS — and since the app holds a Plex/Jellyfin auth token in client
 * storage, any script execution is token theft.
 *
 * Statically distinguishing "trusted constant" from "untrusted data" in a
 * concatenation is infeasible (most operands are trusted layout strings,
 * version numbers, icon-SVG producers, etc.). So this guard uses a *taint-
 * source denylist* instead: for every HTML-sink statement, it strips string
 * literals and approved escaper calls, then fails if a known untrusted source
 * (e.g. `.message`, `.title`, `.summary`, `input.value`) survives unescaped.
 *
 * This catches the realistic regression — someone concatenating server
 * metadata or an error message into innerHTML without escapeHtml()/textContent
 * — while staying quiet on trusted constants.
 *
 * Escape hatch: append `/⁎ xss-ok: <reason> ⁎/` on the statement when a listed
 * token is provably safe in context (e.g. a server-side enum, not free text).
 */

var SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src');

// Calls whose return value is already safe markup/text. Stripped (with their
// args) before taint analysis, so `escapeHtml(item.title)` reads as safe.
var SAFE_PRODUCERS = [
  'escapeHtml',
  'escapeText',
  'escapeLabel',
  'esc',
  'iconSvgForKind',
  'bookmarkIconSvg'
];

// Untrusted-source tokens that must never reach an HTML sink unescaped. These
// are property accesses on server metadata / errors / user input. Matched as
// `.<token>` (property access) or, for `err`/`error`, as a bare identifier.
var TAINT_PROPS = [
  'message', 'title', 'summary', 'tagline', 'overview', 'name', 'username',
  'email', 'studio', 'tag', 'role', 'label', 'query', 'value', 'genre',
  'director', 'writer', 'cast', 'description', 'caption'
];

function listJsFiles(dir) {
  var out = [];
  readdirSync(dir).forEach(function (name) {
    var full = join(dir, name);
    var st = statSync(full);
    if (st.isDirectory()) out = out.concat(listJsFiles(full));
    else if (/\.(js|mjs)$/.test(name)) out.push(full);
  });
  return out;
}

function skipString(src, i) {
  var quote = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return i;
}

// From just after the `=` / `(`, capture the statement RHS as raw text,
// tracking bracket depth and skipping string/template literals so a `;` inside
// a literal (e.g. `&ldquo;`) never terminates the scan early.
function captureStatement(src, start) {
  var depth = 0;
  var i = start;
  var buf = '';
  while (i < src.length) {
    var ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      var end = skipString(src, i);
      buf += src.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ';' && depth === 0) {
      buf += ch;
      break;
    }
    buf += ch;
    i++;
  }
  return buf;
}

function stripLiteralsAndSafeCalls(stmt) {
  var s = stmt;
  // Drop string literals entirely.
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/"(?:\\.|[^"\\])*"/g, '""');
  // Template literals: keep ${...} expressions, drop static parts.
  s = s.replace(/`(?:\\.|[^`\\])*`/g, function (lit) {
    var inner = '';
    lit.replace(/\$\{([^}]*)\}/g, function (_, expr) { inner += ' ' + expr + ' '; return ''; });
    return inner;
  });
  // Repeatedly remove approved producer calls innermost-first so their args
  // (and any taint tokens inside them) don't count.
  var producerRe = new RegExp('\\b(?:' + SAFE_PRODUCERS.join('|') + ')\\s*\\([^()]*\\)', 'g');
  var prev;
  do { prev = s; s = s.replace(producerRe, ' SAFE '); } while (s !== prev);
  return s;
}

// A taint token is only dangerous when it is actually *concatenated* into the
// markup — i.e. directly adjacent to a `+`. A bare `item.summary ?` truthiness
// test or `if (err)` guard is harmless, so we require `+` adjacency (with no
// intervening operator like `(`, `?`, `:` that would start a new sub-expr).
function concatenated(residual, token) {
  var t = token.replace(/[.\\]/g, '\\$&');
  // prop after a `+`:  ... + foo.bar.PROP
  var after = new RegExp('\\+\\s*[\\w$\\[\\].]*' + t + '\\b');
  // prop before a `+`: foo.bar.PROP ... +
  var before = new RegExp(t + '\\b[\\w$\\[\\].]*\\s*\\+');
  return after.test(residual) || before.test(residual);
}

function survivingTaint(residual) {
  var hits = [];
  TAINT_PROPS.forEach(function (p) {
    if (concatenated(residual, '.' + p)) hits.push('.' + p);
  });
  if (concatenated(residual, 'err') || concatenated(residual, 'error')) hits.push('err');
  return hits;
}

function findSinks(src) {
  var hits = [];
  var re = /\.(innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/g;
  var m;
  while ((m = re.exec(src))) {
    var stmt = captureStatement(src, m.index + m[0].length);
    if (!/\+|\$\{/.test(stmt)) continue;       // only concatenation/interpolation
    if (/xss-ok/.test(stmt)) continue;          // explicit escape hatch
    var residual = stripLiteralsAndSafeCalls(stmt);
    var taint = survivingTaint(residual);
    if (taint.length) {
      var line = src.slice(0, m.index).split('\n').length;
      hits.push({ line: line, taint: taint, stmt: stmt.replace(/\s+/g, ' ').slice(0, 140) });
    }
  }
  return hits;
}

test('XSS guard: no unescaped untrusted data concatenated into HTML sinks', function () {
  var offenders = [];
  listJsFiles(SRC_DIR).forEach(function (file) {
    var src = readFileSync(file, 'utf8');
    findSinks(src).forEach(function (hit) {
      offenders.push(
        file.slice(file.indexOf('/src/') + 1) + ':' + hit.line +
        ' [' + hit.taint.join(', ') + '] → ' + hit.stmt
      );
    });
  });
  assert.deepEqual(
    offenders,
    [],
    'Untrusted data reaches an innerHTML/outerHTML/insertAdjacentHTML sink ' +
    'without escaping. Wrap the value in escapeHtml()/escapeText(), or build ' +
    'the node with textContent. If the token is provably safe here, append ' +
    '`/* xss-ok: reason */` to the statement.\n  ' + offenders.join('\n  ')
  );
});
