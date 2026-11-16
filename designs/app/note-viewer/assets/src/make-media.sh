#!/usr/bin/env bash
# Rebuilds the synthetic demo media in ../media from slides.html.
# Needs Google Chrome (headless screenshots) and ffmpeg. Output is silent.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../media"
work="$(mktemp -d)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

shot() { # clip index width height file
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --mute-audio \
    --user-data-dir="$work/profile" --window-size="$3,$4" \
    --screenshot="$5" "file://$here/slides.html?clip=$1&i=$2" >/dev/null 2>&1
}

video() { # clip slides width height
  local clip=$1 n=$2 w=$3 h=$4 dur=3 fade=0.4 inputs=() chain="" prev="[0:v]"
  for ((i = 0; i < n; i++)); do
    shot "$clip" "$i" "$w" "$h" "$work/$clip-$i.png"
    inputs+=(-loop 1 -t "$dur" -framerate 30 -i "$work/$clip-$i.png")
  done
  for ((i = 1; i < n; i++)); do
    local offset
    offset=$(echo "$i * ($dur - $fade)" | bc)
    chain+="${prev}[$i:v]xfade=transition=fade:duration=$fade:offset=$offset[v$i];"
    prev="[v$i]"
  done
  chain+="${prev}format=yuv420p[out]"
  ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$chain" -map "[out]" \
    -an -c:v libx264 -crf 30 -preset slow -movflags +faststart "$out/$clip.mp4"
  ffmpeg -y -loglevel error -i "$work/$clip-0.png" -q:v 4 "$out/$clip-poster.jpg"
}

video skip 6 540 960
video oneone 5 540 960
video own 5 540 960
video sourdough 4 960 540
for i in 0 1 2 3; do
  shot lisbon "$i" 540 675 "$work/lisbon-$i.png"
  ffmpeg -y -loglevel error -i "$work/lisbon-$i.png" -q:v 4 "$out/lisbon-$((i + 1)).jpg"
done
ls -la "$out"
