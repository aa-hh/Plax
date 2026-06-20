import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareFeedForRender } from '../src/ui/screens/homeFeedRender.js';

// Regression guard for the brand-new-user skeleton leak: the initial feed phase
// can resolve EMPTY (empty On Deck + Recently Added/promoted still deferred). A
// fresh (non-append) render must still clear the loading skeletons, or they sit
// above the later-appended deferred rows and clip under the immersive hero.

function fakeFeed(initialHtml) {
  return { innerHTML: initialHtml };
}

test('fresh render clears skeletons even when the initial phase has no rows', () => {
  var el = fakeFeed('<div class="row-skeleton"></div>'.repeat(3));
  var hasRows = prepareFeedForRender(el, [], false);
  assert.equal(el.innerHTML, '', 'skeletons dropped on an empty initial phase');
  assert.equal(hasRows, false, 'reports nothing to render');
});

test('append render leaves already-committed rows in place', () => {
  var el = fakeFeed('<div class="row-section">real</div>');
  var hasRows = prepareFeedForRender(el, [], true);
  assert.equal(el.innerHTML, '<div class="row-section">real</div>', 'append never clears');
  assert.equal(hasRows, false, 'reports nothing to render');
});

test('fresh render with rows clears first, then signals there is content', () => {
  var el = fakeFeed('<div class="row-skeleton"></div>');
  var hasRows = prepareFeedForRender(el, [{ items: [1] }], false);
  assert.equal(el.innerHTML, '', 'cleared before rendering the real rows');
  assert.equal(hasRows, true, 'reports rows to render');
});

test('append render with rows appends (no clear) and signals content', () => {
  var el = fakeFeed('<div class="row-section">first</div>');
  var hasRows = prepareFeedForRender(el, [{ items: [1] }], true);
  assert.equal(el.innerHTML, '<div class="row-section">first</div>', 'kept existing rows');
  assert.equal(hasRows, true, 'reports rows to render');
});

test('missing container is a safe no-op', () => {
  assert.equal(prepareFeedForRender(null, [{ items: [1] }], false), false);
});
