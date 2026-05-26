/**
 * Minimal DOM for Node unit tests (loading overlay, player adapter, focus nav).
 */
function createClassList() {
  var tokens = new Set();
  return {
    add: function () {
      var i;
      for (i = 0; i < arguments.length; i++) tokens.add(arguments[i]);
    },
    remove: function () {
      var i;
      for (i = 0; i < arguments.length; i++) tokens.delete(arguments[i]);
    },
    toggle: function (token, force) {
      if (force === true) tokens.add(token);
      else if (force === false) tokens.delete(token);
      else if (tokens.has(token)) tokens.delete(token);
      else tokens.add(token);
    },
    contains: function (token) {
      return tokens.has(token);
    }
  };
}

function parseClassNames(className) {
  if (!className) return [];
  return String(className).split(/\s+/).filter(Boolean);
}

function matchesSelector(el, sel) {
  if (!sel || !el) return false;
  if (sel.charAt(0) === '#') {
    return el.id === sel.slice(1);
  }
  if (sel.charAt(0) === '.') {
    var want = sel.slice(1);
    return parseClassNames(el.className).indexOf(want) >= 0 ||
      (el.classList && el.classList.contains(want));
  }
  if (sel.indexOf('[') === 0) {
    var attrMatch = sel.match(/^\[([^\]=]+)(?:="?([^"\]]*)"?)?\]$/);
    if (!attrMatch) return false;
    var attrName = attrMatch[1];
    if (attrMatch[2] == null) return el.getAttribute(attrName) != null;
    return el.getAttribute(attrName) === attrMatch[2];
  }
  return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
}

function createElement(tag) {
  var listeners = Object.create(null);
  var el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    _className: '',
    classList: createClassList(),
    children: [],
    attributes: Object.create(null),
    style: Object.create(null),
    parentElement: null,
    disabled: false,
    hidden: false,
    paused: true,
    currentTime: 0,
    duration: 0,
    readyState: 0,
    src: '',
    error: null,
    textTracks: { length: 0 },
    setAttribute: function (k, v) {
      el.attributes[k] = v;
      if (k === 'id') el.id = v;
      if (k === 'class') el.className = v;
      if (k === 'disabled') el.disabled = !!v;
      if (k === 'hidden') el.hidden = !!v;
      if (k === 'tabindex') el.tabIndex = parseInt(v, 10);
    },
    getAttribute: function (k) {
      if (k === 'disabled' && el.disabled) return '';
      if (k === 'hidden' && el.hidden) return '';
      return el.attributes[k];
    },
    removeAttribute: function (k) {
      delete el.attributes[k];
      if (k === 'src') el.src = '';
      if (k === 'disabled') el.disabled = false;
      if (k === 'hidden') el.hidden = false;
    },
    hasAttribute: function (k) {
      if (k === 'disabled') return el.disabled;
      if (k === 'hidden') return el.hidden;
      return el.attributes[k] != null;
    },
    matches: function (sel) {
      return matchesSelector(el, sel);
    },
    closest: function (sel) {
      var node = el;
      while (node) {
        if (matchesSelector(node, sel)) return node;
        node = node.parentElement;
      }
      return null;
    },
    contains: function (child) {
      if (!child) return false;
      if (child === el) return true;
      var i;
      for (i = 0; i < el.children.length; i++) {
        if (el.children[i].contains(child)) return true;
      }
      return false;
    },
    focus: function () {
      if (globalThis.document && globalThis.document.__xplaySetActive) {
        globalThis.document.__xplaySetActive(el);
      }
    },
    appendChild: function (child) {
      el.children.push(child);
      child.parentElement = el;
      return child;
    },
    set className(value) {
      el._className = value || '';
      el.classList = createClassList();
      parseClassNames(el._className).forEach(function (token) {
        el.classList.add(token);
      });
    },
    get className() {
      return el._className || '';
    },
    querySelector: function (sel) {
      if (sel === '.loading-overlay-inner') {
        for (var i = 0; i < el.children.length; i++) {
          if (el.children[i].className && el.children[i].className.indexOf('loading-overlay-inner') >= 0) {
            return el.children[i];
          }
        }
      }
      var found = queryTree(el, sel, false);
      return found.length ? found[0] : null;
    },
    querySelectorAll: function (sel) {
      return queryTree(el, sel, true);
    },
    addEventListener: function (type, fn, opts) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push({ fn: fn, once: opts && opts.once });
    },
    removeEventListener: function (type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (entry) {
        return entry.fn !== fn;
      });
    },
    dispatchEvent: function (type) {
      var list = listeners[type] ? listeners[type].slice() : [];
      var i;
      for (i = 0; i < list.length; i++) {
        list[i].fn();
        if (list[i].once && listeners[type]) {
          listeners[type] = listeners[type].filter(function (entry) {
            return entry.fn !== list[i].fn;
          });
        }
      }
    },
    play: function () {
      el.paused = false;
      return Promise.resolve();
    },
    pause: function () {
      el.paused = true;
    },
    load: function () {},
    getListenerCount: function (type) {
      return listeners[type] ? listeners[type].length : 0;
    }
  };
  Object.defineProperty(el, 'offsetParent', {
    get: function () {
      if (el.hidden) return null;
      return el.parentElement || el;
    }
  });
  return el;
}

function splitSelectors(sel) {
  if (!sel || sel.indexOf(',') < 0) return [sel];
  return sel.split(',').map(function (part) { return part.trim(); }).filter(Boolean);
}

function matchesAnySelector(el, sel) {
  var parts = splitSelectors(sel);
  var i;
  for (i = 0; i < parts.length; i++) {
    if (matchesSelector(el, parts[i])) return true;
  }
  return false;
}

function queryTree(node, sel, all) {
  var out = [];
  function walk(n) {
    if (matchesAnySelector(n, sel)) {
      out.push(n);
      if (!all) return true;
    }
    var i;
    for (i = 0; i < n.children.length; i++) {
      if (walk(n.children[i])) return true;
    }
    return false;
  }
  walk(node);
  return out;
}

function installMinimalDom() {
  if (globalThis.document && globalThis.document.__xplayMinimal) return;
  var byId = Object.create(null);
  var body = createElement('body');
  var activeElement = null;

  function findById(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    var i;
    for (i = 0; i < node.children.length; i++) {
      var found = findById(node.children[i], id);
      if (found) return found;
    }
    return null;
  }

  var document = {
    __xplayMinimal: true,
    body: body,
    activeElement: null,
    getElementById: function (id) {
      return byId[id] || findById(body, id) || null;
    },
    createElement: function (tag) {
      return createElement(tag);
    },
    __xplaySetActive: function (el) {
      activeElement = el;
      document.activeElement = el;
    }
  };
  globalThis.document = document;
  globalThis.window = globalThis.window || {
    location: { href: 'http://localhost/' }
  };
  document.registerOverlay = function (el) {
    if (el && el.id) byId[el.id] = el;
  };
  document.registerPlayer = function (el) {
    if (el && el.id) byId[el.id] = el;
  };
  document.registerTree = function (root) {
    if (root && root.id) byId[root.id] = root;
    body.children = [root];
    root.parentElement = body;
  };
}

export { installMinimalDom, createElement, matchesSelector };
