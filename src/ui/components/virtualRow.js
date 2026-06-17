/**
 * Horizontal hub row with a bounded DOM window around focus.
 * Spacers preserve scroll extent; focusin shifts the rendered slice.
 */

import { hydrateRowViewport } from '../posterImages.js';

var ROW_SLOT_WIDTH = 172;

function createVirtualRow(container, options) {
  var items = options.items || [];
  var renderItem = options.renderItem;
  var maxDom = options.visibleCount || 20;
  var windowPad = options.windowPad != null ? options.windowPad : 4;
  var focusIndex = 0;
  var scrollEl = document.createElement('div');
  scrollEl.className = 'row-scroll';
  var cols = options.cols || 10;
  scrollEl.setAttribute('data-cols', String(cols));
  scrollEl.style.setProperty('--row-count', String(Math.max(1, items.length)));
  if (items.length > 0 && items.length < cols) {
    scrollEl.classList.add('row-scroll--sparse');
  }
  container.appendChild(scrollEl);

  function slotWidthPx() {
    return ROW_SLOT_WIDTH;
  }

  function makeSpacer(count) {
    if (!count || count <= 0) return null;
    var el = document.createElement('div');
    el.className = 'row-scroll-spacer';
    el.setAttribute('aria-hidden', 'true');
    el.style.flexShrink = '0';
    el.style.width = (count * slotWidthPx()) + 'px';
    el.style.pointerEvents = 'none';
    return el;
  }

  function windowBounds(focusIdx) {
    if (items.length <= maxDom) {
      return { start: 0, end: items.length };
    }
    var half = Math.floor(maxDom / 2);
    var start = Math.max(0, focusIdx - half - windowPad);
    var end = Math.min(items.length, start + maxDom + windowPad * 2);
    start = Math.max(0, end - maxDom - windowPad * 2);
    end = Math.min(items.length, start + maxDom + windowPad * 2);
    return { start: start, end: end };
  }

  function render() {
    var bounds = windowBounds(focusIndex);
    var start = bounds.start;
    var end = bounds.end;
    var preserve = document.activeElement && scrollEl.contains(document.activeElement);
    var activeIdx = preserve ? parseInt(document.activeElement.getAttribute('data-item-index'), 10) : -1;

    scrollEl.innerHTML = '';
    var lead = makeSpacer(start);
    if (lead) scrollEl.appendChild(lead);

    var i;
    for (i = start; i < end; i++) {
      var node = renderItem(items[i], i);
      if (node && node.setAttribute) node.setAttribute('data-item-index', String(i));
      scrollEl.appendChild(node);
    }

    var trail = makeSpacer(items.length - end);
    if (trail) scrollEl.appendChild(trail);

    if (preserve && !isNaN(activeIdx) && activeIdx >= start && activeIdx < end) {
      var card = scrollEl.querySelector('[data-item-index="' + activeIdx + '"]');
      if (card && card.focus) card.focus();
    }
    // Hydrate posters off the keydown tick — the focus change should commit
    // visually first, image bytes can wait one task.
    setTimeout(function () { hydrateRowViewport(scrollEl); }, 0);
  }

  function ensureWindowAround(index) {
    if (!items.length) return;
    var idx = Math.max(0, Math.min(items.length - 1, index));
    var bounds = windowBounds(focusIndex);
    if (items.length <= maxDom) {
      focusIndex = idx;
      return;
    }
    if (idx < bounds.start || idx >= bounds.end) {
      focusIndex = idx;
      render();
    } else {
      focusIndex = idx;
    }
  }

  function focusCardAt(index) {
    var card = scrollEl.querySelector('[data-item-index="' + index + '"]');
    if (!card || !card.focus) return;
    card.focus();
    // Scroll is handled by the attachFocusNav focusin → scrollFocusedIntoView path.
  }

  function onFocusIn(e) {
    var card = e.target && e.target.closest ? e.target.closest('[data-item-index]') : null;
    if (!card || !scrollEl.contains(card)) return;
    var idx = parseInt(card.getAttribute('data-item-index'), 10);
    if (isNaN(idx)) return;
    ensureWindowAround(idx);
  }

  function onRowKeydown(e) {
    if (items.length <= maxDom) return;
    var key = e.keyCode;
    if (key !== 37 && key !== 39) return;
    var active = document.activeElement;
    var card = active && active.closest ? active.closest('[data-item-index]') : null;
    if (!card || !scrollEl.contains(card)) return;
    var idx = parseInt(card.getAttribute('data-item-index'), 10);
    if (isNaN(idx)) return;
    var nextIdx = idx + (key === 39 ? 1 : -1);
    if (nextIdx < 0 || nextIdx >= items.length) return;
    if (scrollEl.querySelector('[data-item-index="' + nextIdx + '"]')) return;
    e.preventDefault();
    e.stopPropagation();
    focusIndex = nextIdx;
    render();
    focusCardAt(nextIdx);
  }

  var rowScrollTimer = null;

  function scheduleRowViewportHydrate() {
    if (rowScrollTimer) clearTimeout(rowScrollTimer);
    rowScrollTimer = setTimeout(function () {
      rowScrollTimer = null;
      hydrateRowViewport(scrollEl);
    }, 120);
  }

  function onScroll() {
    scheduleRowViewportHydrate();
  }

  scrollEl.addEventListener('focusin', onFocusIn);
  scrollEl.addEventListener('keydown', onRowKeydown, true);
  scrollEl.addEventListener('scroll', onScroll);

  function setItems(newItems) {
    items = newItems;
    focusIndex = 0;
    scrollEl.style.setProperty('--row-count', String(Math.max(1, items.length)));
    scrollEl.classList.toggle('row-scroll--sparse', items.length > 0 && items.length < cols);
    render();
  }

  function destroy() {
    scrollEl.removeEventListener('focusin', onFocusIn);
    scrollEl.removeEventListener('keydown', onRowKeydown, true);
    scrollEl.removeEventListener('scroll', onScroll);
    if (rowScrollTimer) {
      clearTimeout(rowScrollTimer);
      rowScrollTimer = null;
    }
  }

  render();
  return { setItems: setItems, element: scrollEl, destroy: destroy };
}

export { createVirtualRow };
