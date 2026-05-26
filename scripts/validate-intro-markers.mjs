/**
 * Quick sanity checks for intro marker parsing (node scripts/validate-intro-markers.mjs).
 */
import {
  collectMarkersForItem,
  findIntroMarkers,
  findCreditMarkers,
  findActiveIntroMarker,
  findActiveCreditMarker,
  extractIntroMarkers,
  extractCreditMarkers,
  introSkipTargetMs,
  creditSkipTargetMs,
  markerKey,
  isInIntroRange,
  isInMarkerRange
} from '../src/playback/introMarkers.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

var episode = {
  _children: [
    { _tag: 'Genre', id: '1' },
    {
      _tag: 'Media',
      _children: [
        {
          _tag: 'Marker',
          id: '10',
          type: 'intro',
          startTimeOffset: '1000',
          endTimeOffset: '30000'
        },
        {
          _tag: 'Part',
          _children: [
            {
              _tag: 'Marker',
              id: '11',
              type: 'credit',
              startTimeOffset: '500000',
              endTimeOffset: '520000'
            }
          ]
        }
      ]
    },
    {
      _tag: 'Marker',
      id: '12',
      type: 'intro',
      startTimeOffset: '600000',
      endTimeOffset: '630000'
    }
  ]
};

var markers = collectMarkersForItem(episode);
assert(markers.length === 3, 'expected 3 markers from metadata + media + part');
var intros = findIntroMarkers(markers);
assert(intros.length === 2, 'expected 2 intro markers');
assert(findActiveIntroMarker(intros, 15000).id === 10, 'active at 15s is opening intro');
assert(findActiveIntroMarker(intros, 610000).id === 12, 'active at 610s is recap intro');
assert(findActiveIntroMarker(intros, 40000) === null, 'no intro mid-episode');
assert(introSkipTargetMs(intros[0]) === 28000, 'skip target pads 2s before end');
assert(markerKey({ id: 0, startMs: 99 }) === 'start:99', 'fallback key uses startMs');

var mapped = {
  introMarkers: intros,
  markers: markers
};
assert(extractIntroMarkers(mapped).length === 2, 'uses pre-parsed introMarkers');
assert(isInIntroRange(intros[0], 29999), 'in range below end');
assert(!isInIntroRange(intros[0], 30000), 'at endMs is outside range');

var credits = findCreditMarkers(markers);
assert(credits.length === 1, 'expected 1 credit marker');
assert(findActiveCreditMarker(credits, 510000).id === 11, 'active at 510s is credits');
assert(findActiveCreditMarker(credits, 40000) === null, 'no credits mid-episode');
assert(creditSkipTargetMs(credits[0]) === 518000, 'credit skip target pads 2s before end');
assert(extractCreditMarkers({ creditMarkers: credits }).length === 1, 'uses pre-parsed creditMarkers');
assert(isInMarkerRange(credits[0], 519999), 'credit in range below end');

console.log('intro marker checks passed');
