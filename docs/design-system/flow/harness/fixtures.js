/**
 * Mock fixtures for the flow-thumbnail harness. Designed to fill every visible
 * rail/grid so screenshots look dense and representative of the real app.
 *
 * Shape matches what mediaCard / hubRow / detailScreen expect from the normalized
 * Plex item shape.
 */
const TITLES = [
  'Skyfall Protocol', 'The Quiet Coast', 'Northwind', 'Echoes of Tomorrow', 'Paper Cities',
  'Midnight Atlas', 'Glasshouse', 'The Long Field', 'Verdant', 'Cold Harbor',
  'Lantern', 'Ironwood', 'Sable', 'Driftwood Bay', 'The Cartographer', 'Halcyon',
  'Northbound', 'Stillwater', 'Apex', 'Far Country', 'Hollow Crown', 'Bright Anchor',
  'The Reckoning', 'Salt & Steel', 'Veil', 'Slow Burn', 'Other Coast', 'River Tones',
];

let id = 1000;
function mkItem(o) {
  o = o || {};
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
      { tag: 'Mara Vance',   role: 'Mara Vance',   thumb: 'cast/1' },
      { tag: 'Eli Brandt',   role: 'Eli Brandt',   thumb: 'cast/2' },
      { tag: 'Sofia Reyes',  role: 'Sofia Reyes',  thumb: 'cast/3' },
      { tag: 'Tom Walsh',    role: 'Det. Walsh',   thumb: 'cast/4' },
      { tag: 'Aya Nakamura', role: 'Aya Nakamura', thumb: 'cast/5' },
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
  { id: '1', key: '1', title: 'Films',    type: 'movie' },
  { id: '2', key: '2', title: 'TV Shows', type: 'show' },
  { id: '3', key: '3', title: 'Kids',     type: 'movie' },
];

function continueRow() {
  const r = row('Continue Watching', 'movie', 6);
  r.items.forEach((it, i) => { it.viewOffset = (0.2 + i * 0.13) * it.duration; });
  return r;
}

// Five named rails — enough to fill a 1080p home view + scroll into a few more.
const homeRows = [
  continueRow(),
  row('Trending Now',                        'movie', 9),
  row('New Releases',                        'movie', 9),
  row('Because You Watched Northwind',       'show',  9),
  row('Recently Added · Films',              'movie', 9),
  row('Recommended for You',                 'show',  9),
];

// Library grid (~36 items → 5 visible rows in a 6-col grid).
const libraryItems = [];
for (let i = 0; i < 36; i++) libraryItems.push(mkItem({ type: 'movie' }));

const searchRows = [row('Movies', 'movie', 8), row('TV Shows', 'show', 6), row('Episodes', 'episode', 6)];

const watchlistItems = [];
for (let i = 0; i < 18; i++) watchlistItems.push(mkItem({ type: 'movie' }));

// Detail fixtures
const movie   = mkItem({ ratingKey: '5001', type: 'movie',  title: 'Northwind' });
const show    = mkItem({ ratingKey: '5002', type: 'show',   title: 'The Long Field', childCount: 3, leafCount: 24, genres: ['Drama', 'Mystery'] });
const season  = mkItem({ ratingKey: '5003', type: 'season', title: 'Season 2', parentTitle: 'The Long Field', childCount: 8, leafCount: 8 });
const episode = mkItem({ ratingKey: '5004', type: 'episode', title: 'The Tide Returns', grandparentTitle: 'The Long Field', parentIndex: 2, index: 5, duration: 52 * 60 * 1000, summary: 'Mara confronts the truth about the harbor as the season turns.' });

function seasons() {
  return [
    mkItem({ type: 'season', title: 'Season 1', index: 1, childCount: 8 }),
    mkItem({ type: 'season', title: 'Season 2', index: 2, childCount: 8 }),
    mkItem({ type: 'season', title: 'Season 3', index: 3, childCount: 8 }),
  ];
}
function episodes() {
  const out = [];
  for (let i = 1; i <= 8; i++) {
    out.push(mkItem({ type: 'episode', title: 'Episode ' + i, grandparentTitle: 'The Long Field', parentIndex: 2, index: i, art: 'art/ep' + i }));
  }
  return out;
}

export const FIX = {
  server, user, libraries,
  homeRows, libraryItems, searchRows, watchlistItems,
  movie, show, season, episode, seasons, episodes,
  mkItem, row,
};
