import { test } from 'node:test';
import assert from 'node:assert';
import { mapItem, ticksToMs } from '../src/backends/jellyfin/mapItem.js';

var SERVER = { url: 'https://jf.example', userId: 'u1', accessToken: 't' };

// Real BaseItemDto captured from a live Jellyfin 10.11 server (trimmed).
var MOVIE = {
  Id: '3ea6e47669d67f1fbecd169cb24c0ef3',
  Name: '127 Hours',
  Type: 'Movie',
  ProductionYear: 2010,
  PremiereDate: '2010-11-12T00:00:00.0000000Z',
  OfficialRating: 'CA-14A',
  CommunityRating: 7.089,
  RunTimeTicks: 56217600000,
  ParentId: '1564b5f591f06c28707601ddf3496f1c',
  ImageTags: { Thumb: 'aaa', Primary: 'e3d662d0665d187e4f5dcb2688f5ebf3', Logo: 'ccc' },
  BackdropImageTags: ['45c2449139defc9553c91ea1fb373121'],
  UserData: { PlaybackPositionTicks: 0, PlayCount: 0, Played: false },
  Genres: ['Drama', 'Adventure'],
  People: [
    { Type: 'Actor', Name: 'James Franco', Role: 'Aron Ralston', Id: 'p1', PrimaryImageTag: 'pt1' },
    { Type: 'Director', Name: 'Danny Boyle', Id: 'p2' }
  ],
  ProviderIds: { Imdb: 'tt1542344', Tmdb: '44115' },
  MediaSources: [{
    Id: 'ms1', Container: 'mkv', RunTimeTicks: 56217600000, Bitrate: 8410412, Path: '/movies/127.mkv',
    MediaStreams: [
      { Type: 'Video', Codec: 'h264', Width: 1920, Height: 1080, Profile: 'High', Level: 41 },
      { Type: 'Audio', Codec: 'dts', Channels: 6, Language: 'eng', IsDefault: true },
      { Type: 'Audio', Codec: 'aac', Channels: 2, Language: 'eng' },
      { Type: 'Subtitle', Codec: 'subrip', Language: 'eng', IsExternal: false }
    ]
  }]
};

var EPISODE = {
  Id: '0b6b4b21d75ca96a3ab9a358e47469c1',
  Name: 'In throes of increasing wonder',
  Type: 'Episode',
  SeriesName: 'Interview with the Vampire',
  SeasonName: 'Season 1',
  ParentIndexNumber: 1,
  IndexNumber: 1,
  SeriesId: 'ecfc8c73117732784cf748c5e734d19a',
  SeasonId: 'f5880316273b1f8dcc9b6eb572be05c3',
  RunTimeTicks: 39771820000,
  ImageTags: { Primary: '8aa64c076fe4b7e9071792bf3ccdd45f' },
  SeriesPrimaryImageTag: '7e7952b615e4be99d0f6f6a4e111c4d4',
  ParentBackdropItemId: 'ecfc8c73117732784cf748c5e734d19a',
  ParentBackdropImageTags: ['dfa7d4857157ca037701b3f07dc5a7d2'],
  UserData: { PlaybackPositionTicks: 12000000000, PlayCount: 0, Played: false }
};

test('ticksToMs converts 100ns ticks to ms', function () {
  assert.equal(ticksToMs(56217600000), 5621760); // ~93.7 min
  assert.equal(ticksToMs(0), 0);
  assert.equal(ticksToMs(null), 0);
});

test('mapItem maps a movie BaseItemDto to the normalized shape', function () {
  var it = mapItem(MOVIE, SERVER);
  assert.equal(it.ratingKey, '3ea6e47669d67f1fbecd169cb24c0ef3');
  assert.equal(it.type, 'movie');
  assert.equal(it.title, '127 Hours');
  assert.equal(it.year, 2010);
  assert.equal(it.originallyAvailableAt, '2010-11-12');
  assert.equal(it.contentRating, 'CA-14A');
  assert.equal(it.rating, 7.089);
  assert.equal(it.duration, 5621760);
  assert.equal(it.viewOffset, 0);
  assert.equal(it.guid, 'imdb://tt1542344');
  assert.equal(it.studio, ''); // no Studios in sample
  assert.deepEqual(it.genres, [{ tag: 'Drama' }, { tag: 'Adventure' }]);
  assert.equal(it.roles.length, 1);
  assert.equal(it.roles[0].tag, 'James Franco');
  assert.equal(it.roles[0].role, 'Aron Ralston');
  assert.ok(it.roles[0].thumb.indexOf('/Items/p1/Images/Primary') >= 0);
  assert.equal(it.directors[0].tag, 'Danny Boyle');
  // image URLs
  assert.ok(it.thumb.indexOf('/Items/3ea6e47669d67f1fbecd169cb24c0ef3/Images/Primary') >= 0);
  assert.ok(it.thumb.indexOf('tag=e3d662d0665d187e4f5dcb2688f5ebf3') >= 0);
  assert.ok(it.art.indexOf('/Images/Backdrop/0') >= 0);
  // media mapping
  assert.equal(it.media.length, 1);
  assert.equal(it.media[0].container, 'mkv');
  assert.equal(it.media[0].bitrate, 8410); // 8410412 bits/s → Kbps (not 8410412)
  assert.equal(it.media[0].videoCodec, 'h264');
  assert.equal(it.media[0].audioCodec, 'dts');
  var streams = it.media[0]._children[0]._children;
  assert.equal(streams.length, 4);
  assert.equal(streams[0].streamType, 1); // video first
});

test('mapItem maps an episode with hierarchy + parent-image fallback', function () {
  var it = mapItem(EPISODE, SERVER);
  assert.equal(it.type, 'episode');
  assert.equal(it.grandparentTitle, 'Interview with the Vampire');
  assert.equal(it.parentTitle, 'Season 1');
  assert.equal(it.parentIndex, 1);
  assert.equal(it.index, 1);
  assert.equal(it.grandparentRatingKey, 'ecfc8c73117732784cf748c5e734d19a');
  assert.equal(it.parentRatingKey, 'f5880316273b1f8dcc9b6eb572be05c3');
  assert.equal(it.viewOffset, 1200000); // 12000000000 / 10000
  // episode has its own Primary image
  assert.ok(it.thumb.indexOf('/Items/0b6b4b21d75ca96a3ab9a358e47469c1/Images/Primary') >= 0);
  // backdrop falls back to the parent series
  assert.ok(it.art.indexOf('/Items/ecfc8c73117732784cf748c5e734d19a/Images/Backdrop/0') >= 0);
});

test('mapItem watch-state feeds getWatchStatus logic', function () {
  var played = mapItem(Object.assign({}, MOVIE, {
    UserData: { PlaybackPositionTicks: 0, PlayCount: 1, Played: true }
  }), SERVER);
  // getWatchStatus: viewCount>0 && viewOffset<=0 → watched
  assert.equal(played.viewCount, 1);
  assert.equal(played.viewOffset, 0);
});
