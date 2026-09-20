import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom, createElement } from './helpers/minimal-dom.js';
import {
  describeLoadError,
  renderStatus,
  renderRowSkeletons,
  truncateLabel
} from '../src/ui/screens/screenStates.js';

// Shared loading / empty / error renderers for the library, search and
// watchlist screens. Every error string must name the problem AND a recovery.

test('describeLoadError: maps status codes to plain-voice copy with a recovery', function () {
  assert.match(describeLoadError({ status: 401 }, 'Films'), /sign-in expired.*Settings/i);
  assert.match(describeLoadError({ status: 403 }, 'Films'), /not allowed to see Films/);
  assert.match(describeLoadError({ status: 404 }, 'Films'), /could not find Films.*sidebar/);
  assert.match(describeLoadError({ status: 503 }, 'Films'), /Try again in a moment/);
});

test('describeLoadError: timeouts and network failures name the connection', function () {
  assert.match(describeLoadError({ message: 'Request timeout' }, 'search results'), /timed out.*connection/i);
  assert.match(describeLoadError({ message: 'Failed to fetch' }, 'this list'), /reach the server.*connection/i);
  assert.match(describeLoadError({ status: 0 }, 'this list'), /reach the server/i);
});

test('describeLoadError: unknown errors still end with a recovery, never "Error occurred"', function () {
  var s = describeLoadError({ message: 'boom' }, 'Films');
  assert.equal(s, 'Could not load Films (boom). Try again.');
  assert.equal(describeLoadError(null, 'Films'), 'Could not load Films. Try again.');
});

test('renderStatus: plain message has no button; error+retry adds a focusable Try again', function () {
  installMinimalDom();
  var el = createElement('div');
  assert.equal(renderStatus(el, 'Nothing here'), null);
  assert.equal(el.children.length, 1);
  assert.equal(el.children[0].className, 'status-msg');
  assert.equal(el.children[0].textContent, 'Nothing here');

  var clicks = 0;
  var el2 = createElement('div');
  var btn = renderStatus(el2, 'Broke', { error: true, retry: function () { clicks++; } });
  assert.ok(btn, 'returns the retry button');
  assert.equal(el2.children[0].className, 'status-msg status-msg--error');
  assert.equal(btn.getAttribute('tabindex'), '0', 'D-pad reachable');
  assert.equal(btn.textContent, 'Try again');
  btn.dispatchEvent('click');
  assert.equal(clicks, 1);
});

test('renderStatus: custom retry label', function () {
  installMinimalDom();
  var el = createElement('div');
  var btn = renderStatus(el, 'Partial', { retry: function () {}, retryLabel: 'Load the rest' });
  assert.equal(btn.textContent, 'Load the rest');
});

test('renderRowSkeletons: renders the requested number of skeleton rows', function () {
  installMinimalDom();
  var el = createElement('div');
  renderRowSkeletons(el, 3);
  assert.equal(el.children.length, 3);
  assert.equal(el.children[0].className, 'row-section row-skeleton');
});

test('truncateLabel: short strings pass through, long ones get an ellipsis', function () {
  assert.equal(truncateLabel('Dune', 40), 'Dune');
  var long = new Array(30).join('word ');
  var cut = truncateLabel(long, 40);
  assert.ok(cut.length <= 40);
  assert.equal(cut.charAt(cut.length - 1), '…');
  assert.equal(cut.indexOf(' …'), -1, 'no trailing space before the ellipsis');
});

test('truncateLabel: never splits a surrogate pair (emoji) at the cut', function () {
  var s = 'abc🎬🎬🎬';
  var cut = truncateLabel(s, 5);
  var last = cut.charCodeAt(cut.length - 2);
  assert.ok(!(last >= 0xD800 && last <= 0xDBFF), 'lone high surrogate left at the cut');
  assert.equal(truncateLabel(null, 5), '');
});
