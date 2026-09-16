#!/usr/bin/env bash
set -euo pipefail

profile_dir="${ECAC_BROWSER_PROFILE_DIR:-/app/data/ecac-browser-profile}"
mkdir -p "$profile_dir"
rm -f "$profile_dir/SingletonLock" "$profile_dir/SingletonCookie" "$profile_dir/SingletonSocket"

exec xvfb-run -a -s "-screen 0 1600x900x24 -ac -noreset" bash -c '
  set -euo pipefail
  fluxbox >/tmp/fluxbox.log 2>&1 &
  x11vnc -display "$DISPLAY" -forever -shared -localhost -rfbport 5900 -nopw >/tmp/x11vnc.log 2>&1 &
  websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/novnc.log 2>&1 &
  node /usr/local/lib/cdp-proxy.mjs &
  exec node dist/src/session-server.js
'
