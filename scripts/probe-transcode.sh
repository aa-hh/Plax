#!/usr/bin/env bash
# Diagnostic: probe the Plex transcode endpoints with several delivery configs
# to see what PMS actually returns (decision, playlist, segment/init reachability)
# WITHOUT needing a manual TV test each time.
#
# Usage: PLEX=<https url> TOK=<token> PATHKEY=/library/metadata/33725 bash scripts/probe-transcode.sh
set -u

PLEX="${PLEX:?set PLEX}"
TOK="${TOK:?set TOK}"
PATHKEY="${PATHKEY:-/library/metadata/33725}"   # default: God's Own Country (PGS film)
SUB="${SUB:-}"                                    # optional: subtitle stream id to burn

CID="xplay-probe-$(date +%s)"
COMMON="X-Plex-Client-Identifier=$CID&X-Plex-Product=Plex+for+LG&X-Plex-Version=0.1.0&X-Plex-Platform=webOS&X-Plex-Platform-Version=4.4.0&X-Plex-Device=TV&X-Plex-Model=OLED55B8LLA&X-Plex-Token=$TOK"

hr() { printf '\n========== %s ==========\n' "$1"; }

# $1 label, $2 full url
probe() {
  local label="$1" url="$2"
  local ct code size
  read -r code ct size < <(curl -sk -m 25 -o /tmp/probe_body -w "%{http_code} %{content_type} %{size_download}" "$url"; echo)
  printf '[%s] status=%s type=%s bytes=%s\n' "$label" "$code" "$ct" "$size"
  echo "$url" > /tmp/probe_url
}

# ---- 1) DECISION across protocol/container combos ----
for combo in "hls:mpegts" "hls:mp4" "http:mp4"; do
  proto="${combo%%:*}"; cont="${combo##*:}"
  PEXTRA="add-transcode-target(type=videoProfile&context=streaming&protocol=$proto&container=$cont&videoCodec=h264&audioCodec=aac,ac3,mp3)"
  SUBP=""
  [ -n "$SUB" ] && SUBP="&subtitles=burn&subtitleStreamID=$SUB&X-Plex-Subtitle-Stream=$SUB&subtitleSize=100&autoAdjustSubtitle=1"
  URL="$PLEX/video/:/transcode/universal/decision?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PATHKEY")&mediaIndex=0&partIndex=0&hasMDE=1&directPlay=0&directStream=0&maxVideoBitrate=8000&videoResolution=1920x1080&protocol=$proto&session=${CID}_${proto}_${cont}${SUBP}&location=wan&X-Plex-Client-Profile-Name=Generic&X-Plex-Client-Profile-Extra=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PEXTRA")&$COMMON"
  hr "DECISION proto=$proto container=$cont sub=${SUB:-none}"
  probe "decision" "$URL"
  grep -oE 'mdeDecisionText="[^"]*"|directPlayDecisionText="[^"]*"|transcodeDecisionText="[^"]*"|generalDecisionText="[^"]*"' /tmp/probe_body | head -4
  grep -oE '<Part [^>]*decision="[^"]*"[^>]*protocol="[^"]*"' /tmp/probe_body | head -2
  grep -oE 'decision="[^"]*"' /tmp/probe_body | sort | uniq -c
done

# ---- 2) START playlist (HLS mpegts) + check referenced segments exist ----
for combo in "mpegts" "mp4"; do
  SESS="${CID}_start_$combo"
  PEXTRA="append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&container=$combo&videoCodec=h264&audioCodec=aac)"
  SUBP=""
  [ -n "$SUB" ] && SUBP="&subtitles=burn&subtitleStreamID=$SUB&X-Plex-Subtitle-Stream=$SUB&subtitleSize=100&autoAdjustSubtitle=1"
  URL="$PLEX/video/:/transcode/universal/start.m3u8?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PATHKEY")&mediaIndex=0&partIndex=0&fastSeek=1&hasMDE=1&directPlay=0&directStream=0&directStreamAudio=0&maxVideoBitrate=8000&videoResolution=1920x1080&protocol=hls&session=$SESS&transcodeSessionId=$SESS&location=wan&X-Plex-Incomplete-Segments=1${SUBP}&X-Plex-Client-Profile-Name=Generic&X-Plex-Client-Profile-Extra=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PEXTRA")&$COMMON"
  hr "START.m3u8 hls container=$combo sub=${SUB:-none}"
  probe "start.m3u8" "$URL"
  echo "--- playlist head ---"; head -25 /tmp/probe_body
  # extract first media playlist if this is a master
  MEDIA=$(grep -vE '^#' /tmp/probe_body | head -1)
  if [ -n "$MEDIA" ]; then
    case "$MEDIA" in http*) MURL="$MEDIA";; /*) MURL="$PLEX$MEDIA";; *) MURL="$PLEX/video/:/transcode/universal/$MEDIA";; esac
    echo "--- media playlist: $MURL ---"
    curl -sk -m 25 "$MURL" -o /tmp/probe_media; head -25 /tmp/probe_media
    # check first init segment (#EXT-X-MAP) and first .ts segment reachability
    MAP=$(grep -oE 'URI="[^"]+"' /tmp/probe_media | head -1 | sed -E 's/URI="(.*)"/\1/')
    SEG=$(grep -vE '^#' /tmp/probe_media | head -1)
    [ -n "$MAP" ] && { case "$MAP" in http*) MAPU="$MAP";; /*) MAPU="$PLEX$MAP";; *) MAPU="$PLEX/video/:/transcode/universal/session/$SESS/$MAP";; esac; printf 'EXT-X-MAP init: '; curl -sk -m 20 -o /dev/null -w 'status=%{http_code} type=%{content_type} bytes=%{size_download}\n' "$MAPU&$COMMON"; }
    [ -n "$SEG" ] && { case "$SEG" in http*) SEGU="$SEG";; /*) SEGU="$PLEX$SEG";; *) SEGU="$PLEX/video/:/transcode/universal/session/$SESS/$SEG";; esac; printf 'first segment: '; curl -sk -m 30 -o /dev/null -w 'status=%{http_code} type=%{content_type} bytes=%{size_download}\n' "$SEGU&$COMMON"; }
  fi
done

# ---- 3) Progressive HTTP /start ----
SESS="${CID}_prog"
SUBP=""
[ -n "$SUB" ] && SUBP="&subtitles=burn&subtitleStreamID=$SUB&X-Plex-Subtitle-Stream=$SUB&subtitleSize=100&autoAdjustSubtitle=1"
URL="$PLEX/video/:/transcode/universal/start?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$PATHKEY")&mediaIndex=0&partIndex=0&fastSeek=1&hasMDE=1&directPlay=0&directStream=0&directStreamAudio=0&maxVideoBitrate=8000&videoResolution=1920x1080&protocol=http&session=$SESS&transcodeSessionId=$SESS&location=wan${SUBP}&X-Plex-Client-Profile-Name=Generic&$COMMON"
hr "PROGRESSIVE /start protocol=http sub=${SUB:-none}"
# only fetch first 256KB to see if it streams video
code=$(curl -sk -m 30 -r 0-262143 -o /tmp/probe_prog -w '%{http_code} %{content_type} %{size_download}' "$URL")
echo "first 256KB: $code"
printf 'magic: '; xxd /tmp/probe_prog 2>/dev/null | head -2
