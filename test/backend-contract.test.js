import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { plexBackend } from '../src/backends/plex/index.js';
import { jellyfinBackend } from '../src/backends/jellyfin/index.js';

describe('backend contract', function () {
  it('plex backend exposes resolveStreamUrl + buildSubtitlePlan', function () {
    assert.equal(typeof plexBackend.resolveStreamUrl, 'function');
    assert.equal(typeof plexBackend.buildSubtitlePlan, 'function');
  });

  it('jellyfin backend exposes resolveStreamUrl + buildSubtitlePlan', function () {
    assert.equal(typeof jellyfinBackend.resolveStreamUrl, 'function');
    assert.equal(typeof jellyfinBackend.buildSubtitlePlan, 'function');
  });

  // buildSubtitlePlan.attempts MUST be a thunk (evaluated after prepare()) — Plex's
  // prepare() primes session.transcodeSessionId that the subtitle URLs embed, so an
  // eagerly-built array yields URLs missing that id → no subtitle. Guard both backends.
  var server = { connectionUri: 'http://127.0.0.1:32400', url: 'http://127.0.0.1:8096', accessToken: 't' };
  var session = { item: { ratingKey: '1', key: '/library/metadata/1' }, subtitleStreamId: 7, version: { id: 'm1' } };
  var track = { id: 7, index: 7, codec: 'srt', graphical: false };

  it('plex buildSubtitlePlan.attempts is a thunk (lazy, post-prepare)', function () {
    var plan = plexBackend.buildSubtitlePlan(server, session, track);
    assert.equal(typeof plan.attempts, 'function', 'attempts must be a function');
    assert.ok(Array.isArray(plan.attempts()), 'attempts() returns an array');
  });

  it('jellyfin buildSubtitlePlan.attempts is a thunk', function () {
    var plan = jellyfinBackend.buildSubtitlePlan(server, session, track);
    assert.equal(typeof plan.attempts, 'function');
    assert.ok(Array.isArray(plan.attempts()));
  });
});
