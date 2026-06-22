import { getState } from '../../core/store.js';
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
} from '../../backends/index.js';
import { renderHubRow } from '../components/hubRow.js';
import { mountBrowsingHubNav } from '../components/browsingHubNav.js';
import { createMediaCard } from '../components/mediaCard.js';
import { createTabs, openSidePanel } from '../components/controls.js';
import { hydrateRowWindow, bindPosterImage } from '../posterImages.js';
import { extractVersions, pickBestVersion } from '../../playback/versionSelector.js';
import { parseAudioStreams } from '../../playback/tracks/audioTracks.js';
import {
  parseSubtitleStreams,
  subtitleMenuOptionLabel
} from '../../playback/tracks/subtitleTracks.js';
import { probePlayback } from '../../playback/capabilityProbe.js';
import {
  listProfiles,
  getProfile,
  normalizeQualityKey,
  isDirectPlayOnlyQuality
} from '../../playback/qualityProfiles.js';
import { setPlaybackPrefs } from '../../settings/playbackSettings.js';
import { loadDeviceDisplay } from '../../platform/deviceDisplay.js';
import { formatDuration } from '../format.js';
import { focusFirst, attachFocusNav } from '../focus.js';
import {
  watchlistBookmarkButtonHtml,
  supportsWatchlistBookmark,
  wireWatchlistBookmark
} from '../components/watchlistBookmark.js';
import {
  buildUltraBlurColorGradient,
  loadUltraBlurBackdrop
} from '../../plex/ultrablur.js';
import { buildPlayerParamsFromMetadata } from '../../playback/hubDirectPlay.js';
import {
  shouldOfferResumeChoice,
  showResumeOrStartModal
} from '../resumeChoice.js';
import { prefetchDetailItems, abortPrefetch } from '../../core/idlePrefetch.js';
import { getThumbUrl } from '../../backends/index.js';
import { subtitlesIconSvg, qualityIconSvg } from '../icons/navIcons.js';

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

  var selectedVersion = null;
  var selectedAudio = null;
  var selectedSubtitle = null;
  var selectedQuality = null;
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
    // Force en-US — undefined locale falls back to the TV's system locale,
    // which surfaced Korean dates ("2005년 5월 8일") on a Korean-region B8.
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

  function formatTimeOffset(item) {
    if (!item || !item.viewOffset) return '';
    var totalSec = Math.floor(item.viewOffset / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    var ss = s < 10 ? '0' + s : String(s);
    if (h > 0) {
      var mm = m < 10 ? '0' + m : String(m);
      return h + ':' + mm + ':' + ss;
    }
    return m + ':' + ss;
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

  function isVirtualAllEpisodesSeason(season) {
    return String(season && season.title || '').trim().toLowerCase() === 'all episodes';
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

  // ── JetStream-inspired info blocks ──────────────────────────────────────
  // Genre pills, a structured Director/Writer/Studio credits row, and a
  // circular Cast & Crew rail. These are the empty-space fillers the redesign
  // adds; all driven by metadata that's already in the normalized item.
  function buildGenreChipsHtml(item) {
    var genres = (item.genres || []).slice(0, 4);
    if (!genres.length) return '';
    var pills = genres.map(function (g) {
      return '<span class="detail-genre-pill">' + escapeHtml(g.tag) + '</span>';
    }).join('');
    return '<div class="detail-genre-pills" aria-label="Genres">' + pills + '</div>';
  }

  function creditValueList(people, max) {
    return (people || []).slice(0, max || 2).map(function (p) { return p.tag; })
      .filter(Boolean).join(', ');
  }

  function buildCreditsRowHtml(item) {
    var cols = [];
    var directors = creditValueList(item.directors, 2);
    if (directors) cols.push({ label: 'Director', value: directors });
    var writers = creditValueList(item.writers, 2);
    if (writers) cols.push({ label: 'Writer', value: writers });
    if (item.studio) cols.push({ label: 'Studio', value: item.studio });
    if (!cols.length) return '';
    var html = cols.slice(0, 3).map(function (c) {
      return '<div class="detail-credit-col">' +
        '<span class="detail-credit-label">' + escapeHtml(c.label) + '</span>' +
        '<span class="detail-credit-value">' + escapeHtml(c.value) + '</span></div>';
    }).join('');
    return '<div class="detail-credits-row">' + html + '</div>';
  }

  function castThumbUrl(person) {
    var thumb = person && person.thumb;
    if (!thumb) return '';
    if (/^https?:/i.test(thumb)) return thumb;
    try { return getThumbUrl(server, thumb, 200); } catch (e) { return ''; }
  }

  function castInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0); }).join('').toUpperCase() || '?';
  }

  function buildCastRailHtml(item) {
    var roles = (item.roles || []).slice(0, 12);
    if (!roles.length) return '';
    var cards = roles.map(function (r, i) {
      var url = castThumbUrl(r);
      var avatar = url
        ? '<img class="detail-cast-avatar-img" data-cast-idx="' + i + '" alt="" />'
        : '<span class="detail-cast-avatar-fallback">' + escapeHtml(castInitials(r.tag)) + '</span>';
      return '<div class="detail-cast-card">' +
        '<div class="detail-cast-avatar">' + avatar + '</div>' +
        '<span class="detail-cast-name">' + escapeHtml(r.tag || '') + '</span>' +
        (r.role ? '<span class="detail-cast-role">' + escapeHtml(r.role) + '</span>' : '') +
        '</div>';
    }).join('');
    return '<section class="detail-cast" aria-label="Cast">' +
      '<p class="row-label detail-cast-heading">Cast &amp; Crew</p>' +
      '<div class="detail-cast-row row-scroll">' + cards + '</div></section>';
  }

  function bindCastImages(item) {
    var roles = (item.roles || []).slice(0, 12);
    var imgs = screen.querySelectorAll('.detail-cast-avatar-img');
    for (var i = 0; i < imgs.length; i++) {
      var idx = parseInt(imgs[i].getAttribute('data-cast-idx'), 10);
      var url = castThumbUrl(roles[idx]);
      // priority:true → eager load. A non-priority (lazy) bind on these
      // below-the-fold avatars acquires a poster-load slot but never fires
      // load/error while off-screen, leaking the slot until activePosterLoads
      // saturates and every later image app-wide stops loading.
      if (url) bindPosterImage(imgs[i], url, { priority: true });
    }
  }

  function watchlistBookmarkMarkup(item) {
    return supportsWatchlistBookmark(item) ? watchlistBookmarkButtonHtml(false) : '';
  }

  function buildDetailTopBar(innerLeftHtml) {
    if (!innerLeftHtml) return '';
    return '<div class="detail-top-bar" data-focus-zone="detail-top-bar">' +
      innerLeftHtml +
      '</div>';
  }

  function wrapDetailShell(mainHtml) {
    return '<div class="home-layout detail-screen-layout">' +
      '<nav class="browsing-hub-nav-host" id="browsing-hub-nav-host"></nav>' +
      '<div class="home-main detail-home-main">' + mainHtml + '</div></div>';
  }

  function mountDetailHubNav() {
    var host = screen.querySelector('#browsing-hub-nav-host');
    if (!host) return null;
    var state = getState();
    var activeLibrary = null;
    if (params.libraryId) {
      var libs = state.libraries || [];
      for (var i = 0; i < libs.length; i++) {
        if (String(libs[i].id) === String(params.libraryId)) {
          activeLibrary = libs[i];
          break;
        }
      }
    }
    if (!activeLibrary && params.libraryType === 'movie' && state.activeLibrary &&
        state.activeLibrary.type === 'movie') {
      activeLibrary = state.activeLibrary;
    }
    if (!activeLibrary && params.libraryType === 'show' && state.activeLibrary &&
        state.activeLibrary.type === 'show') {
      activeLibrary = state.activeLibrary;
    }
    return mountBrowsingHubNav(host, {
      navigate: navigate,
      activeRoute: 'detail',
      fromRoute: 'detail',
      activeLibrary: activeLibrary
    });
  }

  function resolveMovieLibraryTitle() {
    var state = getState();
    if (params.libraryId) {
      var libs = state.libraries || [];
      for (var i = 0; i < libs.length; i++) {
        if (String(libs[i].id) === String(params.libraryId)) return libs[i].title;
      }
    }
    if (state.activeLibrary && state.activeLibrary.type === 'movie') {
      return state.activeLibrary.title;
    }
    return 'Films';
  }

  function navigateToMovieLibrary() {
    var state = getState();
    var libraryId = params.libraryId;
    if (!libraryId && state.activeLibrary && state.activeLibrary.type === 'movie') {
      libraryId = state.activeLibrary.id;
    }
    if (libraryId) {
      navigate('library', { libraryId: libraryId });
      return;
    }
    navigate('library', {});
  }

  function navigateToSeasonDetail(item) {
    if (!item || !item.parentRatingKey) return;
    var route = {
      ratingKey: item.parentRatingKey,
      libraryType: 'show',
      showKey: item.grandparentRatingKey || params.showKey || ''
    };
    if (item.grandparentRatingKey) {
      route.parentDetail = { ratingKey: item.grandparentRatingKey, libraryType: 'show' };
    }
    navigate('detail', route);
  }

  function navigateToSeriesDetail(item) {
    var showKey = item.grandparentRatingKey || item.parentRatingKey || params.showKey || '';
    if (!showKey) return;
    navigate('detail', {
      ratingKey: showKey,
      libraryType: 'show',
      parentDetail: params.parentDetail
    });
  }

  function seriesBreadcrumbLabel(item) {
    return item.grandparentTitle || item.parentTitle || 'Series';
  }

  function buildWatchlistActionHtml(item) {
    return supportsWatchlistBookmark(item) ? watchlistBookmarkButtonHtml(false) : '';
  }

  // ── Breadcrumbs (Workstream G) ──────────────────────────────────────────
  // One builder, one format for every content type: a trail of navigable
  // ancestor crumbs in the SAME shape (same .detail-breadcrumb-trail__btn,
  // same `›` separator), wayfinding — not primary buttons. Each crumb is the
  // chain of navigable parents ending at the current item's immediate context;
  // depth follows the content's real hierarchy (film/show: library · season:
  // series · episode: series › season › episode) while the markup stays
  // identical so it reads the same at 10 ft.
  function breadcrumbTrailHtml(ariaLabel, crumbs) {
    var visible = crumbs.filter(function (c) { return c && c.label; });
    if (!visible.length) return '';
    var parts = [];
    visible.forEach(function (c, i) {
      if (i > 0) {
        parts.push('<span class="detail-breadcrumb-trail__sep" aria-hidden="true">›</span>');
      }
      var extra = c.cls ? ' ' + c.cls : '';
      var idAttr = c.id ? ' id="' + c.id + '"' : '';
      parts.push(
        '<button type="button" class="detail-breadcrumb-trail__btn' + extra + '"' + idAttr +
        ' tabindex="0">' + escapeHtml(c.label) + '</button>'
      );
    });
    return '<nav class="detail-breadcrumb-trail" aria-label="' + escapeHtml(ariaLabel) + '">' +
      parts.join('') + '</nav>';
  }

  function buildEpisodeBreadcrumbTrail(item) {
    var epCode = episodeCode(item);
    var epLabel = item.title || epCode || 'Episode';
    if (!epCode && item.index != null && item.index !== '') {
      epLabel = 'E' + item.index + (item.title ? ' · ' + item.title : '');
    }
    var seriesTitle = item.grandparentTitle || item.parentTitle || '';
    return breadcrumbTrailHtml('Episode navigation', [
      { id: 'detail-series-crumb', label: seriesTitle },
      { id: 'detail-season-crumb', label: seasonLabel(item) },
      { id: 'btn-episode-picker', cls: 'detail-episode-picker', label: epLabel }
    ]);
  }

  function buildFilmBreadcrumbTrail() {
    return breadcrumbTrailHtml('Library navigation', [
      { id: 'detail-library-crumb', label: resolveMovieLibraryTitle() }
    ]);
  }

  function buildSeriesBreadcrumbTrail(item) {
    return breadcrumbTrailHtml('Series navigation', [
      { id: 'detail-series-crumb', label: seriesBreadcrumbLabel(item) }
    ]);
  }

  function syncSelectedQualityFromPrefs() {
    var quality = (getState().playbackPrefs && getState().playbackPrefs.quality) || 'original';
    selectedQuality = normalizeQualityKey(quality);
  }

  function getDetailQuality() {
    return selectedQuality || 'original';
  }

  function getDetailPlaybackPrefs() {
    return Object.assign({}, getState().playbackPrefs, { quality: getDetailQuality() });
  }

  function qualityProfileLabel(key) {
    return getProfile(key).label;
  }

  function updateQualityBtnLabel() {
    var btn = screen.querySelector('#btn-quality');
    if (btn) setIconBtnLabel('btn-quality', qualityProfileLabel(getDetailQuality()));
  }

  function wireQualityBtn() {
    var btn = screen.querySelector('#btn-quality');
    if (!btn || btn._plaxQualityWired) return;
    btn._plaxQualityWired = true;
    updateQualityBtnLabel();
    btn.addEventListener('click', function () {
      openSidePanel({
        title: 'Quality',
        selectedId: getDetailQuality(),
        options: listProfiles().map(function (p) {
          return { id: p.id, label: p.label };
        }),
        onPick: function (id) {
          selectedQuality = id;
          setPlaybackPrefs({ quality: id });
          updateQualityBtnLabel();
          updateDirectPlayNotice();
          if (metadata) {
            currentProbe = probePlayback(metadata, selectedVersion, null, deviceInfo);
          }
        }
      });
    });
  }

  function wireSubtitleBtn(subs) {
    var btn = screen.querySelector('#btn-subtitles');
    if (!btn) return;
    var subList = subs || [];
    var subOptions = [{ id: null, label: 'Off', data: null }].concat(subList.map(function (s) {
      return { id: s.id, label: subtitleOptionLabel(s), data: s };
    }));
    function refreshLabel() {
      setIconBtnLabel('btn-subtitles', getSubtitleLabel(subList));
    }
    btn.disabled = !subList.length;
    refreshLabel();
    btn.addEventListener('click', function () {
      openSidePanel({
        title: 'Subtitles',
        options: subOptions.map(function (o) {
          return { id: o.id, label: o.label, selected: isActiveOption(o.id, selectedSubtitle) };
        }),
        onPick: function (id) {
          selectedSubtitle = id;
          refreshLabel();
        }
      });
    });
  }

  function wirePlaybackDetailCommon(item) {
    syncSelectedQualityFromPrefs();
    wireQualityBtn();
    updateDirectPlayNotice();

    var btnDirectPlayToggle = screen.querySelector('#btn-directplay-toggle');
    if (btnDirectPlayToggle) {
      btnDirectPlayToggle.addEventListener('click', function () {
        var panel = screen.querySelector('#direct-play-body');
        if (panel) panel.classList.toggle('hidden');
      });
    }
  }

  var seasonEpisodes = null;
  var seasonEpisodesLoading = false;

  function buildNoticeHtml(probe) {
    if (!probe || !probe.warnings.length) return '';
    var quality = getDetailQuality();
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
        ? ' Original file only is selected — use a transcode quality to play.'
        : (quality === 'original'
          ? ' Original will use remux or transcode instead of progressive direct play.'
          : ' Server transcode will be used.');
    } else if (strictDirect && blocked) {
      body += ' Original file only is selected in Settings — playback may fail without remux or transcode.';
    } else if (quality === 'original' && blocked && probe.canDirectStream) {
      body += ' Original will try HLS remux (direct stream) instead of progressive direct play.';
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
    var html = buildNoticeHtml(probe);
    if (!html) {
      if (disclosure) disclosure.hidden = true;
      return;
    }
    if (disclosure) disclosure.hidden = false;
    if (toggle) {
      toggle.textContent = probe && probe.warnings.length
        ? 'Playback compatibility'
        : 'How Original quality works';
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
    runProbe();
    return buildPlayerParamsFromMetadata(metadata, {
      deviceInfo: deviceInfo,
      playbackPrefs: getDetailPlaybackPrefs(),
      offset: offset,
      version: selectedVersion,
      audioStreamId: selectedAudio,
      subtitleStreamId: selectedSubtitle,
      detailRoute: { ratingKey: metadata.ratingKey }
    });
  }

  function navigateToPlayer(offset) {
    navigate('player', playParams(offset));
  }

  /**
   * Pick the episode to play when Play is pressed on a season: the first
   * episode that isn't fully watched (resuming if it's in progress), else the
   * first episode. Mirrors Plex "On Deck".
   */
  function resolveSeasonPlayTarget(episodes) {
    if (!episodes || !episodes.length) return null;
    for (var i = 0; i < episodes.length; i++) {
      var ep = episodes[i];
      var watched = ep.viewCount != null && Number(ep.viewCount) > 0;
      if (!watched) {
        return { episode: ep, offset: ep.viewOffset > 0 ? ep.viewOffset : 0 };
      }
    }
    // All watched → start the season over from episode 1.
    return { episode: episodes[0], offset: 0 };
  }

  /**
   * Play a season: resolve the target episode + queue the season so the player
   * autoplays the rest. Falls back to the season metadata only if episodes
   * can't be loaded.
   */
  function playSeason(seasonItem) {
    var seasonKey = seasonItem.ratingKey;
    ensureSeasonEpisodesLoaded(seasonKey).then(function (episodes) {
      var target = resolveSeasonPlayTarget(episodes);
      if (!target) {
        navigateToPlayer(0);
        return;
      }
      navigate('player', {
        ratingKey: target.episode.ratingKey,
        queueSeasonKey: seasonKey,
        offset: target.offset || 0,
        _detail: activeDetailRoute
      });
    }).catch(function () {
      navigateToPlayer(0);
    });
  }

  function offerResumeChoiceOrPlay(defaultOffset) {
    if (!metadata) return;
    if (shouldOfferResumeChoice(metadata.viewOffset, metadata.duration)) {
      showResumeOrStartModal({
        viewOffset: metadata.viewOffset,
        title: metadata.title || 'Continue watching?',
        onResume: function () { navigateToPlayer(metadata.viewOffset); },
        onStartFromBeginning: function () { navigateToPlayer(0); }
      });
      return;
    }
    navigateToPlayer(defaultOffset != null ? defaultOffset : 0);
  }

  function detailHomeMainEl() {
    return screen.querySelector('.detail-home-main');
  }

  function setDetailBackgroundImage(imageUrl) {
    if (!imageUrl) return;
    screen.style.backgroundImage = DETAIL_BG_GRADIENT + ', url(' + imageUrl + ')';
    screen.classList.add('screen--has-detail-bg');
  }

  function setDetailBackgroundColors(colors) {
    var gradient = buildUltraBlurColorGradient(colors);
    if (!gradient) return;
    screen.style.backgroundImage = DETAIL_BG_GRADIENT + ', ' + gradient;
    screen.classList.add('screen--has-detail-bg');
  }

  function applyDetailBackground(homeMain, server, item) {
    screen.classList.remove('screen--has-detail-bg');
    screen.style.backgroundImage = '';

    if (!item.artPath || !server) return;

    loadUltraBlurBackdrop(server, item.artPath).then(function (backdrop) {
      if (!backdrop || !backdrop.imageUrl) return;
      setDetailBackgroundImage(backdrop.imageUrl);
    });
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
    if (params.libraryId) route.libraryId = params.libraryId;
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

  function getSubtitleLabel(tracks) {
    if (selectedSubtitle == null) return 'Off';
    var match = tracks.filter(function (s) { return String(s.id) === String(selectedSubtitle); })[0];
    return match ? subtitleOptionLabel(match) : 'Off';
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
      if (destroyed) return;
      openSidePanel({
        title: 'Episodes · ' + seasonLabel(item),
        selectedId: String(item.ratingKey),
        options: episodes.map(function (ep) {
          var code = episodeCode(ep);
          return {
            id: String(ep.ratingKey),
            label: (code ? code + ' · ' : '') + (ep.title || 'Episode'),
            data: ep
          };
        }),
        onPick: function (id, opt) {
          if (String(id) === String(item.ratingKey)) return;
          navigate('detail', buildEpisodeNavRoute(opt.data, seasonKey));
        }
      });
    }).catch(function () {
      setWatchMessage('Could not load episodes for this season.', true);
    });
  }

  function pickDefaultSubtitleIfNeeded(subs) {
    // No automatic default subtitle, ever. A subtitle applies only on explicit
    // user selection. We only clear a stale selection that no longer exists in
    // the current version's stream list; otherwise leave it at "Off" (null).
    if (selectedSubtitle != null && !trackExists(subs, selectedSubtitle)) {
      selectedSubtitle = null;
    }
  }

  function pickDefaultAudioIfNeeded(audio) {
    if (!audio.length) return;
    if (!trackExists(audio, selectedAudio)) selectedAudio = null;
    if (!selectedAudio) {
      var defAudio = audio.filter(function (a) { return a.selected; })[0] || audio[0];
      selectedAudio = defAudio.id;
    }
  }

  // Icon button (icon + value label) for Subtitles / Quality. Opens a modal
  // drawer on click (wired in wireSubtitleBtn / wireQualityBtn). The label span
  // (#<id>-label) reflects the current selection so it reads at 10 ft.
  function iconActionButtonHtml(id, label, iconSvg) {
    return '<button class="btn detail-icon-btn" id="' + id + '" tabindex="0" aria-label="' +
      escapeHtml(label) + '">' +
      '<span class="detail-icon-btn__icon" aria-hidden="true">' + iconSvg + '</span>' +
      '<span class="detail-icon-btn__label" id="' + id + '-label">' + escapeHtml(label) +
      '</span></button>';
  }

  function setIconBtnLabel(id, text) {
    var label = screen.querySelector('#' + id + '-label');
    if (label) label.textContent = text;
  }

  function buildPlaybackActionsHtml(item) {
    return '<div class="detail-primary-actions" data-focus-zone="detail-primary-actions">' +
      '<button class="btn btn-primary detail-play-btn" id="btn-start" tabindex="0">' +
      (item.viewOffset ? 'Resume from ' + formatTimeOffset(item) : 'Play') + '</button>' +
      iconActionButtonHtml('btn-subtitles', 'Subtitles', subtitlesIconSvg()) +
      iconActionButtonHtml('btn-quality', 'Quality', qualityIconSvg()) +
      buildWatchlistActionHtml(item) +
      '</div>' +
      '<div class="detail-secondary-actions" data-focus-zone="detail-secondary-actions">' +
      '<button class="btn btn-outline btn--sm" id="btn-mark-watched" tabindex="0">Mark watched</button>' +
      '<button class="btn btn-outline btn--sm" id="btn-mark-unwatched" tabindex="0">Mark unwatched</button>' +
      '</div>';
  }

  function wirePlaybackActions(item) {
    screen.querySelector('#btn-start').addEventListener('click', function () {
      offerResumeChoiceOrPlay(0);
    });
    var btnWatched = screen.querySelector('#btn-mark-watched');
    var btnUnwatched = screen.querySelector('#btn-mark-unwatched');
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
    if (supportsWatchlistBookmark(item)) wireWatchlistBookmark(screen, item);
  }

  function renderEpisodeDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    seasonEpisodes = null;
    var versions = extractVersions(item);
    selectedVersion = pickBestVersion(versions, getState().playbackPrefs);
    currentProbe = probePlayback(item, selectedVersion, null, deviceInfo);

    var media = getActiveMedia(item);
    var audio = parseAudioStreams(media);
    var subs = parseSubtitleStreams(media, { includeGraphical: true });
    pickDefaultAudioIfNeeded(audio);
    pickDefaultSubtitleIfNeeded(subs);

    var progressPct = getWatchProgressPercent(item);
    var progressHtml = item.viewOffset && item.duration
      ? '<div class="progress-track detail-episode-progress" aria-hidden="true">' +
        '<div class="progress-fill" style="width:' + progressPct + '%"></div></div>'
      : '';
    var seriesTitle = item.grandparentTitle || '';
    var epCode = episodeCode(item);
    var primaryLine = '';
    if (epCode) primaryLine += '<span class="detail-episode-code">' + escapeHtml(epCode) + '</span>';
    if (item.viewOffset) {
      primaryLine += '<span class="detail-episode-remaining">' + escapeHtml(formatTimeRemaining(item)) + '</span>';
    }
    var secondaryParts = [
      formatReleaseDate(item.originallyAvailableAt),
      formatDuration(item.duration),
      item.contentRating
    ].filter(Boolean);
    var imdb = formatImdbRating(item);

    screen.innerHTML = wrapDetailShell(
      '<div class="detail-layout detail-layout--episode-v2">' +
      '<div class="detail-episode-v2-panel">' +
      buildDetailTopBar(buildEpisodeBreadcrumbTrail(item)) +
      '<div class="detail-episode-v2-art-wrap">' +
      '<img class="detail-episode-v2-art" id="detail-episode-art" alt="" />' +
      progressHtml +
      '</div>' +
      '<div class="detail-episode-v2-copy">' +
      (seriesTitle ? '<p class="detail-series-heading">' + escapeHtml(seriesTitle) + '</p>' : '') +
      '<h1 class="detail-episode-title">' + escapeHtml(item.title || '') + '</h1>' +
      (primaryLine ? '<p class="detail-episode-line detail-episode-line--primary">' + primaryLine + '</p>' : '') +
      (secondaryParts.length
        ? '<p class="detail-episode-line detail-episode-line--secondary">' +
          escapeHtml(secondaryParts.join(' · ')) + '</p>'
        : '') +
      (imdb ? '<p class="detail-episode-line detail-episode-rating">' + escapeHtml(imdb) + '</p>' : '') +
      (item.summary ? '<p class="detail-episode-summary">' + escapeHtml(item.summary) + '</p>' : '') +
      buildCreditsRowHtml(item) +
      '</div>' +
      buildPlaybackActionsHtml(item) +
      '<div id="detail-up-next"></div>' +
      buildCastRailHtml(item) +
      '<div class="detail-disclosure" id="direct-play-disclosure" data-focus-zone="detail-disclosure" hidden>' +
      '<button class="btn detail-disclosure-toggle" id="btn-directplay-toggle" tabindex="0">Playback compatibility</button>' +
      '<div class="detail-disclosure-body hidden" id="direct-play-body"></div>' +
      '</div>' +
      '<p class="watch-status-msg" id="watch-status-msg"></p>' +
      '</div></div>'
    );

    mountDetailHubNav();

    var art = screen.querySelector('#detail-episode-art');
    if (art) {
      bindPosterImage(art, item.thumb || item.art || item.grandparentThumbUrl || '', { priority: true });
    }
    bindCastImages(item);
    applyDetailBackground(detailHomeMainEl(), server, item);
    wirePlaybackDetailCommon(item);
    wireSubtitleBtn(subs);
    wirePlaybackActions(item);

    var seriesCrumb = screen.querySelector('#detail-series-crumb');
    if (seriesCrumb && (item.grandparentRatingKey || item.parentRatingKey || params.showKey)) {
      seriesCrumb.addEventListener('click', function () { navigateToSeriesDetail(item); });
    } else if (seriesCrumb) {
      seriesCrumb.disabled = true;
    }
    var seasonCrumb = screen.querySelector('#detail-season-crumb');
    if (seasonCrumb && item.parentRatingKey) {
      seasonCrumb.addEventListener('click', function () { navigateToSeasonDetail(item); });
    } else if (seasonCrumb) {
      seasonCrumb.disabled = true;
    }
    var episodePicker = screen.querySelector('#btn-episode-picker');
    if (episodePicker) {
      episodePicker.addEventListener('click', function () { openEpisodePickerModal(item); });
    }

    var seasonKey = item.parentRatingKey || params.seasonKey;
    if (seasonKey && item.index != null) {
      ensureSeasonEpisodesLoaded(seasonKey).then(function (episodes) {
        if (destroyed) return;
        var nextEp = null;
        for (var i = 0; i < episodes.length; i++) {
          if (episodes[i].index === item.index + 1) {
            nextEp = episodes[i];
            break;
          }
        }
        if (!nextEp) return;
        // Warm the next episode's metadata so "Up Next" opens instantly.
        if (server && nextEp.ratingKey) {
          try { prefetchDetailItems(server, [nextEp], { max: 1 }); }
          catch (e) { /* ignore */ }
        }
        var upNextEl = screen.querySelector('#detail-up-next');
        if (!upNextEl) return;
        var nextLabel = 'S' + (nextEp.parentIndex != null ? nextEp.parentIndex : item.parentIndex) +
          'E' + nextEp.index +
          (nextEp.title ? ' — ' + nextEp.title : '');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn detail-up-next-btn';
        btn.tabIndex = 0;
        // Spacing/colour live in CSS (DesignSystem owns .detail-up-next-btn /
        // its __label) — no inline layout styles here (Workstream D).
        btn.innerHTML = '<span class="detail-up-next-btn__label">Up Next</span>' +
          escapeHtml(nextLabel);
        btn.addEventListener('click', function () {
          navigate('detail', buildEpisodeNavRoute(nextEp, seasonKey));
        });
        upNextEl.appendChild(btn);
      }).catch(function () {});
    }

    var playBtn = screen.querySelector('#btn-start');
    if (playBtn) playBtn.focus();
    else focusFirst(screen);
  }

  function renderMovieDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    var versions = extractVersions(item);
    selectedVersion = pickBestVersion(versions, getState().playbackPrefs);
    currentProbe = probePlayback(item, selectedVersion, null, deviceInfo);

    var media = item.media && item.media[0] ? item.media[0] : {};
    var audio = parseAudioStreams(media);
    var subs = parseSubtitleStreams(media, { includeGraphical: true });
    pickDefaultAudioIfNeeded(audio);
    pickDefaultSubtitleIfNeeded(subs);

    var progressPct = getWatchProgressPercent(item);
    var progressHtml = item.viewOffset && item.duration
      ? '<div class="progress-track detail-progress-bar" aria-hidden="true">' +
        '<div class="progress-fill" style="width:' + progressPct + '%"></div></div>'
      : '';
    var imdb = formatImdbRating(item);
    var metaParts = [item.year, formatDuration(item.duration), item.contentRating, imdb]
      .filter(Boolean);

    screen.innerHTML = wrapDetailShell(
      '<div class="detail-layout detail-layout--movie-v2">' +
      '<div class="detail-movie-hero">' +
      '<div class="detail-movie-poster-wrap">' +
      '<img class="detail-poster detail-movie-poster" id="detail-poster" alt="" />' +
      progressHtml +
      '</div>' +
      '<div class="detail-movie-info">' +
      buildDetailTopBar(buildFilmBreadcrumbTrail()) +
      '<h1 class="detail-movie-title">' + escapeHtml(item.title || '') + '</h1>' +
      (metaParts.length
        ? '<p class="detail-meta">' + escapeHtml(metaParts.join(' · ')) + '</p>'
        : '') +
      buildGenreChipsHtml(item) +
      (item.summary
        ? '<p class="detail-summary detail-movie-summary">' + escapeHtml(item.summary) + '</p>'
        : '') +
      buildCreditsRowHtml(item) +
      buildPlaybackActionsHtml(item) +
      '<div class="detail-disclosure" id="direct-play-disclosure" data-focus-zone="detail-disclosure" hidden>' +
      '<button class="btn detail-disclosure-toggle" id="btn-directplay-toggle" tabindex="0">Playback compatibility</button>' +
      '<div class="detail-disclosure-body hidden" id="direct-play-body"></div>' +
      '</div>' +
      '<p class="watch-status-msg" id="watch-status-msg"></p>' +
      '</div></div>' +
      buildCastRailHtml(item) +
      '<div class="detail-rails detail-rails--movie" id="detail-rails" data-focus-zone="detail-rails"></div>' +
      '</div>'
    );

    mountDetailHubNav();

    var poster = screen.querySelector('#detail-poster');
    if (poster) bindPosterImage(poster, item.thumb || '', { priority: true });
    bindCastImages(item);
    applyDetailBackground(detailHomeMainEl(), server, item);
    wirePlaybackDetailCommon(item);
    wireSubtitleBtn(subs);
    wirePlaybackActions(item);

    var libCrumb = screen.querySelector('#detail-library-crumb');
    if (libCrumb) libCrumb.addEventListener('click', navigateToMovieLibrary);
    loadRelatedHubs(item.ratingKey);

    var playBtn = screen.querySelector('#btn-start');
    if (playBtn) playBtn.focus();
    else focusFirst(screen);
  }

  // ── Show detail (Google TV concept) ──────────────────────────────────────
  // Info block (title · meta · overview) over the hero backdrop, an underline
  // season tab bar (sliding blue indicator), and a 16:9 episode grid that
  // re-fills in place when a season tab is chosen. Reuses createTabs(underline)
  // + createMediaCard(episode) so nothing is hand-rolled here.
  var showSeasons = null;
  var activeSeasonKey = null;
  var showEpisodesGen = 0;

  function showMetaLine(item) {
    var parts = [item.year, item.contentRating].filter(Boolean);
    if (item.leafCount) parts.push(item.leafCount + ' episodes');
    if (item.genres && item.genres.length) {
      parts.push(item.genres.slice(0, 3).map(function (g) { return g.tag; }).join(', '));
    }
    return parts.join(' · ');
  }

  function renderShowDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    showSeasons = null;
    activeSeasonKey = null;
    var imdb = formatImdbRating(item);

    screen.innerHTML = wrapDetailShell(
      '<div class="detail-layout detail-layout--show-v2">' +
      '<div class="detail-show-info" data-focus-zone="detail-show-info">' +
      '<div class="detail-show-info-head">' +
      '<h1 class="detail-show-title">' + escapeHtml(item.title || '') + '</h1>' +
      buildWatchlistActionHtml(item) +
      '</div>' +
      '<p class="detail-show-meta" id="detail-show-meta">' + escapeHtml(showMetaLine(item)) + '</p>' +
      (imdb ? '<p class="detail-show-meta detail-show-rating">' + escapeHtml(imdb) + '</p>' : '') +
      (item.summary
        ? '<p class="detail-show-overview">' + escapeHtml(item.summary) + '</p>'
        : '') +
      '</div>' +
      '<div class="detail-season-tabs" id="detail-season-tabs"></div>' +
      '<div class="detail-episode-grid row-scroll--episodes" id="detail-episode-grid" ' +
      'data-focus-zone="detail-episode-grid" data-cols="4">' +
      '<p class="status-msg detail-episode-grid-empty">Loading seasons…</p>' +
      '</div>' +
      '</div>'
    );

    mountDetailHubNav();
    applyDetailBackground(detailHomeMainEl(), server, item);
    if (supportsWatchlistBookmark(item)) wireWatchlistBookmark(screen, item);
    loadShowSeasons(item.ratingKey);
  }

  function loadShowSeasons(showKey) {
    var gen = ++seasonsLoadGen;
    getChildren(server, showKey).then(function (items) {
      if (destroyed || gen !== seasonsLoadGen) return;
      var seasons = (items || []).filter(function (s) {
        return !isVirtualAllEpisodesSeason(s);
      });
      showSeasons = seasons;
      var tabsHost = screen.querySelector('#detail-season-tabs');
      var grid = screen.querySelector('#detail-episode-grid');
      if (!tabsHost) return;
      if (!seasons.length) {
        if (grid) grid.innerHTML = '<p class="status-msg detail-episode-grid-empty">No seasons available.</p>';
        return;
      }
      activeSeasonKey = String(seasons[0].ratingKey);
      var tabs = createTabs({
        zone: 'detail-season-tabs',
        activeId: activeSeasonKey,
        tabs: seasons.map(function (s) {
          return { id: String(s.ratingKey), label: seasonTabLabel(s) };
        }),
        onSelect: function (id) {
          activeSeasonKey = String(id);
          loadShowEpisodes(activeSeasonKey, showKey);
        }
      });
      tabsHost.innerHTML = '';
      tabsHost.appendChild(tabs);
      var firstTab = tabs.querySelector('.gt-tab');
      if (firstTab) firstTab.focus();
      loadShowEpisodes(activeSeasonKey, showKey);
    }).catch(function () {
      if (destroyed) return;
      var grid = screen.querySelector('#detail-episode-grid');
      if (grid) grid.innerHTML = '<p class="status-msg detail-episode-grid-empty">Could not load seasons.</p>';
    });
  }

  function seasonTabLabel(s) {
    if (s.index != null && s.index !== '') return 'Season ' + s.index;
    if (s.title) return s.title;
    return 'Season';
  }

  function loadShowEpisodes(seasonKey, showKey) {
    var grid = screen.querySelector('#detail-episode-grid');
    if (!grid) return;
    var gen = ++showEpisodesGen;
    grid.innerHTML = '<p class="status-msg detail-episode-grid-empty">Loading episodes…</p>';
    getChildren(server, seasonKey).then(function (items) {
      if (destroyed || gen !== showEpisodesGen) return;
      var currentGrid = screen.querySelector('#detail-episode-grid');
      if (!currentGrid) return;
      currentGrid.innerHTML = '';
      if (!items || !items.length) {
        currentGrid.innerHTML = '<p class="status-msg detail-episode-grid-empty">No episodes in this season.</p>';
        return;
      }
      items.forEach(function (ep) {
        currentGrid.appendChild(createMediaCard(ep, function (selected, routeParams) {
          var route = routeParams || { ratingKey: selected.ratingKey };
          route.seasonKey = seasonKey;
          route.showKey = showKey || '';
          route.parentDetail = activeDetailRoute;
          navigate('detail', route);
        }, { layout: 'episode' }));
      });
      hydrateRowWindow(currentGrid, { start: 0, count: items.length });
    }).catch(function () {
      if (destroyed || gen !== showEpisodesGen) return;
      var currentGrid = screen.querySelector('#detail-episode-grid');
      if (currentGrid) {
        currentGrid.innerHTML = '<p class="status-msg detail-episode-grid-empty">Could not load episodes.</p>';
      }
    });
  }

  function renderStandardDetail(item) {
    metadata = item;
    activeDetailRoute = buildActiveDetailRoute(item);
    var versions = extractVersions(item);
    selectedVersion = pickBestVersion(versions, getState().playbackPrefs);
    currentProbe = probePlayback(item, selectedVersion, null, deviceInfo);

    var layoutClass = 'detail-layout';
    if (item.type === 'season') layoutClass += ' detail-layout--season';
    if (item.type === 'show') layoutClass += ' detail-layout--show';

    var topBar = '';
    if (item.type === 'season') {
      topBar = buildDetailTopBar(buildSeriesBreadcrumbTrail(item));
    }

    var watchlistInActions = item.type === 'season' ? buildWatchlistActionHtml(item) : '';

    var detailInfoHtml =
      '<div class="detail-info">' +
      '<h1 class="screen-title">' + escapeHtml(item.title) + '</h1>' +
      '<p class="detail-meta" id="detail-meta"></p>' +
      '<p class="detail-summary">' + escapeHtml(item.summary || '') + '</p>' +
      '<div class="detail-primary-actions" data-focus-zone="detail-primary-actions" data-cols="3">' +
      '<button class="btn btn-primary" id="btn-start" tabindex="0">' + (item.viewOffset ? 'Resume' : 'Play') + '</button>' +
      watchlistInActions +
      '<button class="btn" id="btn-more-actions" tabindex="0">More actions</button>' +
      '</div>' +
      '<div class="detail-actions detail-actions-secondary hidden" id="detail-actions-secondary" ' +
      'data-focus-zone="detail-secondary-actions" data-cols="5">' +
      '<button class="btn" id="btn-play" tabindex="0">Play from start</button>' +
      '<button class="btn" id="btn-resume" tabindex="0"' + (item.viewOffset ? '' : ' disabled') + '>Resume</button>' +
      '<button class="btn btn-outline btn--sm" id="btn-mark-watched" tabindex="0">Mark watched</button>' +
      '<button class="btn btn-outline btn--sm" id="btn-mark-unwatched" tabindex="0">Mark unwatched</button>' +
      '<button class="btn" id="btn-refresh" tabindex="0">Refresh metadata</button>' +
      '</div>' +
      '<div class="detail-disclosure" id="direct-play-disclosure" data-focus-zone="detail-disclosure" hidden>' +
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
      '<div class="detail-rails' +
      (item.type === 'show' ? ' detail-rails--show' : '') +
      '" id="detail-rails" data-focus-zone="detail-rails"></div>' +
      '</div>';

    var heroHtml = '<img class="detail-poster" id="detail-poster" alt="" />' + detailInfoHtml;
    var layoutBody = item.type === 'season' && topBar
      ? '<div class="detail-standard-panel">' + topBar +
        '<div class="detail-standard-hero">' + heroHtml + '</div></div>'
      : topBar + heroHtml;

    screen.innerHTML = wrapDetailShell(
      '<div class="' + layoutClass + '">' + layoutBody + '</div>'
    );

    mountDetailHubNav();

    var poster = screen.querySelector('#detail-poster');
    if (poster) bindPosterImage(poster, item.thumb || item.art || '', { priority: true });
    applyDetailBackground(detailHomeMainEl(), server, item);
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
    if (item.type === 'show') {
      loadSeasons(item.ratingKey);
    } else if (item.type === 'season') {
      loadEpisodes(item.ratingKey, item.parentRatingKey || params.showKey || '');
    } else if (params.seasonKey) {
      // Backward-compatible fallback for older deep links.
      loadEpisodes(params.seasonKey, params.showKey || '');
    }

    if (item.type === 'show') {
      loadRelatedHubs(item.ratingKey);
    }

    var seriesCrumb = screen.querySelector('#detail-series-crumb');
    if (seriesCrumb) {
      seriesCrumb.addEventListener('click', function () {
        navigateToSeriesDetail(item);
      });
    }

    screen.querySelector('#btn-start').addEventListener('click', function () {
      // A season has no playable part of its own — resolve an episode + queue
      // the season instead of handing the season container to the player.
      if (item.type === 'season') {
        playSeason(item);
        return;
      }
      offerResumeChoiceOrPlay(0);
    });
    screen.querySelector('#btn-play').addEventListener('click', function () {
      if (item.type === 'season') {
        playSeason(item);
        return;
      }
      navigateToPlayer(0);
    });
    screen.querySelector('#btn-resume').addEventListener('click', function () {
      navigateToPlayer(item.viewOffset);
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

    if (supportsWatchlistBookmark(item)) {
      wireWatchlistBookmark(screen, item);
    }

    var playBtn = screen.querySelector('#btn-start');
    if (playBtn) playBtn.focus();
    else focusFirst(screen);
  }

  function renderDetail(item) {
    if (item.type === 'episode') {
      renderEpisodeDetail(item);
      return;
    }
    if (item.type === 'movie') {
      renderMovieDetail(item);
      return;
    }
    if (item.type === 'show') {
      renderShowDetail(item);
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
    var label = subtitleMenuOptionLabel(track);
    return track.graphical ? label + ' (image — transcode)' : label;
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

    // No automatic default subtitle: only clear a stale selection that no
    // longer exists; never auto-pick one. Default stays "Off" (null).
    if (selectedSubtitle != null && !trackExists(subs, selectedSubtitle)) {
      selectedSubtitle = null;
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
        if (isVirtualAllEpisodesSeason(s)) return;
        row.appendChild(createMediaCard(s, function (selected, routeParams) {
          var route = routeParams || { ratingKey: selected.ratingKey };
          route.showKey = showKey;
          route.libraryType = 'show';
          route.parentDetail = activeDetailRoute;
          navigate('detail', route);
        }, { layout: 'row', cardText: 'titleOnly' }));
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
      var hubOpts = metadata && metadata.type === 'show'
        ? { visibleCount: 12 }
        : undefined;
      var relatedItems = [];
      rows.forEach(function (row) {
        renderHubRow(rails, row, navigate, hubOpts);
        var items = (row && row.items) || [];
        for (var i = 0; i < items.length && i < 4; i++) {
          if (items[i] && items[i].ratingKey) relatedItems.push(items[i]);
        }
      });
      // Drilling into a related title should be instant: warm their metadata.
      if (server && relatedItems.length) {
        try { prefetchDetailItems(server, relatedItems, { max: 8 }); }
        catch (e) { /* ignore */ }
      }
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
      showEpisodesGen += 1;
      try { abortPrefetch(); } catch (e) { /* ignore */ }
      detachFocus();
    }
  };
}

export { detailScreen };
