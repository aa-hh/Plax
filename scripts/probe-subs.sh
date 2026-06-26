#!/usr/bin/env bash
# Probe Plex embedded-subtitle fetch shapes to find which returns the SRT (200).
# Token stays local; only status/content-type/size are printed.
#
# Usage:
#   TOK=<your-x-plex-token> bash scripts/probe-subs.sh
#   TOK=... METADATA=33886 bash scripts/probe-subs.sh   # pick a specific item
#
# Get your token: in Plex Web, open any item → ... → Get Info → View XML; the
# URL has X-Plex-Token=<token>. (Or grep a non-redacted client request.)
set -u

PLEX="${PLEX:-https://185-203-56-20.2969cb2f8b514ba4b8312ec1aede7540.plex.direct:17054}"
TOK="${TOK:?set TOK=<x-plex-token>}"
METADATA="${METADATA:-33886}"

hr(){ printf '\n========== %s ==========\n' "$1"; }

# Use explicit PART/SID/SIDX env overrides when given (skip flaky auto-discovery);
# otherwise pull a Part id + an EMBEDDED text subtitle stream from the metadata.
PART="${PART:-}"; SID="${SID:-}"; SIDX="${SIDX:-}"
if [ -z "$PART" ] || [ -z "$SID" ]; then
  META="$(curl -sk -m 20 "$PLEX/library/metadata/$METADATA?X-Plex-Token=$TOK")"
  PART="${PART:-$(printf '%s' "$META" | tr '<' '\n' | grep -iE '^Part ' | grep -oE 'id="[0-9]+"' | head -1 | grep -oE '[0-9]+')}"
  SUBLINE="$(printf '%s' "$META" | tr '<' '\n' | grep -iE 'streamType="3"' | grep -iE 'codec="(srt|subrip|ass|ssa)"' | grep -v 'key=' | head -1)"
  SID="${SID:-$(printf '%s' "$SUBLINE" | grep -oE 'id="[0-9]+"' | head -1 | grep -oE '[0-9]+')}"
  SIDX="${SIDX:-$(printf '%s' "$SUBLINE" | grep -oE 'index="[0-9]+"' | head -1 | grep -oE '[0-9]+')}"
fi

echo "PLEX=$PLEX"
echo "metadata=$METADATA part=$PART embeddedSubId=$SID index=$SIDX"
[ -z "$SID" ] && { echo "No embedded text subtitle found on item $METADATA — try another METADATA="; printf '%s' "$META" | tr '<' '\n' | grep -iE 'streamType="3"' | cut -c1-160; exit 1; }

CID="probe-$(date +%s)"
COMMON="X-Plex-Client-Identifier=$CID&X-Plex-Token=$TOK"
SESS="probe-sess-$(date +%s)"

probe(){ # label url
  local code ct size
  read -r code ct size < <(curl -sk -m 25 -o /tmp/sub_body -w '%{http_code} %{content_type} %{size_download}' "$2"; echo)
  printf '[%s] status=%s type=%s bytes=%s\n' "$1" "$code" "$ct" "$size"
  head -c 80 /tmp/sub_body | tr '\n' ' '; printf '\n'
}

hr "A: /library/streams/{id}.srt (current stream-embedded path)"
probe "streams.srt" "$PLEX/library/streams/$SID.srt?encoding=utf-8&format=srt&$COMMON"

hr "B: universal/subtitles MINIMAL (no hasMDE/location) — hypothesis fix"
probe "univ-min" "$PLEX/video/:/transcode/universal/subtitles?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&subtitles=auto&subtitleStreamID=$SID&$COMMON"

hr "C: universal/subtitles WITH hasMDE+location=wan (current shape)"
probe "univ-wan" "$PLEX/video/:/transcode/universal/subtitles?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&hasMDE=1&location=wan&protocol=http&directPlay=0&directStream=1&subtitles=auto&subtitleStreamID=$SID&session=$SESS&$COMMON"

hr "D: PUT part subtitle select, THEN universal/subtitles minimal"
curl -sk -m 20 -X PUT "$PLEX/library/parts/$PART?subtitleStreamID=$SID&allParts=1&$COMMON" -o /dev/null -w 'PUT status=%{http_code}\n'
probe "univ-after-put" "$PLEX/video/:/transcode/universal/subtitles?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&subtitles=auto&$COMMON"

hr "E: direct-stream REMUX handshake (decision -> start -> subtitles)"
SESS2="probe-remux-$(date +%s)"
DEC="$PLEX/video/:/transcode/universal/decision?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&protocol=hls&directPlay=0&directStream=1&directStreamAudio=1&subtitleStreamID=$SID&session=$SESS2&X-Plex-Client-Profile-Name=Generic&$COMMON"
DECBODY="$(curl -sk -m 20 "$DEC")"
echo "decision Part@decision: $(printf '%s' "$DECBODY" | grep -oE 'decision="[a-z]+"' | tr '\n' ' ')"
RS="$(printf '%s' "$DECBODY" | grep -oE 'resourceSession="[^"]+"' | head -1 | cut -d'"' -f2)"
echo "resourceSession=$RS"
# begin a live remux session
curl -sk -m 20 "$PLEX/video/:/transcode/universal/start.m3u8?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&protocol=hls&directPlay=0&directStream=1&directStreamAudio=1&fastSeek=1&session=$SESS2&X-Plex-Client-Profile-Name=Generic&$COMMON" -o /dev/null -w 'start.m3u8 status=%{http_code}\n'
sleep 3
probe "subs-vs-live-session" "$PLEX/video/:/transcode/universal/subtitles?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&subtitles=auto&subtitleStreamID=$SID&session=$SESS2&$COMMON"
[ -n "$RS" ] && probe "subs-vs-resourceSession" "$PLEX/video/:/transcode/universal/subtitles?path=%2Flibrary%2Fmetadata%2F$METADATA&mediaIndex=0&partIndex=0&subtitles=auto&subtitleStreamID=$SID&session=$RS&$COMMON"

hr "F: on-demand EXTRACT then fetch as a stream (PUT part-select -> poll /library/streams)"
curl -sk -m 20 -X PUT "$PLEX/library/parts/$PART?subtitleStreamID=$SID&allParts=1&$COMMON" -o /dev/null -w 'PUT part-select status=%{http_code}\n'
for i in 1 2 3 4; do
  sleep 2
  read -r code ct size < <(curl -sk -m 25 -o /tmp/sub_body -w '%{http_code} %{content_type} %{size_download}' "$PLEX/library/streams/$SID.srt?encoding=utf-8&$COMMON"; echo)
  printf '[streams.srt try %s] status=%s type=%s bytes=%s\n' "$i" "$code" "$ct" "$size"
  [ "$code" = "200" ] && { echo "  -> SUCCESS: $(head -c 80 /tmp/sub_body | tr '\n' ' ')"; break; }
done

hr "G: alternate stream paths (no ext / vtt / codec param)"
probe "streams-noext"   "$PLEX/library/streams/$SID?$COMMON"
probe "streams-vtt"     "$PLEX/library/streams/$SID.vtt?$COMMON"
probe "streams-format"  "$PLEX/library/streams/$SID?format=srt&$COMMON"

hr "H: OFFICIAL endpoint /subtitles/:/transcode/universal/start (subtitles=sidecar, directPlay=1)"
SESS3="probe-substart-$(date +%s)"
curl -sk -m 20 -X PUT "$PLEX/library/parts/$PART?subtitleStreamID=$SID&allParts=1&$COMMON" -o /dev/null -w 'PUT part-select status=%{http_code}\n'
probe "subs-start" "$PLEX/subtitles/:/transcode/universal/start?directPlay=1&directStream=1&directStreamAudio=1&protocol=http&fastSeek=1&path=%2Flibrary%2Fmetadata%2F$METADATA&session=$SESS3&mediaIndex=0&partIndex=0&mediaBufferSize=50000&hasMDE=1&subtitleSize=75&autoAdjustSubtitle=1&subtitles=sidecar&location=wan&copyts=1&offset=0&$COMMON"
probe "subs-start-withid" "$PLEX/subtitles/:/transcode/universal/start?directPlay=1&directStream=1&directStreamAudio=1&protocol=http&fastSeek=1&path=%2Flibrary%2Fmetadata%2F$METADATA&session=${SESS3}b&mediaIndex=0&partIndex=0&mediaBufferSize=50000&hasMDE=1&subtitleSize=75&autoAdjustSubtitle=1&subtitles=sidecar&subtitleStreamID=$SID&location=wan&copyts=1&offset=0&$COMMON"

hr "DONE — paste the [label] status lines back"
