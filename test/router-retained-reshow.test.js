import test from 'node:test';
import assert from 'node:assert/strict';

import { installMinimalDom } from './helpers/minimal-dom.js';

installMinimalDom();

test('router: retained re-show strips the enter-fade class so Back never re-animates', async function () {
  var router = await import('../src/core/router.js');
  // init() wires Back/Search key handlers on document; the minimal DOM has none.
  if (typeof document.addEventListener !== 'function') document.addEventListener = function () {};
  var root = document.createElement('div');
  document.body.appendChild(root);
  router.init(root);
  router.register('home', function (host) { host.appendChild(document.createElement('div')); return {}; });
  router.register('detail', function (host) { host.appendChild(document.createElement('div')); return {}; });

  router.navigate('home', {});
  var homeHost = root.children[0];
  assert.equal(homeHost.classList.contains('screen-host--enter'), true, 'fresh build fades in');

  router.navigate('detail', { id: 1 });
  assert.equal(homeHost.style.display, 'none', 'home hidden behind detail');

  router.navigate('home', {});
  assert.equal(homeHost.style.display, '', 'retained home re-shown');
  assert.equal(homeHost.classList.contains('screen-host--enter'), false, 'no replayed fade on re-show');
});
