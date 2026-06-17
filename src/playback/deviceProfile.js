/**
 * webOS 4 Plex client profile (X-Plex-Client-Profile-Extra) for MDE / transcode URLs.
 */

import { getLimits } from './lgBitrateLimits.js';
import { getCodecCapabilities, tvLikelySupportsDts } from '../platform/webos.js';
import { getState } from '../core/store.js';

function resolveDeviceInfo(deviceInfo) {
  if (deviceInfo && Object.keys(deviceInfo).length) return deviceInfo;
  var state = typeof getState === 'function' ? getState() : null;
  return (state && state.deviceInfo) || {};
}

function isFullTranscodeStrategy(strategy) {
  return strategy === 'transcode' || strategy === 'http-transcode';
}

function resolveCapabilities(deviceInfo, capabilities) {
  if (capabilities) return capabilities;
  if (typeof document !== 'undefined' && document.createElement) {
    return getCodecCapabilities(deviceInfo);
  }
  var caps = { dts: '', eac3: '', ac3: '', aac: '' };
  if (tvLikelySupportsDts(deviceInfo)) {
    caps.dts = 'probably';
    caps.eac3 = 'probably';
    caps.ac3 = 'probably';
    caps.dtsInferred = true;
    caps.eac3Inferred = true;
    caps.ac3Inferred = true;
  }
  return caps;
}

function audioCodecsForDirectPlay(deviceInfo, capabilities) {
  capabilities = resolveCapabilities(deviceInfo, capabilities);
  var codecs = ['aac', 'ac3', 'eac3', 'mp3'];
  if (capabilities.dts || tvLikelySupportsDts(deviceInfo)) {
    codecs.push('dca');
  }
  return codecs.join(',');
}

function buildDirectPlayProfiles(deviceInfo, capabilities) {
  var audioCodecs = audioCodecsForDirectPlay(deviceInfo, capabilities);
  var profiles = [
    'add-direct-play-profile(type=videoProfile&container=mp4,mkv,ts,m4v,mov' +
      '&videoCodec=h264,hevc&audioCodec=' + audioCodecs + ')'
  ];
  if (deviceInfo.dolbyVision) {
    profiles.push(
      'add-direct-play-profile(type=videoProfile&container=mp4&videoCodec=hevc' +
        '&audioCodec=' + audioCodecs + ')'
    );
  }
  return profiles;
}

function isWebOs4Device(deviceInfo) {
  if (!deviceInfo) return false;
  if (deviceInfo.versionMajor != null && parseInt(deviceInfo.versionMajor, 10) === 4) {
    return true;
  }
  var model = String(deviceInfo.model || deviceInfo.modelName || '');
  return /OLED\d{2}[BCEW]8/i.test(model);
}

function buildTranscodeTargets(deviceInfo, capabilities, options) {
  options = options || {};
  var strategy = options.strategy || options.playbackStrategy || 'direct-stream';
  var audioCodecs = audioCodecsForDirectPlay(deviceInfo, capabilities);
  var parts = [];

  if (isFullTranscodeStrategy(strategy)) {
    // fMP4 (container=mp4) produces an #EXT-X-MAP init segment (/base/header)
    // that Plex 404s during transcode startup, stalling hls.js indefinitely.
    // MPEG-TS has no init segment dependency and hls.js handles it fine.
    parts.push(
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls' +
        '&container=mpegts&videoCodec=h264&audioCodec=aac,ac3,mp3)'
    );
    // Progressive HTTP MP4 target — required so PMS has a conversion profile
    // when we deliver over HTTP on webOS 4 (avoids transcodeDecisionCode 4005
    // "No conversion profile found for protocol http"). Progressive MP4 has no
    // segment/init-segment dependency, so it sidesteps the fMP4 HLS 404.
    parts.push(
      'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
        '&container=mp4&videoCodec=h264&audioCodec=aac,ac3,mp3)'
    );
    parts.push(
      'add-transcode-target-audio-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=aac)'
    );
  } else {
    parts.push(
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls' +
        '&container=mpegts&videoCodec=h264,hevc&audioCodec=' + audioCodecs + ')',
      'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
        '&container=mp4&videoCodec=h264,hevc&audioCodec=' + audioCodecs + ')'
    );
    if (deviceInfo.dolbyVision) {
      parts.push(
        'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
          '&container=mp4&videoCodec=hevc&audioCodec=' + audioCodecs + ')'
      );
    }
  }

  parts.push(
    'add-transcode-target-audio-codec(type=videoProfile&context=streaming&audioCodec=truehd&transcodeCodec=aac)',
    'add-transcode-target-audio-codec(type=videoProfile&context=streaming&audioCodec=mlp&transcodeCodec=aac)'
  );
  return parts;
}

function buildBitrateLimitations(deviceInfo) {
  var isUhd = deviceInfo && deviceInfo.uhd;
  var h264Lim = getLimits(isUhd, 'h264');
  var hevcLim = getLimits(isUhd, 'hevc');
  var res = isUhd ? '3840x2160' : '1920x1080';
  return [
    'add-limitation(scope=videoProfile&codec=h264&videoResolution=' + res +
      '&maxVideoBitrate=' + h264Lim.maxBitrateKbps + ')',
    'add-limitation(scope=videoProfile&codec=hevc&videoResolution=' + res +
      '&maxVideoBitrate=' + hevcLim.maxBitrateKbps + ')'
  ];
}

/**
 * @param {object} deviceInfo uhd, hdr10, dolbyVision, ...
 * @param {{ strategy?: string, capabilities?: object }} options
 * @returns {string} joined profile-extra directives
 */
function buildWebOsClientProfileExtra(deviceInfo, options) {
  deviceInfo = resolveDeviceInfo(deviceInfo);
  options = options || {};
  var capabilities = resolveCapabilities(deviceInfo, options.capabilities);
  return buildDirectPlayProfiles(deviceInfo, capabilities)
    .concat(buildTranscodeTargets(deviceInfo, capabilities, options))
    .concat(buildBitrateLimitations(deviceInfo))
    .join('+');
}

export {
  buildWebOsClientProfileExtra,
  audioCodecsForDirectPlay,
  buildDirectPlayProfiles,
  buildTranscodeTargets,
  buildBitrateLimitations,
  resolveDeviceInfo
};
