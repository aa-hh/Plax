import { createVirtualRow } from './virtualRow.js';
import { createMediaCard } from './mediaCard.js';

function rowPrefersSeriesPoster(row) {
  if (!row) return false;
  if (row.preferSeriesPoster === true) return true;
  if (row.preferSeriesPoster === false) return false;
  if (row.contentKind === 'tv' || row.contentKind === 'mixed') return true;
  return false;
}

function renderHubRow(parent, row, navigate, options) {
  options = options || {};
  if (!row || !row.items || !row.items.length) return;
  var section = document.createElement('div');
  section.className = 'row-section';
  if (row.displayVariant === 'compact') section.classList.add('row-section--compact');
  section.innerHTML = row.title
    ? '<p class="row-label">' + row.title + '</p>'
    : '';
  var container = document.createElement('div');
  section.appendChild(container);
  parent.appendChild(section);

  createVirtualRow(container, {
    items: row.items,
    visibleCount: options.visibleCount || 18,
    cols: options.cols || 10,
    renderItem: function (item, index) {
      return createMediaCard(item, function (selected, routeParams) {
        var route = routeParams || { ratingKey: selected.ratingKey };
        navigate('detail', route);
      }, {
        preferSeriesPoster: rowPrefersSeriesPoster(row),
        layout: 'row',
        deferPoster: index >= 12
      });
    }
  });
  return section;
}

export { renderHubRow, rowPrefersSeriesPoster };
