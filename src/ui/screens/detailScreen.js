import { getState, subscribe } from '../../core/store.js';
import {
  getMetadata,
  getChildren,
  getMetadataRelatedHubList,
  loadHubRows,
  getWatchStatus,
  getWatchProgressPercent,
  markWatched,
  markUnwatched,
  refreshItem
} from '../../plex/library.js';
import { renderHubRow } from '../components/hubRow.js';
import { createMediaCard } from '../components/mediaCard.js';
import { hydrateRowWindow } from '../posterImages.js';
import { extractVersions, pickBestVersion } from '../../playback/versionSelector.js';
import { parseAudioStreams } from '../../playback/tracks/audioTracks.js';
import { parseSubtitleStreams } from '../../playback/tracks/subtitleTracks.js';
import { probePlayback } from '../../playback/capabilityProbe.js';
import { isDirectPlayOnlyQuality } from '../../playback/qualityProfiles.js';
import { loadDeviceDisplay } from '../../platform/deviceDisplay.js';
import { formatDuration } from '../format.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import { loadUltraBlurBackground } from '../../plex/ultrablur.js';
import {
  startNetworkProbeIfNeeded,
  cancelNetworkProbe,
  refineRecommendationForItem,
  isCacheFresh,
  getCachedProbeResult,
  probeResultToStore
} from '../../playback/networkProbe.js';

var DETAIL_BG_GRADIENT =
  'linear-gradient(90deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.35) 100%)';

function detailScreen(root, params, navigate) {
  var server = getState().activeServer;
  var ratingKey = params.ratingKey;
  var screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = '<p class="status-msg">Loading…</p>';
  root.appendChild(screen);
  var detachFocus = attachFocusNav(screen);
  screen.addEventListener('keydown', onDetailModalKeyDown, true);

  var selectedVersion = null;
  var selectedAudio = null;
  var selectedSubtitle = null;
  var metadata = null;
  var deviceInfo = { uhd: false };
  var currentProbe = null;
  var isRefreshing = false;
  var pendingRefreshMessage = null;
  var activeDetailRoute = null;
  var destroyed = false;
  var seasonsLoadGen = 0;
  var episodesLoadGen = 0;
  var relatedHubsLoadGen = 0;

  loadDeviceDisplay(function (info) {
    if (destroyed) return;
    deviceInfo = info;
    if (metadata) {
      updateDirectPlayNotice();
      updateNetworkQualityUI();
    }
  });

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function formatReleaseDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTimeRemaining(item) {
    if (!item || !item.viewOffset || !item.duration) return '';
    var left = Math.max(0, item.duration - item.viewOffset);
    var mins = Math.ceil(left / 60000);
    if (mins < 60) return mins + 'm left';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m ? (h + 'h ' + m + 'm left') : (h + 'h left');
  }

  function episodeCode(item) {
    var parts = [];
    if (item.parentIndex != null && item.parentIndex !== '') {
      parts.push('S' + item.parentIndex);
    }
    if (item.index != null && item.index !== '') {
      parts.push('E' + item.index);
    }
    return parts.join(' · ');
  }

  function seasonLabel(item) {
    if (item.parentIndex != null && item.parentIndex !== '') {
      return 'Season ' + item.parentIndex;
    }
    if (item.parentTitle) return item.parentTitle;
    return 'Season';
  }

  function formatImdbRating(item) {
    if (!item || !item.audienceRating) return '';
    var img = (item.audienceRatingImage || '').toLowerCase();
    var label = img.indexOf('imdb') >= 0 ? 'IMDb' : 'Audience';
    var score = Number(item.audienceRating);
    if (!score || isNaN(score)) return '';
    var text = score % 1 === 0 ? String(score) : score.toFixed(1);
    return label + ' ' + text;
  }

  function breadcrumbLabel() {
    if (params.parentDetail && params.parentDetail.ratingKey) {
      if (metadata && metadata.type === 'episode' && metadata.parentTitle) {
        return metadata.parentTitle;
      }
      return 'Back';
    }
    return 'Library';
  }

  function navigateDetailBack() {
    if (params.parentDetail && params.parentDetail.ratingKey) {
      navigate('detail', params.parentDetail);
      return;
    }
    navigate('library', {});
  }

  var seasonEpisodes = null;
  var seasonEpisodesLoading = false;
  var detailModalKind = null;
  var detailModalReturnFocus = null;
  var unsubNetworkProbe = null;
  var detailProbeRetest = false;
  var detailItemProbeTesting = false;

  var NETWORK_QUALITY_SECTION_HTML =
    '<section class="detail-network-section" id="detail-network-section" aria-labelledby="detail-network-heading">' +
    '<h2 class="detail-file-heading" id="detail-network-heading">Connection</h2>' +
    '<p class="detail-network-status" id="detail-network-status">Checking connection…</p>' +
    '<div class="detail-network-recommend-row" id="detail-network-recommend-row" hidden>' +
    '<p class="detail-network-recommend" id="detail-network-recommend"></p>' +
    '<button type="button" class="btn detail-network-info-btn" id="btn-network-info" tabindex="0" ' +
    'aria-label="Why this quality">ⓘ</button></div>' +
    '<button type="button" class="btn detail-network-retest" id="btn-test-connection" tabindex="0">' +
    'Test connection</button></section>';

  function getRefinedNetworkProbe() {
    var cache = getState().networkProbe;
    if (metadata && selectedVersion && server) {
      var itemRaw = getCachedProbeResult(server, metadata.ratingKey, selectedVersion.id);
      if (itemRaw) {
        var summary = (cache && cache.deviceSummary) || [];
        var itemStore = probeResultToStore(itemRaw, server, summary);
        return refineRecommendationForItem(itemStore, metadata, selectedVersion, deviceInfo);
      }
    }
    if (!cache || !metadata) return cache;
    if (cache.status !== 'done') return cache;
    return refineRecommendationForItem(cache, metadata, selectedVersion, deviceInfo);
  }

  function networkStatusText(cache) {
    if (!cache || cache.status === 'idle') {
      return 'Connection not tested yet.';
    }
    if (cache.status === 'running' || cache.status === 'testing') {
      return 'Testing connection…';
    }
    if (cache.status === 'error') {
      return cache.error || 'Connection test failed.';
    }
    var mbps = cache.mbps != null ? cache.mbps : cache.measuredMbps;
    if (mbps != null) {
      return 'Measured ~' + mbps + ' Mbps to your Plex server.';
    }
    return 'Connection test complete.';
  }

  function buildNetworkInfoBullets(cache) {
    var refined = getRefinedNetworkProbe();
    var bullets = [];
    if (refined && refined.measuredMbps != null) {
      bullets.push('Measured link speed: ~' + refined.measuredMbps + ' Mbps to your Plex server.');
    } else if (cache && cache.status === 'error') {
      bullets.push('Link speed could not be measured: ' + (cache.error || 'test failed') + '.');
    } else {
      bullets.push('Link speed has not been measured yet.');
    }
    var summary = (cache && cache.deviceSummary) || [];
    summary.forEach(function (line) { bullets.push(line); });
    if (currentProbe && currentProbe.warnings && currentProbe.warnings.length) {
      currentProbe.warnings.forEach(function (w) {
        bullets.push('This file: ' + w);
      });
    }
    if (refined && refined.reason) {
      bullets.push('Recommendation: ' + refined.reason);
    }
    return bullets;
  }

  function openNetworkInfoModal() {
    var modal = screen.querySelector('#detail-modal');
    var list = screen.querySelector('#detail-modal-list');
    var titleEl = screen.querySelector('#detail-modal-title');
    var cancelBtn = screen.querySelector('#detail-modal-cancel');
    if (!modal || !list) return;
    var cache = getState().networkProbe;
    detailModalKind = 'network-info';
    detailModalReturnFocus = document.activeElement;
    if (titleEl) titleEl.textContent = 'Why this quality?';
    if (cancelBtn) cancelBtn.textContent = 'Close';
    list.className = 'detail-modal-list detail-modal-list--info';
    list.innerHTML = '';
    buildNetworkInfoBullets(cache).forEach(function (line) {
      var lineEl = document.createElement('p');
      lineEl.className = 'detail-network-info-line';
      lineEl.textContent = line;
      list.appendChild(lineEl);
    });
    modal.hidden = false;
    if (cancelBtn) cancelBtn.focus();
    else focusFirst(screen.querySelector('#detail-modal-sheet') || modal);
  }

  function updateNetworkQualityUI() {
    var section = screen.querySelector('#detail-network-section');
    if (!section) return;
    var statusEl = screen.querySelector('#detail-network-status');
    var recRow = screen.querySelector('#detail-network-recommend-row');
    var recEl = screen.querySelector('#detail-network-recommend');
    var infoBtn = screen.querySelector('#btn-network-info');
    var btn = screen.querySelector('#btn-test-connection');
    var cache = getRefinedNetworkProbe();
    var raw = getState().networkProbe;
    var testing = detailItemProbeTesting ||
      !!(raw && (raw.status === 'running' || raw.status === 'testing'));

    if (statusEl) {
      statusEl.textContent = networkStatusText(testing ? raw : cache);
      statusEl.classList.toggle('detail-network-status--error', !!(raw && raw.status === 'error'));
      statusEl.classList.toggle('detail-network-status--testing', testing);
    }

    var showRec = cache && cache.status === 'done' && cache.recommendedLabel;
    if (recRow) recRow.hidden = !showRec;
    if (recEl && showRec) {
      recEl.innerHTML = '<strong>Recommended quality:</strong> ' + escapeHtml(cache.recommendedLabel);
    }
    if (infoBtn) infoBtn.disabled = !showRec;

    if (btn) {
      btn.disabled = testing;
      btn.textContent = testing ? 'Testing…' : 'Test connection';
    }
  }

  function wireNetworkQualitySection() {
    var btn = screen.querySelector('#btn-test-connection');
    var infoBtn = screen.querySelector('#btn-network-info');
    if (btn && !btn._xplayNetworkWired) {
      btn._xplayNetworkWired = true;
      btn.addEventListener('click', function () {
        if (!server) return;
        detailProbeRetest = true;
        var probeOpts = { force: true, deviceInfo: deviceInfo };
        if (metadata && selectedVersion) {
          probeOpts.item = metadata;
          probeOpts.version = selectedVersion;
        }
        detailItemProbeTesting = true;
        updateNetworkQualityUI();
        startNetworkProbeIfNeeded(server, probeOpts).finally(function () {
          if (destroyed) return;
          detailItemProbeTesting = false;
          updateNetworkQualityUI();
        });
      });
    }
    if (infoBtn && !infoBtn._xplayNetworkWired) {
      infoBtn._xplayNetworkWired = true;
      infoBtn.addEventListener('click', openNetworkInfoModal);
    }
    updateNetworkQualityUI();
  }

  function attachNetworkQualityObserver() {
    if (unsubNetworkProbe) return;
    unsubNetworkProbe = subscribe('change', function () {
      updateNetworkQualityUI();
    });
  }

  function buildAutoQualityHintHtml() {
    var quality = (getState().playbackPrefs && getState().playbackPrefs.quality) || 'auto';
    if (quality !== 'auto') return '';
    return '<p class="direct-play-auto-hint">Auto tries progressive direct play first, then HLS remux ' +
      '(stream copy, not full transcode), then server transcode if needed.</p>';
  }

  function buildNoticeHtml(probe) {
    if (!probe || !probe.warnings.length) return '';
    var quality = (getState().playbackPrefs && getState().playbackPrefs.quality) || 'auto';
    var strictDirect = isDirectPlayOnlyQuality(quality);
    var blocked = !probe.canDirectPlay;
    var cls = 'direct-play-notice' + (blocked ? ' direct-play-blocked' : '');
    var title = blocked
      ? 'Direct Play not available'
      : 'Playback note';
    var body = probe.warnings.join(' ');
    if (probe.bitrateCheck && probe.bitrateCheck.exceeds) {
      body = 'Bitrate ' + probe.bitrateCheck.actualMbps + ' Mbps exceeds this TV\'s ' +
        probe.bitrateCheck.limitMbps + ' Mbps Direct Play limit.';
      body += strictDirect
        ? ' Original file only is selected — use Auto or a transcode quality to play.'
        : (quality === 'auto'
          ? ' Auto will use remux or transcode instead of progressive direct play.'
          : ' Server transcode will be used.');
    } else if (strictDirect && blocked) {
      body += ' Original file only is selected in Settings — playback may fail without remux or transcode.';
    } else if (quality === 'auto' && blocked && probe.canDirectStream) {
      body += ' Auto will try HLS remux (direct stream) instead of progressive direct play.';
    }
    return '<div id="direct-play-notice" class="' + cls + '"><strong>' + title +
      '</strong><span>' + escapeHtml(body) + '</span></div>';
  }

  function runProbe() {
    if (!metadata) return null;
    currentProbe = probePlayback(metadata, selectedVersion, null, deviceInfo);
    return currentProbe;
  }

  function updateDirectPlayNotice() {
    var probe = runProbe();
    var disclosure = screen.querySelector('#direct-play-disclosure');
    var body = screen.querySelector('#direct-play-body');
    var toggle = screen.querySelector('#btn-directplay-toggle');
    var html = buildAutoQualityHintHtml() + buildNoticeHtml(probe);
    if (!html) {
      if (disclosure) disclosure.hidden = true;
      return;
    }
    if (disclosure) disclosure.hidden = false;
    if (toggle) {
      toggle.textContent = probe && probe.warnings.length
        ? 'Playback compatibility'
        : 'How Auto quality works';
    }
    if (body) body.innerHTML = html;
  }

  function watchStatusLabel(item) {
    var status = getWatchStatus(item);
    if (status === 'watched') return 'Watched';
    if (status === 'progress') {
      return 'In progress · ' + getWatchProgressPercent(item) + '%';
    }
    return 'Unwatched';
  }

  function setWatchMessage(text, isError) {
    var el = screen.querySelector('#watch-status-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'watch-status-msg' + (isError ? ' watch-status-error' : '');
  }

  function refreshWatchButtons(item) {
    var status = getWatchStatus(item);
    var btnWatched = screen.querySelector('#btn-mark-watched');
    var btnUnwatched = screen.querySelector('#btn-mark-unwatched');
    var resume = screen.querySelector('#btn-resume');
    if (btnWatched) btnWatched.disabled = status === 'watched';
    if (btnUnwatched) btnUnwatched.disabled = status === 'unwatched';
    if (resume) resume.disabled = !item.viewOffset;
    var label = screen.querySelector('#watch-status-label');
    if (label) label.textContent = watchStatusLabel(item);
  }

  function setRefreshMessage(text, isError) {
    var el = screen.querySelector('#refresh-status-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'watch-status-msg' + (isError ? ' watch-status-error' : '');
  }

  function friendlyRefreshError(err) {
    if (err && err.status === 403) {
      return 'Refresh not allowed. Restricted Plex Home users may not have permission.';
    }
    if (err && err.status === 401) {
      return 'Plex sign-in expired. Sign in again to refresh.';
    }
    if (err && err.status >= 500) {
      return 'Plex server unreachable. Try again in a moment.';
    }
    if (err && err.message && err.message.toLowerCase().indexOf('timeout') >= 0) {
      return 'Refresh request timed out.';
    }
    return (err && err.message) || 'Refresh failed.';
  }

  function startItemRefresh() {
    if (isRefreshing) return;
    isRefreshing = true;
    var btn = screen.querySelector('#btn-refresh');
    if (btn) btn.disabled = true;
    setRefreshMessage('Refresh requested. Plex is scanning…', false);

    refreshItem(server, ratingKey).then(function () {
      return new Promise(function (r) { setTimeout(r, 3000); });
    }).then(function () {
      return getMetadata(server, ratingKey, { fresh: true });
    }).then(function (fresh) {
      pendingRefreshMessage = { text: 'Metadata refreshed.', isError: false };
      renderDetail(fresh);
      isRefreshing = false;
    }).catch(function (err) {
      isRefreshing = false;
      var b = screen.querySelector('#btn-refresh');
      if (b) b.disabled = false;
      setRefreshMessage(friendlyRefreshError(err), true);
    });
  }

  function applyWatchAction(promise, successMsg) {
    setWatchMessage('Updating…', false);
    promise.then(function () {
      return getMetadata(server, ratingKey);
    }).then(function (fresh) {
      renderDetail(fresh);
      setWatchMessage(successMsg, false);
    }).catch(function (err) {
      setWatchMessage(err.message || 'Could not update watch status.', true);
    });
  }

  function playParams(offset) {
    var probe = runProbe();
    var quality = (getState().playbackPrefs && getState().playbackPrefs.quality) || 'auto';
    var strictDirect = isDirectPlayOnlyQuality(quality);
    return {
      ratingKey: metadata.ratingKey,
      version: selectedVersion,
      audioStreamId: selectedAudio,
      subtitleStreamId: selectedSubtitle,
      offset: offset,
      forceTranscode: !strictDirect && probe
        ? (!probe.canDirectPlay && !probe.canDirectStream)
        : false,
      _detail: { ratingKey: metadata.ratingKey }
    };
  }

  function setDetailBackgroundImage(layout, imageUrl) {
    if (!layout || !imageUrl) return;
    layout.style.backgroundImage = DETAIL_BG_GRADIENT + ', url(' + imageUrl + ')';
    layout.classList.add('detail-layout--has-bg');
  }

  function applyDetailBackground(layout, server, item) {
    if (!layout) return;
    layout.classList.remove('detail-layout--has-bg');
    layout.style.backgroundImage = '';

    if (item.artPath && server) {
      loadUltraBlurBackground(server, item.artPath).then(function (blurUrl) {
        if (blurUrl) {
          setDetailBackgroundImage(layout, blurUrl);
          return;
        }
        if (item.art) setDetailBackgroundImage(layout, item.art);
      });
      return;
    }
    if (item.art) setDetailBackgroundImage(layout, item.art);
  }

  function buildActiveDetailRoute(item) {
    var route = { ratingKey: item.ratingKey };
    if (item.type === 'show') {
      route.libraryType = 'show';
    }
    if (item.type === 'season') {
      route.libraryType = 'show';
      route.showKey = item.parentRatingKey || params.showKey || '';
    }
    if (item.type === 'episode') {
      route.seasonKey = item.parentRatingKey || params.seasonKey || '';
      route.showKey = item.grandparentRatingKey || params.showKey || '';
      if (item.parentRatingKey) {
        route.parentDetail = {
          ratingKey: item.parentRatingKey,
          showKey: item.grandparentRatingKey || params.showKey || '',
          libraryType: 'show'
        };
        if (item.grandparentRatingKey) {
          route.parentDetail.parentDetail = {
            ratingKey: item.grandparentRatingKey,
            libraryType: 'show'
          };
        }
      }
    }
    if (params._from) route._from = params._from;
    if (params.parentDetail) route.parentDetail = params.parentDetail;
    return route;
  }

  function buildEpisodeNavRoute(ep, seasonKey) {
    var showKey = ep.grandparentRatingKey || (metadata && metadata.grandparentRatingKey) || params.showKey || '';
    var route = {
      ratingKey: ep.ratingKey,
      seasonKey: seasonKey,
      showKey: showKey,
      parentDetail: {
        ratingKey: seasonKey,
        showKey: showKey,
        libraryType: 'show'
      }
    };
    if (showKey) {
      route.parentDetail.parentDetail = { ratingKey: showKey, libraryType: 'show' };
    }
    return route;
  }

  function getVideoLabel() {
    if (!selectedVersion) return 'Default';
    return versionLabel(selectedVersion);
  }

  function getAudioLabel(tracks) {
    if (!tracks || !tracks.length) return 'Default';
    var match = tracks.filter(function (a) { return String(a.id) === String(selectedAudio); })[0];
    return (match && match.title) || tracks[0].title || 'Default';
  }

  function getSubtitleLabel(tracks) {
    if (selectedSubtitle == null) return 'Off';
    var match = tracks.filter(function (s) { return String(s.id) === String(selectedSubtitle); })[0];
    return match ? subtitleOptionLabel(match) : 'Off';
  }

  function closeDetailModal() {
    var modal = screen.querySelector('#detail-modal');
    var cancelBtn = screen.querySelector('#detail-modal-cancel');
    if (modal) modal.hidden = true;
    if (cancelBtn) cancelBtn.textContent = 'Cancel';
    detailModalKind = null;
    if (detailModalReturnFocus && detailModalReturnFocus.focus) {
      detailModalReturnFocus.focus();
    }
    detailModalReturnFocus = null;
  }

  function openDetailModal(kind, title, options, activeId, onSelect) {
    var modal = screen.querySelector('#detail-modal');
    var list = screen.querySelector('#detail-modal-list');
    var titleEl = screen.querySelector('#detail-modal-title');
    if (!modal || !list) return;
    detailModalKind = kind;
    detailModalReturnFocus = document.activeElement;
    if (titleEl) titleEl.textContent = title;
    list.className = 'detail-modal-list';
    list.innerHTML = '';
    if (!options.length) {
      list.innerHTML = '<p class="detail-modal-empty">No options available</p>';
    } else {
      options.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn detail-modal-option' +
          (isActiveOption(opt.id, activeId) ? ' detail-modal-option--active' : '');
        btn.textContent = opt.label + (isActiveOption(opt.id, activeId) ? ' ✓' : '');
        btn.tabIndex = 0;
        btn.addEventListener('click', function () {
          onSelect(opt.id, opt);
          closeDetailModal();
          updateEpisodeFileRowLabels();
        });
        list.appendChild(btn);
      });
    }
    modal.hidden = false;
    var activeBtn = list.querySelector('.detail-modal-option--active');
    if (activeBtn) activeBtn.focus();
    else focusFirst(screen.querySelector('#detail-modal-sheet') || modal);
  }

  function onDetailModalKeyDown(e) {
    if (!detailModalKind) return;
    if (e.keyCode === 461 || e.key === 'Backspace' || e.key === 'GoBack' || e.keyCode === 27) {
      e.preventDefault();
      e.stopPropagation();
      closeDetailModal();
    }
  }

  function updateEpisodeFileRowLabels() {
    if (!metadata || metadata.type !== 'episode') return;
    var media = getActiveMedia(metadata);
    var audio = parseAudioStreams(media);
    var subs = parseSubtitleStreams(media, { includeGraphical: true });
    var videoVal = screen.querySelector('#detail-file-video-value');
    var audioVal = screen.querySelector('#detail-file-audio-value');
    var subVal = screen.querySelector('#detail-file-subtitles-value');
    if (videoVal) videoVal.textContent = getVideoLabel();
    if (audioVal) audioVal.textContent = getAudioLabel(audio);
    if (subVal) subVal.textContent = getSubtitleLabel(subs);
    updateDirectPlayNotice();
  }

  function renderEpisodeFileRows(item, versions) {
    var media = getActiveMedia(item);
    var audio = parseAudioStreams(media);
    var subs = parseSubtitleStreams(media, { includeGraphical: true });

    if (audio.length) {
      if (!trackExists(audio, selectedAudio)) selectedAudio = null;
      if (!selectedAudio) {
        var defaultAudio = audio.filter(function (a) { return a.selected; })[0] || audio[0];
        selectedAudio = defaultAudio.id;
      }
    }
    if (selectedSubtitle != null && !trackExists(subs, selectedSubtitle)) {
      selectedSubtitle = null;
    }
    if (selectedSubtitle == null && subs.length) {
      var defaultSub = subs.filter(function (s) { return s.selected; })[0];
      selectedSubtitle = defaultSub ? defaultSub.id : null;
    }

    var videoBtn = screen.querySelector('#detail-file-video');
    if (videoBtn) {
      videoBtn.addEventListener('click', function () {
        if (!versions || versions.length < 2) return;
        openDetailModal('video', 'Video', versions.map(function (v) {
          return { id: v.id, label: versionLabel(v), data: v };
        }), selectedVersion ? selectedVersion.id : null, function (id, opt) {
          selectedVersion = opt.data;
          if (metadata) renderPlaybackTracks(metadata);
          updateEpisodeFileRowLabels();
          updateNetworkQualityUI();
        });
      });
      videoBtn.disabled = !versions || versions.length < 2;
    }

    var audioBtn = screen.querySelector('#detail-file-audio');
    if (audioBtn && audio.length) {
      audioBtn.disabled = false;
      audioBtn.addEventListener('click', function () {
        openDetailModal('audio', 'Audio', audio.map(function (a) {
          return { id: a.id, label: a.title, data: a };
        }), selectedAudio, function (id) {
          selectedAudio = id;
        });
      });
    } else if (audioBtn) {
      audioBtn.disabled = true;
    }

    var subBtn = screen.querySelector('#detail-file-subtitles');
    if (subBtn) {
      var subOptions = [{ id: null, label: 'Off', data: null }].concat(subs.map(function (s) {
        return { id: s.id, label: subtitleOptionLabel(s), data: s };
      }));
      subBtn.disabled = !subs.length;
      subBtn.addEventListener('click', function () {
        openDetailModal('subtitles', 'Subtitles', subOptions, selectedSubtitle, function (id) {
          selectedSubtitle = id;
        });
      });
    }
    updateEpisodeFileRowLabels();
    updateNetworkQualityUI();
  }

  function ensureSeasonEpisodesLoaded(seasonKey) {
    if (seasonEpisodes || seasonEpisodesLoading || !seasonKey) {
      return Promise.resolve(seasonEpisodes || []);
    }
    seasonEpisodesLoading = true;
    return getChildren(server, seasonKey).then(function (items) {
      seasonEpisodes = items;
      seasonEpisodesLoading = false;
      return items;
    }).catch(function (err) {
      seasonEpisodesLoading = false;
      throw err;
    });
  }

  function openEpisodePickerModal(item) {
    var seasonKey = item.parentRatingKey || params.seasonKey;
    if (!seasonKey) return;
    ensureSeasonEpisodesLoaded(seasonKey).then(function (episodes) {
      var modal = screen.querySelector('#detail-modal');
      var list = screen.querySelector('#detail-modal-list');
      var titleEl = screen.querySelector('#detail-modal-title');
      if (!modal || !list) return;
      detailModalKind = 'episodes';
      detailModalReturnFocus = document.activeElement;
      if (titleEl) titleEl.textContent = 'Episodes · ' + seasonLabel(item);
      list.innerHTML = '';
      list.className = 'detail-modal-list detail-modal-list--episodes row-scroll';
      episodes.forEach(function (ep) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'episode-chip detail-modal-option';
        if (String(ep.ratingKey) === String(item.ratingKey)) {
          chip.classList.add('detail-modal-option--active');
        }
        var code = episodeCode(ep);
        chip.textContent = (code ? code + ' · ' : '') + (ep.title || 'Episode');
        chip.tabIndex = 0;
        chip.addEventListener('click', function () {
          closeDetailModal();
          if (String(ep.ratingKey) === String(item.ratingKey)) return;
          navigate('detail', buildEpisodeNavRoute(ep, seasonKey));
        });
        list.appendChild(chip);
      });
      modal.hidden = false;
      var active = list.querySelector('.detail-modal-option--active');
      if (active) active.focus();
      else focusFirst(list);
    }).catch(function () {
      setWatchMessage('Could not load episodes for this season.', true);
    });
  }

  function renderEpisodeDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    seasonEpisodes = null;
    var versions = extractVersions(item);
    selectedVersion = pickBestVersion(versions, getState().playbackPrefs);
    currentProbe = probePlayback(item, selectedVersion, null, deviceInfo);

    var progressPct = getWatchProgressPercent(item);
    var progressHtml = item.viewOffset && item.duration
      ? '<div class="detail-episode-progress" aria-hidden="true">' +
        '<div class="detail-episode-progress-fill" style="width:' + progressPct + '%"></div></div>'
      : '';
    var seriesTitle = item.grandparentTitle || 'Series';
    var epCode = episodeCode(item);
    var primaryLine = '';
    if (item.parentRatingKey) {
      primaryLine += '<span class="detail-episode-season-text">' + escapeHtml(seasonLabel(item)) + '</span>';
    }
    if (epCode) {
      primaryLine += '<span class="detail-episode-code">' + escapeHtml(epCode) + '</span>';
    }
    if (item.viewOffset) {
      primaryLine += '<span class="detail-episode-remaining">' + escapeHtml(formatTimeRemaining(item)) + '</span>';
    }
    var secondaryParts = [
      formatReleaseDate(item.originallyAvailableAt),
      formatDuration(item.duration),
      item.contentRating
    ].filter(Boolean);
    var imdb = formatImdbRating(item);

    screen.innerHTML =
      '<div class="detail-layout detail-layout--episode">' +
      '<div class="detail-episode-panel">' +
      '<div class="detail-top-bar" data-cols="2">' +
      '<button type="button" class="detail-breadcrumb btn" id="detail-breadcrumb" tabindex="0">← ' +
      escapeHtml(breadcrumbLabel()) + '</button>' +
      '<button type="button" class="detail-episode-picker btn" id="btn-episode-picker" tabindex="0">' +
      escapeHtml(epCode || 'Episode') + ' · All episodes</button>' +
      '</div>' +
      '<div class="detail-episode-main">' +
      '<div class="detail-episode-art-wrap">' +
      '<img class="detail-episode-art" id="detail-episode-art" alt="" />' +
      progressHtml +
      '</div>' +
      '<div class="detail-episode-copy">' +
      '<p class="detail-series-heading">' + escapeHtml(seriesTitle) + '</p>' +
      '<h1 class="detail-episode-title">' + escapeHtml(item.title || '') + '</h1>' +
      (primaryLine ? '<p class="detail-episode-line detail-episode-line--primary">' + primaryLine + '</p>' : '') +
      (secondaryParts.length
        ? '<p class="detail-episode-line detail-episode-line--secondary">' +
          escapeHtml(secondaryParts.join(' · ')) + '</p>'
        : '') +
      (imdb ? '<p class="detail-episode-line detail-episode-rating">' + escapeHtml(imdb) + '</p>' : '') +
      '</div></div>' +
      '<div class="detail-actions detail-episode-actions" data-cols="3">' +
      '<button class="btn btn-primary" id="btn-start" tabindex="0">' + (item.viewOffset ? 'Resume' : 'Play') + '</button>' +
      '<button class="btn" id="btn-mark-watched" tabindex="0">Mark watched</button>' +
      '<button class="btn" id="btn-mark-unwatched" tabindex="0">Mark unwatched</button>' +
      '</div>' +
      '<div class="detail-episode-nav" data-cols="2">' +
      '<button type="button" class="detail-link detail-series-title" id="detail-series-link" tabindex="0">' +
      escapeHtml(seriesTitle) + '</button>' +
      (item.parentRatingKey
        ? '<button type="button" class="detail-link detail-season-link" id="detail-season-link" tabindex="0">' +
          escapeHtml(seasonLabel(item)) + '</button>'
        : '') +
      '</div>' +
      '<section class="detail-file-section detail-file-section--episode" aria-labelledby="detail-file-heading">' +
      '<h2 class="detail-file-heading" id="detail-file-heading">File details</h2>' +
      '<button type="button" class="detail-file-row" id="detail-file-video" tabindex="0">' +
      '<span class="detail-file-label">Video</span>' +
      '<span class="detail-file-value" id="detail-file-video-value"></span>' +
      '</button>' +
      '<button type="button" class="detail-file-row" id="detail-file-audio" tabindex="0">' +
      '<span class="detail-file-label">Audio</span>' +
      '<span class="detail-file-value" id="detail-file-audio-value"></span>' +
      '</button>' +
      '<button type="button" class="detail-file-row" id="detail-file-subtitles" tabindex="0">' +
      '<span class="detail-file-label">Subtitles</span>' +
      '<span class="detail-file-value" id="detail-file-subtitles-value"></span>' +
      '</button>' +
      '</section>' +
      NETWORK_QUALITY_SECTION_HTML +
      '<div class="detail-disclosure" id="direct-play-disclosure" hidden>' +
      '<button class="btn detail-disclosure-toggle" id="btn-directplay-toggle" tabindex="0">Playback compatibility</button>' +
      '<div class="detail-disclosure-body hidden" id="direct-play-body"></div>' +
      '</div>' +
      '<p class="watch-status-msg" id="watch-status-msg"></p>' +
      '</div></div>' +
      '<div class="detail-modal" id="detail-modal" hidden>' +
      '<div class="detail-modal-sheet" id="detail-modal-sheet" role="dialog" aria-modal="true">' +
      '<p class="detail-modal-title" id="detail-modal-title"></p>' +
      '<div class="detail-modal-list" id="detail-modal-list"></div>' +
      '<div class="detail-modal-footer">' +
      '<button type="button" class="btn detail-modal-cancel" id="detail-modal-cancel" tabindex="0">Cancel</button>' +
      '</div></div></div>';

    var art = screen.querySelector('#detail-episode-art');
    if (art) art.src = item.thumb || item.art || item.grandparentThumbUrl || '';
    applyDetailBackground(screen.querySelector('.detail-layout'), server, item);

    renderEpisodeFileRows(item, versions);
    wireNetworkQualitySection();
    attachNetworkQualityObserver();
    updateDirectPlayNotice();

    screen.querySelector('#detail-breadcrumb').addEventListener('click', navigateDetailBack);
    screen.querySelector('#btn-episode-picker').addEventListener('click', function () {
      openEpisodePickerModal(item);
    });
    var seriesLink = screen.querySelector('#detail-series-link');
    if (seriesLink && item.grandparentRatingKey) {
      seriesLink.addEventListener('click', function () {
        navigate('detail', {
          ratingKey: item.grandparentRatingKey,
          libraryType: 'show',
          parentDetail: params.parentDetail && params.parentDetail.parentDetail
            ? params.parentDetail.parentDetail
            : undefined
        });
      });
    } else if (seriesLink) {
      seriesLink.disabled = true;
    }
    var seasonLink = screen.querySelector('#detail-season-link');
    if (seasonLink && item.parentRatingKey) {
      seasonLink.addEventListener('click', function () {
        var route = {
          ratingKey: item.parentRatingKey,
          libraryType: 'show',
          showKey: item.grandparentRatingKey || params.showKey || ''
        };
        if (item.grandparentRatingKey) {
          route.parentDetail = { ratingKey: item.grandparentRatingKey, libraryType: 'show' };
        }
        navigate('detail', route);
      });
    }

    screen.querySelector('#btn-start').addEventListener('click', function () {
      navigate('player', playParams(item.viewOffset || 0));
    });
    var btnWatched = screen.querySelector('#btn-mark-watched');
    var btnUnwatched = screen.querySelector('#btn-mark-unwatched');
    btnWatched.addEventListener('click', function () {
      applyWatchAction(markWatched(server, item.ratingKey), 'Marked as watched.');
    });
    btnUnwatched.addEventListener('click', function () {
      applyWatchAction(markUnwatched(server, item.ratingKey), 'Marked as unwatched.');
    });
    refreshWatchButtons(item);

    var btnDirectPlayToggle = screen.querySelector('#btn-directplay-toggle');
    if (btnDirectPlayToggle) {
      btnDirectPlayToggle.addEventListener('click', function () {
        var panel = screen.querySelector('#direct-play-body');
        if (panel) panel.classList.toggle('hidden');
      });
    }
    var modalCancel = screen.querySelector('#detail-modal-cancel');
    if (modalCancel) modalCancel.addEventListener('click', closeDetailModal);

    focusFirst(screen);
  }

  function renderStandardDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    var versions = extractVersions(item);
    selectedVersion = pickBestVersion(versions, getState().playbackPrefs);
    currentProbe = probePlayback(item, selectedVersion, null, deviceInfo);

    var topBar = '';
    if (params.parentDetail && params.parentDetail.ratingKey) {
      topBar =
        '<div class="detail-top-bar detail-top-bar--solo">' +
        '<button type="button" class="detail-breadcrumb btn" id="detail-breadcrumb" tabindex="0">← ' +
        escapeHtml(breadcrumbLabel()) + '</button></div>';
    }

    screen.innerHTML =
      '<div class="detail-layout">' +
      topBar +
      '<img class="detail-poster" id="detail-poster" alt="" />' +
      '<div class="detail-info">' +
      '<h1 class="screen-title">' + escapeHtml(item.title) + '</h1>' +
      '<p class="detail-meta" id="detail-meta"></p>' +
      '<p class="detail-summary">' + escapeHtml(item.summary || '') + '</p>' +
      '<div class="detail-primary-actions">' +
      '<button class="btn btn-primary" id="btn-start" tabindex="0">' + (item.viewOffset ? 'Resume' : 'Play') + '</button>' +
      '<button class="btn" id="btn-more-actions" tabindex="0">More actions</button>' +
      '</div>' +
      '<div class="detail-actions detail-actions-secondary hidden" id="detail-actions-secondary">' +
      '<button class="btn" id="btn-play" tabindex="0">Play from start</button>' +
      '<button class="btn" id="btn-resume" tabindex="0"' + (item.viewOffset ? '' : ' disabled') + '>Resume</button>' +
      '<button class="btn" id="btn-mark-watched" tabindex="0">Mark watched</button>' +
      '<button class="btn" id="btn-mark-unwatched" tabindex="0">Mark unwatched</button>' +
      '<button class="btn" id="btn-refresh" tabindex="0">Refresh metadata</button>' +
      '</div>' +
      '<div class="detail-disclosure" id="direct-play-disclosure" hidden>' +
      '<button class="btn detail-disclosure-toggle" id="btn-directplay-toggle" tabindex="0">Playback compatibility</button>' +
      '<div class="detail-disclosure-body hidden" id="direct-play-body"></div>' +
      '</div>' +
      '<p class="watch-status-msg" id="refresh-status-msg"></p>' +
      '<div class="detail-playback-block">' +
      '<p class="row-label detail-playback-label">Playback</p>' +
      '<div class="detail-setting-row hidden" id="detail-setting-version"></div>' +
      '<div class="detail-setting-row hidden" id="detail-setting-audio"></div>' +
      '<div class="detail-setting-row hidden" id="detail-setting-subtitles"></div>' +
      '</div>' +
      (item.type === 'movie' ? NETWORK_QUALITY_SECTION_HTML : '') +
      '<div class="detail-rails" id="detail-rails"></div>' +
      '</div></div>';

    var poster = screen.querySelector('#detail-poster');
    if (poster) poster.src = item.thumb || item.art || '';
    applyDetailBackground(screen.querySelector('.detail-layout'), server, item);
    var meta = screen.querySelector('#detail-meta');
    if (meta) {
      var metaParts = [item.year, formatDuration(item.duration), item.contentRating].filter(Boolean);
      if (item.genres && item.genres.length) {
        metaParts.push(item.genres.map(function (g) { return g.tag; }).join(', '));
      }
      meta.textContent = metaParts.join(' · ');
    }

    renderVersions(versions);
    renderPlaybackTracks(item);
    syncPlaybackBlockVisibility();
    updateDirectPlayNotice();
    if (item.type === 'movie') {
      wireNetworkQualitySection();
      attachNetworkQualityObserver();
    }

    if (item.type === 'show') {
      loadSeasons(item.ratingKey);
    } else if (item.type === 'season') {
      loadEpisodes(item.ratingKey, item.parentRatingKey || params.showKey || '');
    } else if (params.seasonKey) {
      // Backward-compatible fallback for older deep links.
      loadEpisodes(params.seasonKey, params.showKey || '');
    }

    if (item.type === 'movie' || item.type === 'show') {
      loadRelatedHubs(item.ratingKey);
    }

    var breadcrumb = screen.querySelector('#detail-breadcrumb');
    if (breadcrumb) breadcrumb.addEventListener('click', navigateDetailBack);

    screen.querySelector('#btn-start').addEventListener('click', function () {
      navigate('player', playParams(item.viewOffset || 0));
    });
    screen.querySelector('#btn-play').addEventListener('click', function () {
      navigate('player', playParams(0));
    });
    screen.querySelector('#btn-resume').addEventListener('click', function () {
      navigate('player', playParams(item.viewOffset));
    });
    var btnRefresh = screen.querySelector('#btn-refresh');
    if (btnRefresh) {
      btnRefresh.disabled = isRefreshing;
      btnRefresh.addEventListener('click', startItemRefresh);
    }
    var btnMoreActions = screen.querySelector('#btn-more-actions');
    if (btnMoreActions) {
      btnMoreActions.addEventListener('click', function () {
        var panel = screen.querySelector('#detail-actions-secondary');
        if (panel) panel.classList.toggle('hidden');
      });
    }
    var btnDirectPlayToggle = screen.querySelector('#btn-directplay-toggle');
    if (btnDirectPlayToggle) {
      btnDirectPlayToggle.addEventListener('click', function () {
        var panel = screen.querySelector('#direct-play-body');
        if (panel) panel.classList.toggle('hidden');
      });
    }
    if (pendingRefreshMessage) {
      setRefreshMessage(pendingRefreshMessage.text, pendingRefreshMessage.isError);
      pendingRefreshMessage = null;
    } else if (isRefreshing) {
      setRefreshMessage('Refresh requested. Plex is scanning…', false);
    }

    var canSetWatch = item.type === 'movie' || item.type === 'episode';
    var btnWatched = screen.querySelector('#btn-mark-watched');
    var btnUnwatched = screen.querySelector('#btn-mark-unwatched');
    if (!canSetWatch) {
      if (btnWatched) btnWatched.style.display = 'none';
      if (btnUnwatched) btnUnwatched.style.display = 'none';
    } else {
      if (btnWatched) {
        btnWatched.addEventListener('click', function () {
          applyWatchAction(markWatched(server, item.ratingKey), 'Marked as watched.');
        });
      }
      if (btnUnwatched) {
        btnUnwatched.addEventListener('click', function () {
          applyWatchAction(markUnwatched(server, item.ratingKey), 'Marked as unwatched.');
        });
      }
      refreshWatchButtons(item);
    }

    focusFirst(screen);
  }

  function renderDetail(item) {
    if (item.type === 'episode') {
      renderEpisodeDetail(item);
      return;
    }
    renderStandardDetail(item);
  }

  function syncPlaybackBlockVisibility() {
    var block = screen.querySelector('.detail-playback-block');
    if (!block || !metadata) return;
    var isPlayable = metadata.type === 'movie' || metadata.type === 'episode';
    block.classList.toggle('hidden', !isPlayable);
  }

  function showSettingRow(row) {
    if (!row) return;
    row.classList.remove('hidden');
    row.hidden = false;
  }

  function isActiveOption(optId, activeId) {
    if (optId == null && activeId == null) return true;
    return String(optId) === String(activeId);
  }

  function renderSettingRow(rowId, labelText, options, activeId, onSelect) {
    var row = screen.querySelector(rowId);
    if (!row || !options.length) return;
    showSettingRow(row);
    row.innerHTML =
      '<span class="detail-setting-label">' + escapeHtml(labelText) + '</span>' +
      '<div class="detail-setting-options row-scroll"></div>';
    var optsEl = row.querySelector('.detail-setting-options');
    options.forEach(function (opt) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'detail-setting-chip';
      if (isActiveOption(opt.id, activeId)) chip.classList.add('detail-setting-chip--active');
      chip.textContent = opt.label;
      chip.tabIndex = 0;
      chip.addEventListener('click', function () {
        onSelect(opt.id, opt);
        optsEl.querySelectorAll('.detail-setting-chip').forEach(function (c) {
          c.classList.remove('detail-setting-chip--active');
        });
        chip.classList.add('detail-setting-chip--active');
      });
      optsEl.appendChild(chip);
    });
  }

  function versionLabel(v) {
    var label = v.title;
    if (v.bitrate) {
      var mbps = Math.round(parseInt(v.bitrate, 10) / 100) / 10;
      label += ' · ' + mbps + ' Mbps';
    }
    return label;
  }

  function getActiveMedia(item) {
    var mediaList = item.media || [];
    if (!mediaList.length) return {};
    if (!selectedVersion) return mediaList[0];
    var versionId = selectedVersion.id;
    for (var i = 0; i < mediaList.length; i++) {
      if (String(mediaList[i].id) === String(versionId)) return mediaList[i];
    }
    return mediaList[0];
  }

  function subtitleOptionLabel(track) {
    return track.graphical ? track.title + ' (image)' : track.title;
  }

  function trackExists(tracks, id) {
    if (id == null) return false;
    return tracks.some(function (t) { return String(t.id) === String(id); });
  }

  function renderVersions(versions) {
    if (!versions || !versions.length) return;
    var activeId = selectedVersion ? selectedVersion.id : null;
    renderSettingRow('#detail-setting-version', 'Video version', versions.map(function (v) {
      return { id: v.id, label: versionLabel(v), data: v };
    }), activeId, function (id, opt) {
      selectedVersion = opt.data;
      if (metadata) renderPlaybackTracks(metadata);
      updateDirectPlayNotice();
      updateNetworkQualityUI();
    });
  }

  function renderPlaybackTracks(item) {
    var media = getActiveMedia(item);
    var audio = parseAudioStreams(media);
    var subs = parseSubtitleStreams(media, { includeGraphical: true });

    if (audio.length) {
      if (!trackExists(audio, selectedAudio)) selectedAudio = null;
      if (!selectedAudio) {
        var defaultAudio = audio.filter(function (a) { return a.selected; })[0] || audio[0];
        selectedAudio = defaultAudio.id;
      }
      renderSettingRow('#detail-setting-audio', 'Audio', audio.map(function (a) {
        return { id: a.id, label: a.title, data: a };
      }), selectedAudio, function (id) {
        selectedAudio = id;
      });
    }

    if (selectedSubtitle != null && !trackExists(subs, selectedSubtitle)) {
      selectedSubtitle = null;
    }
    if (selectedSubtitle == null && subs.length) {
      var defaultSub = subs.filter(function (s) { return s.selected; })[0];
      selectedSubtitle = defaultSub ? defaultSub.id : null;
    }

    var subOptions = [{ id: null, label: 'Off', data: null }].concat(subs.map(function (s) {
      return { id: s.id, label: subtitleOptionLabel(s), data: s };
    }));
    renderSettingRow('#detail-setting-subtitles', 'Subtitles', subOptions, selectedSubtitle, function (id) {
      selectedSubtitle = id;
    });
  }

  function loadSeasons(showKey) {
    var gen = ++seasonsLoadGen;
    getChildren(server, showKey).then(function (items) {
      if (destroyed || gen !== seasonsLoadGen) return;
      var rails = screen.querySelector('#detail-rails');
      if (!rails) return;
      rails.innerHTML = '<p class="row-label">Seasons</p>';
      var row = document.createElement('div');
      row.className = 'row-scroll';
      row.id = 'seasons-row';
      rails.appendChild(row);
      items.forEach(function (s) {
        row.appendChild(createMediaCard(s, function (selected, routeParams) {
          var route = routeParams || { ratingKey: selected.ratingKey };
          route.showKey = showKey;
          route.libraryType = 'show';
          route.parentDetail = activeDetailRoute;
          navigate('detail', route);
        }, { layout: 'row' }));
      });
      hydrateRowWindow(row, { start: 0, count: items.length });
    });
  }

  function loadRelatedHubs(metadataId) {
    var gen = ++relatedHubsLoadGen;
    getMetadataRelatedHubList(server, metadataId, 12).then(function (hubList) {
      if (destroyed || gen !== relatedHubsLoadGen) return;
      if (!hubList.length) return;
      return loadHubRows(server, hubList, 12);
    }).then(function (rows) {
      if (destroyed || gen !== relatedHubsLoadGen) return;
      if (!rows || !rows.length) return;
      var rails = screen.querySelector('#detail-rails');
      if (!rails) return;
      rows.forEach(function (row) {
        renderHubRow(rails, row, navigate);
      });
    }).catch(function () {});
  }

  function loadEpisodes(seasonKey, showKey) {
    var gen = ++episodesLoadGen;
    getChildren(server, seasonKey).then(function (items) {
      if (destroyed || gen !== episodesLoadGen) return;
      var rails = screen.querySelector('#detail-rails');
      if (!rails) return;
      var existing = rails.querySelector('#episodes-row');
      if (!existing) {
        var label = document.createElement('p');
        label.className = 'row-label';
        label.textContent = 'Episodes';
        rails.appendChild(label);
        existing = document.createElement('div');
        existing.id = 'episodes-row';
        existing.className = 'row-scroll row-scroll--episodes';
        rails.appendChild(existing);
      }
      existing.innerHTML = '';
      items.forEach(function (ep) {
        existing.appendChild(createMediaCard(ep, function (selected, routeParams) {
          var route = routeParams || { ratingKey: selected.ratingKey };
          route.seasonKey = seasonKey;
          route.showKey = showKey || '';
          route.parentDetail = activeDetailRoute;
          navigate('detail', route);
        }, { layout: 'episode' }));
      });
      hydrateRowWindow(existing, { start: 0, count: items.length });
    });
  }

  getMetadata(server, ratingKey).then(function (item) {
    if (destroyed) return;
    renderDetail(item);
  }).catch(function (err) {
    if (destroyed) return;
    screen.innerHTML = '<p class="status-msg">Error: ' + err.message + '</p>';
  });

  return {
    destroy: function () {
      destroyed = true;
      seasonsLoadGen += 1;
      episodesLoadGen += 1;
      relatedHubsLoadGen += 1;
      if (detailProbeRetest || detailItemProbeTesting) {
        cancelNetworkProbe();
      }
      if (unsubNetworkProbe) {
        unsubNetworkProbe();
        unsubNetworkProbe = null;
      }
      screen.removeEventListener('keydown', onDetailModalKeyDown, true);
      detachFocus();
    }
  };
}

export { detailScreen };
