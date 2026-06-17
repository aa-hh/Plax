import { getMetadata } from '../plex/library.js';
import { isContinueHubRow } from '../plex/recommendations/homeFeed.js';
import { extractVersions, pickBestVersion } from './versionSelector.js';
import { probePlayback } from './capabilityProbe.js';
import { isDirectPlayOnlyQuality } from './qualityProfiles.js';
import { parseAudioStreams } from './tracks/audioTracks.js';
import {
  parseSubtitleStreams,
  pickDefaultSubtitleTrack
} from './tracks/subtitleTracks.js';
import { showLoadingOverlay, hideLoadingOverlay } from '../ui/loadingOverlay.js';
import {
  shouldOfferResumeChoice,
  showResumeOrStartModal
} from '../ui/resumeChoice.js';

function getActiveMediaForVersion(item, version) {
  var mediaList = (item && item.media) || [];
  if (!mediaList.length) return {};
  if (!version) return mediaList[0];
  for (var i = 0; i < mediaList.length; i++) {
    if (String(mediaList[i].id) === String(version.id)) return mediaList[i];
  }
  return mediaList[0];
}

function resolveDefaultStreamIds(metadata, version) {
  var media = getActiveMediaForVersion(metadata, version);
  var audio = parseAudioStreams(media);
  var subs = parseSubtitleStreams(media, { includeGraphical: true });
  var audioStreamId = null;
  var subtitleStreamId = null;

  if (audio.length) {
    var defaultAudio = audio.filter(function (a) { return a.selected; })[0] || audio[0];
    audioStreamId = defaultAudio.id;
  }
  // Auto-select TEXT subs only (pickDefaultSubtitleTrack skips graphical, which
  // would force a burn-in transcode). Text subs render client-side and keep
  // Direct Play; on webOS 4 the decision sends subtitles=none so PMS leaves the
  // video untouched while we draw the SRT sidecar.
  if (subs.length) {
    var pickedSub = pickDefaultSubtitleTrack(subs);
    subtitleStreamId = pickedSub ? pickedSub.id : null;
  }
  return { audioStreamId: audioStreamId, subtitleStreamId: subtitleStreamId };
}

function resolveHubResumeOffset(item) {
  if (!item) return 0;
  var off = parseInt(item.viewOffset, 10);
  if (!off || off < 0) return 0;
  return off;
}

function canDirectPlayHubItem(item) {
  if (!item || !item.ratingKey) return false;
  return item.type === 'movie' || item.type === 'episode';
}

function canDirectPlayFromHub(row, item) {
  return isContinueHubRow(row) && canDirectPlayHubItem(item);
}

function hubItemNeedsMetadata(item) {
  if (!item || !item.ratingKey) return true;
  return !(item.media && item.media.length);
}

/**
 * Build player route params matching detail screen Play/Resume.
 */
function buildPlayerParamsFromMetadata(metadata, options) {
  options = options || {};
  var versions = extractVersions(metadata);
  var version = options.version || pickBestVersion(versions, options.playbackPrefs);
  var probe = probePlayback(
    metadata,
    version,
    options.capabilities,
    options.deviceInfo || {}
  );
  var quality = (options.playbackPrefs && options.playbackPrefs.quality) || 'original';
  var strictDirect = isDirectPlayOnlyQuality(quality);
  var streams = resolveDefaultStreamIds(metadata, version);
  var audioStreamId = options.audioStreamId != null ? options.audioStreamId : streams.audioStreamId;
  var subtitleStreamId = options.subtitleStreamId != null
    ? options.subtitleStreamId
    : streams.subtitleStreamId;
  var offset = options.offset != null ? options.offset : resolveHubResumeOffset(metadata);

  return {
    ratingKey: metadata.ratingKey,
    version: version,
    audioStreamId: audioStreamId,
    subtitleStreamId: subtitleStreamId,
    offset: offset,
    forceTranscode: !strictDirect && probe
      ? (!probe.canDirectPlay && !probe.canDirectStream)
      : false,
    _detail: options.detailRoute || { ratingKey: metadata.ratingKey }
  };
}

function playFromHubItem(ctx) {
  var navigate = ctx.navigate;
  var server = ctx.server;
  var row = ctx.row;
  var item = ctx.item;
  var detailRoute = ctx.detailRoute;

  if (!navigate || !server || !item) return Promise.resolve();

  if (!canDirectPlayFromHub(row, item)) {
    navigate('detail', detailRoute || { ratingKey: item.ratingKey || '' });
    return Promise.resolve();
  }

  showLoadingOverlay('Preparing playback…', 'loading');

  var metadataPromise = hubItemNeedsMetadata(item)
    ? getMetadata(server, item.ratingKey)
    : Promise.resolve(item);

  return metadataPromise.then(function (metadata) {
    hideLoadingOverlay();
    if (!metadata) {
      navigate('detail', detailRoute || { ratingKey: item.ratingKey });
      return;
    }

    function navigateWithOffset(offset) {
      var params = buildPlayerParamsFromMetadata(metadata, {
        deviceInfo: ctx.deviceInfo,
        playbackPrefs: ctx.playbackPrefs,
        offset: offset,
        detailRoute: detailRoute
      });
      navigate('player', params);
    }

    var resumeOffset = resolveHubResumeOffset(metadata);
    if (shouldOfferResumeChoice(resumeOffset, metadata.duration)) {
      showResumeOrStartModal({
        viewOffset: resumeOffset,
        title: metadata.title || item.title || 'Continue watching?',
        onResume: function () { navigateWithOffset(resumeOffset); },
        onStartFromBeginning: function () { navigateWithOffset(0); }
      });
      return;
    }
    navigateWithOffset(resumeOffset);
  }).catch(function () {
    hideLoadingOverlay();
    navigate('detail', detailRoute || { ratingKey: item.ratingKey });
  });
}

export {
  canDirectPlayFromHub,
  canDirectPlayHubItem,
  resolveHubResumeOffset,
  hubItemNeedsMetadata,
  buildPlayerParamsFromMetadata,
  resolveDefaultStreamIds,
  playFromHubItem
};
