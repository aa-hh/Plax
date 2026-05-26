import { getChildren } from '../plex/library.js';

var items = [];
var currentIndex = 0;

function sortByIndex(a, b) {
  var ai = parseInt(a.index, 10) || 0;
  var bi = parseInt(b.index, 10) || 0;
  return ai - bi;
}

function mapEpisodeItem(ep) {
  return {
    ratingKey: ep.ratingKey,
    title: ep.title,
    index: ep.index,
    parentIndex: ep.parentIndex,
    grandparentTitle: ep.grandparentTitle,
    parentTitle: ep.parentTitle
  };
}

function buildSingle(item) {
  items = [mapEpisodeItem(item)];
  currentIndex = 0;
  return items;
}

function buildFromEpisodes(episodes, startRatingKey) {
  items = episodes.slice().sort(sortByIndex).map(mapEpisodeItem);
  currentIndex = 0;
  if (startRatingKey) {
    for (var i = 0; i < items.length; i++) {
      if (String(items[i].ratingKey) === String(startRatingKey)) {
        currentIndex = i;
        break;
      }
    }
  }
  return items;
}

function buildFromSeason(server, seasonKey, startRatingKey) {
  return getChildren(server, seasonKey).then(function (episodes) {
    return buildFromEpisodes(episodes, startRatingKey);
  });
}

function getCurrent() {
  return items[currentIndex] || null;
}

function peekNext() {
  if (currentIndex >= items.length - 1) return null;
  return items[currentIndex + 1];
}

function peekPrevious() {
  if (currentIndex <= 0) return null;
  return items[currentIndex - 1];
}

function hasNext() {
  return currentIndex < items.length - 1;
}

function hasPrevious() {
  return currentIndex > 0;
}

function next() {
  if (!hasNext()) return null;
  currentIndex += 1;
  return getCurrent();
}

function previous() {
  if (!hasPrevious()) return null;
  currentIndex -= 1;
  return getCurrent();
}

function getLength() {
  return items.length;
}

function isAutoplayQueue() {
  return items.length > 1;
}

function formatEpisodeCode(item) {
  if (!item) return '';
  var s = item.parentIndex != null ? pad2(item.parentIndex) : '';
  var e = item.index != null ? pad2(item.index) : '';
  if (s && e) return 'S' + s + 'E' + e;
  if (e) return 'E' + e;
  return '';
}

function formatNextUpLabel(item) {
  if (!item) return '';
  var code = formatEpisodeCode(item);
  var title = item.title || '';
  if (code && title) return code + ' · ' + title;
  return code || title;
}

function pad2(n) {
  n = parseInt(n, 10) || 0;
  return n < 10 ? '0' + n : String(n);
}

function reset() {
  items = [];
  currentIndex = 0;
}

export {
  buildSingle,
  buildFromEpisodes,
  buildFromSeason,
  getCurrent,
  peekPrevious,
  peekNext,
  hasPrevious,
  hasNext,
  previous,
  next,
  getLength,
  isAutoplayQueue,
  formatNextUpLabel,
  formatEpisodeCode,
  reset
};
