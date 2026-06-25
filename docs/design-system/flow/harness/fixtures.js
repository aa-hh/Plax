/**
 * Mock fixtures for the flow-thumbnail harness — representative normalized items
 * so the REAL screens render with realistic data (no backend/network). Shapes
 * match the normalized item used by mediaCard / detailScreen.
 */
const TITLES = [
  'Skyfall Protocol', 'The Quiet Coast', 'Northwind', 'Echoes of Tomorrow', 'Paper Cities',
  'Midnight Atlas', 'Glasshouse', 'The Long Field', 'Verdant', 'Cold Harbor',
  'Lantern', 'Ironwood', 'Sable', 'Driftwood Bay', 'The Cartographer', 'Halcyon',
];

let id = 1000;
function mkItem(o) {
  id += 1;
  return Object.assign({
    ratingKey: String(o.ratingKey || id),
    type: 'movie',
    title: o.title || TITLES[id % TITLES.length],
    year: 2019 + (id % 6),
    thumb: 'thumb/' + (o.ratingKey || id),
    art: 'art/' + (o.ratingKey || id),
    duration: 60 * 60 * 1000 + (id % 5) * 9 * 60 * 1000,
    summary: 'A sweeping, character-driven story that unfolds across one unforgettable season — tense, tender, and quietly epic.',
    contentRating: ['PG', 'PG-13', 'TV-MA', 'R'][id % 4],
    rating: (7 + (id % 30) / 10).toFixed(1),
    genres: ['Drama', 'Thriller', 'Adventure'],
    directors: ['A. Marsh'], writers: ['J. Okafor'], studio: 'Northlight',
    roles: [
      { tag: 'Mara Vance', role: 'Mara Vance', thumb: 'cast/1' },
      { tag: 'Eli Brandt', role: 'Eli Brandt', thumb: 'cast/2' },
      { tag: 'Sofia Reyes', role: 'Sofia Reyes', thumb: 'cast/3' },
      { tag: 'Tom Walsh', role: 'Det. Walsh', thumb: 'cast/4' },
    ],
    viewCount: 0, viewOffset: 0,
    originallyAvailableAt: (2019 + (id % 6)) + '-04-12',
  }, o);
}

function row(title, type, n) {
  const items = [];
  for (let i = 0; i < n; i++) items.push(mkItem({ type: type || 'movie' }));
  return { title, items };
}

const server = { type: 'plex', name: 'Living Room', id: 'srv1', url: 'http://10.0.0.4:32400', connectionUri: 'http://10.0.0.4:32400', clientIdentifier: 'srv1' };
const user = { id: 'u1', title: 'Alec', username: 'alec', admin: true };
const libraries = [
  { id: '1', key: '1', title: 'Films', type: 'movie' },
  { id: '2', key: '2', title: 'TV Shows', type: 'show' },
];

// continue-watching items carry progress
function continueRow() {
  const r = row('Continue Watching', 'movie', 5);
  r.items.forEach((it, i) => { it.viewOffset = (0.2 + i * 0.13) * it.duration; });
  return r;
}

const homeRows = [
  continueRow(),
  row('Trending', 'movie', 7),
  row('New Releases', 'movie', 7),
  row('Because You Watched Northwind', 'show', 7),
];

const libraryItems = [];
for (let i = 0; i < 18; i++) libraryItems.push(mkItem({ type: 'movie' }));

const searchRows = [row('Movies', 'movie', 6), row('TV Shows', 'show', 5)];

// detail fixtures
const movie = mkItem({ ratingKey: '5001', type: 'movie', title: 'Northwind' });
const show = mkItem({ ratingKey: '5002', type: 'show', title: 'The Long Field', childCount: 3, leafCount: 24, genres: ['Drama', 'Mystery'] });
const season = mkItem({ ratingKey: '5003', type: 'season', title: 'Season 2', parentTitle: 'The Long Field', childCount: 8, leafCount: 8 });
const episode = mkItem({ ratingKey: '5004', type: 'episode', title: 'The Tide Returns', grandparentTitle: 'The Long Field', parentIndex: 2, index: 5, duration: 52 * 60 * 1000, summary: 'Mara confronts the truth about the harbor as the season turns.' });

function seasons() { return [mkItem({ type: 'season', title: 'Season 1', index: 1, childCount: 8 }), mkItem({ type: 'season', title: 'Season 2', index: 2, childCount: 8 }), mkItem({ type: 'season', title: 'Season 3', index: 3, childCount: 8 })]; }
function episodes() {
  const out = [];
  for (let i = 1; i <= 8; i++) out.push(mkItem({ type: 'episode', title: 'Episode ' + i, grandparentTitle: 'The Long Field', parentIndex: 2, index: i, art: 'art/ep' + i }));
  return out;
}

export const FIX = {
  server, user, libraries, homeRows, libraryItems, searchRows,
  movie, show, season, episode, seasons, episodes, mkItem, row,
};
