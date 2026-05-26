/**
 * Sanity checks for Plex library section mapping and restricted-user filtering.
 * Managed Plex Home users: trust GET /library/sections for the profile token.
 */
import {
  mapLibrarySection,
  mapLibrarySections,
  resolveServersForDiscovery,
  isFolderBackedLibrarySection,
  isMovieOrShowSection
} from '../src/plex/servers/discovery.js';
import {
  filterLibrariesForUser,
  canAccessLibrary,
  isMovieOrTvSection,
  isRestrictedProfile,
  normalizeSectionType
} from '../src/security/libraryAccess.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var section = mapLibrarySection({
  id: '3',
  key: '/library/sections/3',
  type: 'show',
  title: 'TV Shows',
  shared: '1',
  hidden: '0',
  accessible: '1',
  agent: 'com.plexapp.agents.thetvdb',
  scanner: 'Plex TV Series'
});
assert(section && section.id === '3', 'maps id attribute');
assert(section._accessible === true, 'accessible=1');

var numericType = mapLibrarySection({
  id: '5',
  key: '/library/sections/5',
  type: '1',
  title: 'Films',
  hidden: '0',
  agent: 'com.plexapp.agents.imdb',
  scanner: 'Plex Movie Scanner'
});
assert(numericType && numericType.type === 'movie', 'normalizes type 1 to movie');
assert(isMovieOrShowSection('2'), 'numeric show type');
assert(isMovieOrTvSection(numericType), 'isMovieOrTvSection accepts section object');

var accessibleTrueStr = mapLibrarySection({
  id: '4',
  key: '/library/sections/4',
  type: 'movie',
  title: 'Movies',
  accessible: 'true',
  shared: '0',
  agent: 'com.plexapp.agents.imdb',
  scanner: 'Plex Movie Scanner'
});
assert(accessibleTrueStr && accessibleTrueStr._accessible === true, 'accessible=true string');

var fromKeyOnly = mapLibrarySection({
  key: '/library/sections/7',
  type: 'movie',
  title: 'Movies',
  accessible: '0',
  shared: '0',
  agent: 'com.plexapp.agents.imdb',
  scanner: 'Plex Movie Scanner'
});
assert(fromKeyOnly && fromKeyOnly.id === '7', 'derives id from key path');
assert(fromKeyOnly._accessible === false, 'accessible=0');

assert(mapLibrarySection({ key: '/library/sections', type: 'movie' }) === null,
  'rejects bare sections key');

assert(!isFolderBackedLibrarySection({
  key: '/hubs/promoted',
  type: 'movie',
  title: 'Promoted'
}), 'rejects hub keys (not /library/sections/{id})');

assert(!isFolderBackedLibrarySection({
  key: '/library/sections/9',
  type: 'movie',
  secondary: '1',
  title: 'Nested'
}), 'rejects secondary directories');

assert(mapLibrarySection({
  key: '/library/sections/10',
  type: 'movie',
  agent: 'com.plexapp.agents.composite',
  title: 'Virtual'
}) === null, 'rejects composite agent');

assert(mapLibrarySection({
  key: '/library/sections/11',
  type: 'movie',
  title: 'Empty paths',
  agent: 'com.plexapp.agents.imdb',
  _children: [{ _tag: 'Location', path: '  ' }]
}) === null, 'rejects Location children with no path');

var restricted = { restricted: true };

assert(isRestrictedProfile(restricted), 'restricted profile flag');
assert(!isRestrictedProfile({ restricted: false, admin: true }), 'admin profile not restricted');

var libs = [
  { id: '1', title: 'Shared', type: 'movie', shared: '1', hidden: false, _accessible: true },
  { id: '2', title: 'Hidden', type: 'movie', shared: '0', hidden: true, _accessible: true },
  { id: '3', title: 'Managed', type: 'show', shared: '0', hidden: false, _accessible: true },
  { id: '4', title: 'Denied', type: 'movie', hidden: false, _accessible: false },
  { id: '5', title: 'Listed', type: 'movie', hidden: false, _accessible: true }
];
var filtered = filterLibrariesForUser(libs, restricted);
assert(filtered.length === 3, 'restricted user trusts API list (shared=0 ok)');
assert(canAccessLibrary(libs[2], restricted), 'manage-library-access section allowed');
assert(!canAccessLibrary(libs[1], restricted), 'hidden lib blocked');
assert(!canAccessLibrary(libs[3], restricted), 'accessible=false blocked');

var ownerLibs = [
  { id: '10', title: 'Movies', type: 'movie', shared: '0', hidden: false, _accessible: false },
  { id: '11', title: 'TV', type: 'show', shared: '0', hidden: false, _accessible: false },
  { id: '12', title: 'Hidden', type: 'movie', shared: '1', hidden: true, _accessible: true }
];
var ownerFiltered = filterLibrariesForUser(ownerLibs, { restricted: true, admin: true });
assert(ownerFiltered.length === 2, 'admin sees non-hidden sections');
assert(canAccessLibrary(ownerLibs[0], { restricted: false }), 'owner lib allowed');

var allTypes = [
  { id: '1', title: 'Movies', type: 'movie', hidden: false },
  { id: '2', title: 'Music', type: 'artist', hidden: false },
  { id: '3', title: 'Photos', type: 'photo', hidden: false }
];
var ownerAll = filterLibrariesForUser(allTypes, { restricted: false });
assert(ownerAll.length === 3, 'bootstrap keeps all Plex section types for owner');

var moviesOnlyRestricted = filterLibrariesForUser(
  [{ id: '1', title: 'Films', type: 'movie', shared: '0', hidden: false, _accessible: true }],
  restricted
);
assert(moviesOnlyRestricted.length === 1, 'restricted user with shared=0 can bootstrap');

var parsed = mapLibrarySections({
  items: [
    { id: '1', key: '/library/sections/1', type: 'movie', title: 'A',
      agent: 'com.plexapp.agents.imdb', scanner: 'Plex Movie Scanner' },
    { id: '2', key: '/library/sections/2', type: 'artist', title: 'Music',
      agent: 'com.plexapp.agents.lastfm', scanner: 'Plex Music Scanner' },
    { key: '/hubs/promoted', type: 'movie', title: 'Hub' }
  ]
});
assert(parsed.length === 2, 'mapLibrarySections keeps folder-backed sections only');
assert(normalizeSectionType('1') === 'movie', 'normalizeSectionType movie');

var adopted = resolveServersForDiscovery([], [
  { name: 'NAS', clientIdentifier: 'abc', accessToken: 'owner', connections: [{ uri: 'http://x' }] }
], 'child');
assert(adopted.length === 1 && adopted[0].accessToken === 'child', 'borrow owner servers for managed profile');

console.log('validate-library-access: OK');
