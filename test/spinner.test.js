import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from './helpers/minimal-dom.js';
import { createSpinner } from '../src/ui/components/spinner.js';

installMinimalDom();

test('createSpinner: default medium markup and aria', function () {
  var el = createSpinner();
  assert.equal(el.className.indexOf('xplay-spinner-wrap') >= 0, true);
  assert.equal(el.className.indexOf('xplay-spinner-medium') >= 0, true);
  assert.equal(el.hidden, false);

  var ring = el.querySelector('.xplay-spinner');
  assert.ok(ring);
  assert.equal(ring.getAttribute('role'), 'status');
  assert.equal(ring.getAttribute('aria-label'), 'Loading');
});

test('createSpinner: size, label, hidden, and extra class', function () {
  var el = createSpinner({
    size: 'large',
    label: 'Buffering',
    hidden: true,
    className: 'my-spinner'
  });
  assert.equal(el.className.indexOf('xplay-spinner-large') >= 0, true);
  assert.equal(el.className.indexOf('my-spinner') >= 0, true);
  assert.equal(el.hidden, true);
  assert.equal(el.querySelector('.xplay-spinner').getAttribute('aria-label'), 'Buffering');
});
