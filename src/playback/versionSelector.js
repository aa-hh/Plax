/**
 * Select among multiple media versions (files) for a Plex item.
 */

function extractVersions(metadata) {
  var mediaList = metadata.media || metadata._children || [];
  var versions = [];
  mediaList.forEach(function (m) {
    if (m._tag === 'Media' || m.videoResolution || m.id) {
      var parts = m._children || m._nested || [];
      var part = parts.find(function (p) { return p._tag === 'Part' || p.file; }) || parts[0];
      versions.push({
        id: m.id,
        videoResolution: m.videoResolution,
        videoCodec: m.videoCodec,
        videoProfile: m.videoProfile,
        audioCodec: m.audioCodec,
        bitrate: m.bitrate,
        container: m.container,
        partKey: part && (part.key || part.id),
        partId: part && part.id,
        title: [m.videoResolution, m.videoCodec, m.audioCodec].filter(Boolean).join(' · ') || 'Version'
      });
    }
  });
  if (!versions.length && metadata.key) {
    versions.push({ id: 'default', partKey: metadata.key, title: 'Default' });
  }
  return versions;
}

function pickBestVersion(versions, prefs, capabilities) {
  if (!versions.length) return null;
  if (prefs && prefs.preferHighestQuality) {
    return versions[0];
  }
  return versions[versions.length - 1] || versions[0];
}

export { extractVersions, pickBestVersion };
