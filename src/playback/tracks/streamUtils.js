function collectStreamsFromMedia(media, streamType) {
  var streams = [];
  function addFromList(list) {
    (list || []).forEach(function (s) {
      if (s._tag === 'Stream' && (s.streamType === String(streamType) || s.streamType === streamType)) {
        streams.push(s);
      }
    });
  }
  addFromList(media._children);
  (media._children || []).forEach(function (child) {
    if (child._tag === 'Part') {
      addFromList(child._children);
      addFromList(child._nested);
    }
  });
  return streams;
}

export { collectStreamsFromMedia };
