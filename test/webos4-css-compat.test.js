import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

var cssSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/app.css'),
  'utf8'
);

function firstRule(selectorPrefix) {
  var idx = cssSrc.indexOf('\n' + selectorPrefix + ' {');
  if (idx < 0) idx = cssSrc.indexOf(selectorPrefix + ' {');
  assert.ok(idx >= 0, selectorPrefix + ' rule present');
  var start = cssSrc.indexOf('{', idx);
  var depth = 0;
  var i;
  for (i = start; i < cssSrc.length; i++) {
    if (cssSrc[i] === '{') depth++;
    else if (cssSrc[i] === '}') {
      depth--;
      if (depth === 0) return cssSrc.slice(idx, i + 1);
    }
  }
  assert.fail(selectorPrefix + ' rule not closed');
}

function assertNoGapInBlock(block, label) {
  assert.doesNotMatch(block, /\bgap\s*:/, label + ' must not use flex/grid gap');
}

test('webOS 4 CSS: no flex/grid gap in critical layout containers', function () {
  var critical = [
    '.home-layout',
    '.library-layout',
    '.library-grid-host',
    '.media-grid',
    '.row-scroll',
    '.pairing-layout',
    '.detail-layout',
    '.player-transport',
    '.player-seek-row',
    '.profile-picker-row',
    '.pin-pad-grid',
    '.settings-watchlist-row',
    '.user-bar'
  ];
  critical.forEach(function (sel) {
    assertNoGapInBlock(firstRule(sel), sel);
  });
});

test('webOS 4 CSS: no display grid or repeat(var()) column templates', function () {
  assert.doesNotMatch(cssSrc, /display:\s*grid/);
  assert.doesNotMatch(cssSrc, /grid-template-columns:\s*repeat\(var\(/);
  assert.doesNotMatch(cssSrc, /justify-self:/);
});

test('webOS 4 CSS: no aspect-ratio, inset, clamp(), or CSS min()/max()', function () {
  assert.doesNotMatch(cssSrc, /aspect-ratio\s*:/);
  assert.doesNotMatch(cssSrc, /\binset\s*:/);
  assert.doesNotMatch(cssSrc, /[^a-zA-Z-]clamp\s*\(/);
  assert.doesNotMatch(cssSrc, /[^a-zA-Z-]min\s*\(/);
  assert.doesNotMatch(cssSrc, /[^a-zA-Z-]max\s*\(/);
  assert.doesNotMatch(cssSrc, /scroll-padding-inline\s*:/);
});

test('webOS 4 CSS: library grid uses margin gutters not gap', function () {
  // Full-width JetStream grid: 6 large (248px) cards across --content-max. The
  // half-gutter is 14px (→ 28px between cards) — at the larger card a 20px half-
  // gutter overflows the row to 5. Still margin-based, never `gap:`.
  assert.match(cssSrc, /\.media-grid[\s\S]*margin:\s*-14px -14px/);
  assert.match(cssSrc, /\.media-grid > \.media-card[\s\S]*margin:\s*14px 14px/);
});

test('webOS 4 CSS: library grid uses the standard 2-col card dimensions', function () {
  // Browse grid adopts the JetStream/Home card footprint (--row-poster-w/h,
  // 248×372 2:3) for the full-width layout, not the old dense --grid-poster-*.
  assert.match(
    cssSrc,
    /\.media-grid \.media-card \.card-poster-wrap[\s\S]*width:\s*var\(--row-poster-w\)[\s\S]*height:\s*var\(--row-poster-h\)/
  );
  assert.match(
    cssSrc,
    /\.media-grid \.media-card \.poster[\s\S]*width:\s*100%[\s\S]*height:\s*100%/
  );
  assert.doesNotMatch(cssSrc, /^\.row-item\s*,\s*$/m);
});

test('webOS 4 CSS: row posters use padding-bottom 2:3 not aspect-ratio', function () {
  assert.match(
    cssSrc,
    /\.row-scroll \.row-item:not\(\.media-card--episode\) \.card-poster-wrap[\s\S]*padding-bottom:\s*150%/
  );
  assert.match(
    cssSrc,
    /\.row-scroll \.media-card:not\(\.media-card--episode\) \.card-poster-wrap \.poster[\s\S]*height:\s*100%/
  );
  assert.doesNotMatch(cssSrc, /aspect-ratio\s*:/);
});

test('webOS 4 CSS: row card width scoped to row-scroll not library grid', function () {
  assert.match(cssSrc, /\.row-scroll \.row-item[\s\S]*width:\s*var\(--row-poster-w\)/);
  assert.doesNotMatch(
    cssSrc,
    /\n\.row-item,\n[\s\S]*width:\s*var\(--row-poster-w\)/
  );
});

test('webOS 4 CSS: player transport uses flex not grid', function () {
  var block = firstRule('.player-transport');
  assert.match(block, /display:\s*flex/);
  assert.doesNotMatch(block, /display:\s*grid/);
});

test('webOS 4 CSS: profile picker margins avoid calc division', function () {
  var rowBlock = firstRule('.profile-picker-row');
  assert.match(rowBlock, /margin:\s*-12px/);
  assert.doesNotMatch(rowBlock, /calc\(var\(--profile-picker-gap\)\s*\//);
  assert.match(cssSrc, /\.profile-picker-row \.profile-card[\s\S]*margin:\s*12px/);
});

test('webOS 4 CSS: positioning overlays use explicit edges not inset', function () {
  ['.loading-overlay', '.detail-modal', '.player-track-modal', '.poster-loading-overlay'].forEach(function (sel) {
    var block = firstRule(sel);
    assert.doesNotMatch(block, /\binset\s*:/);
    assert.match(block, /top:\s*0/);
    assert.match(block, /left:\s*0/);
  });
});
