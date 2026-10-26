#!/usr/bin/env bash
# Captures the review screenshots from the local review server.
# Usage: ./capture-screens.sh [base-url]   (default http://127.0.0.1:5247)
set -euo pipefail
base="${1:-http://127.0.0.1:5247}"
out="$(cd "$(dirname "$0")/../.." && pwd)/screenshots"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT
mkdir -p "$out"

shot() { # name width height path
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --mute-audio --user-data-dir="$profile" \
    --window-size="$2,$3" --virtual-time-budget=4000 --screenshot="$out/$1.png" "$base/$4&bar=0" >/dev/null 2>&1
  echo "$1.png"
}

# Desktop 1360x1000
shot desktop-0-ask-before          1360 1000 'modal.html?ctx=ask'
shot desktop-b-modal-ask-portrait  1360 1000 'modal.html?ctx=ask&open=skip'
shot desktop-b-modal-transcript    1360 1000 'modal.html?ctx=ask&open=skip&tab=text'
shot desktop-b-modal-inbox-photos  1360 1000 'modal.html?ctx=inbox&open=lisbon'
shot desktop-b-modal-inbox-landscape 1360 1000 'modal.html?ctx=inbox&open=sourdough'
shot desktop-b-modal-inbox-text    1360 1000 'modal.html?ctx=inbox&open=update'
shot desktop-a-panel-ask-portrait  1360 1000 'side-panel.html?ctx=ask&open=skip'
shot desktop-a-panel-inbox-photos  1360 1000 'side-panel.html?ctx=inbox&open=lisbon'
shot desktop-a-panel-inbox-landscape 1360 1000 'side-panel.html?ctx=inbox&open=sourdough'
shot desktop-a-panel-inbox-text    1360 1000 'side-panel.html?ctx=inbox&open=update'
# Mobile 390x844 shots are taken in a real browser: headless Chrome cannot render a viewport narrower than ~500px.
