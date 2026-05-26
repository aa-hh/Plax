import test from 'node:test';
import assert from 'node:assert/strict';

import { isSidebarZone, isAtLeftEdge } from '../src/ui/focus.js';

function mockZone(classes, attrs) {
  attrs = attrs || {};
  return {
    classList: {
      contains: function (name) {
        return classes.indexOf(name) >= 0;
      }
    },
    getAttribute: function (name) {
      return attrs[name] != null ? String(attrs[name]) : null;
    }
  };
}

function mockActive(itemIndex) {
  return {
    getAttribute: function (name) {
      if (name === 'data-item-index' && itemIndex != null) return String(itemIndex);
      return null;
    }
  };
}

test('isSidebarZone detects browsing hub host', function () {
  assert.equal(isSidebarZone(mockZone(['browsing-hub-nav-host'])), true);
  assert.equal(isSidebarZone(mockZone(['row-scroll'])), false);
  assert.equal(isSidebarZone(null), false);
});

test('isAtLeftEdge uses index zero and virtual row metadata', function () {
  assert.equal(isAtLeftEdge(mockActive(0), mockZone(['row-scroll']), 2), true);
  assert.equal(isAtLeftEdge(mockActive(1), mockZone(['row-scroll']), 1), false);
  assert.equal(isAtLeftEdge(mockActive(null), mockZone(['top-nav']), 0), true);
});

test('isAtLeftEdge treats first grid column as left edge', function () {
  var grid = mockZone(['media-grid'], { 'data-cols': '6' });
  assert.equal(isAtLeftEdge(mockActive(null), grid, 0), true);
  assert.equal(isAtLeftEdge(mockActive(null), grid, 6), true);
  assert.equal(isAtLeftEdge(mockActive(null), grid, 1), false);
});
