/**
 * Minimal XML attribute parser for Plex API responses.
 */

var METADATA_TAGS = {
  Video: 1, Movie: 1, Episode: 1, Season: 1, Show: 1,
  Directory: 1,
  Metadata: 1,
  Artist: 1, Album: 1, Track: 1, Photo: 1, Clip: 1
};

function parseAttrs(el) {
  var attrs = {};
  if (!el || !el.attributes) return attrs;
  var i;
  for (i = 0; i < el.attributes.length; i++) {
    var a = el.attributes[i];
    attrs[a.name] = a.value;
  }
  return attrs;
}

function parseNode(node) {
  var item = parseAttrs(node);
  item._tag = node.tagName;
  item._children = [];
  var j;
  for (j = 0; j < node.children.length; j++) {
    item._children.push(parseNode(node.children[j]));
  }
  return item;
}

function parsePlexXml(xmlText) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(xmlText, 'text/xml');
  var mediaContainer = doc.querySelector('MediaContainer');
  if (!mediaContainer) return { size: 0, items: [], hubs: [] };

  var containerAttrs = parseAttrs(mediaContainer);
  var items = [];
  var hubs = [];
  var i;
  for (i = 0; i < mediaContainer.children.length; i++) {
    var node = mediaContainer.children[i];
    var parsed = parseNode(node);
    if (node.tagName === 'Hub') {
      hubs.push(parsed);
    } else {
      items.push(parsed);
    }
  }
  return {
    size: parseInt(containerAttrs.size, 10) || items.length,
    attrs: containerAttrs,
    items: items,
    hubs: hubs
  };
}

function flattenHubMetadata(hubs) {
  var out = [];
  (hubs || []).forEach(function (hub) {
    (hub._children || []).forEach(function (child) {
      if (METADATA_TAGS[child._tag]) out.push(child);
    });
  });
  return out;
}

function extractMetadataItems(result) {
  if (!result) return [];
  var fromHubs = flattenHubMetadata(result.hubs);
  if (fromHubs.length) return fromHubs;
  var fromItems = (result.items || []).filter(function (item) {
    return METADATA_TAGS[item._tag];
  });
  if (fromItems.length) return fromItems;
  var fromHubItems = (result.items || []).filter(function (item) {
    return item._tag === 'Hub';
  });
  return flattenHubMetadata(fromHubItems);
}

export { parsePlexXml, parseAttrs, parseNode, extractMetadataItems, METADATA_TAGS };
