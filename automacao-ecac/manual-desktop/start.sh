#!/usr/bin/env bash
set -euo pipefail
umask 077

# Single operator desktop; its home volume must not be shared with another Chrome.
nss_dir=/home/operator/.pki/nssdb
profile_dir=/home/operator/.config/google-chrome
mkdir -p "$nss_dir" "$profile_dir" /home/operator/Downloads
if [[ ! -f "$nss_dir/cert9.db" ]]; then
  certutil -N -d "sql:$nss_dir" --empty-password
fi
certificate_hash=$(sha256sum /run/secrets/certificate.pfx | cut -d ' ' -f1)
stored_hash=$(cat "$nss_dir/.certificate-hash" 2>/dev/null || true)
if [[ "$certificate_hash" != "$stored_hash" ]]; then
  pk12util -i /run/secrets/certificate.pfx -d "sql:$nss_dir" -w /run/secrets/passphrase
  printf '%s\n' "$certificate_hash" > "$nss_dir/.certificate-hash"
fi

# A stopped/recreated container leaves Chrome's singleton links in the volume.
rm -f "$profile_dir/SingletonLock" "$profile_dir/SingletonCookie" "$profile_dir/SingletonSocket"
exec xvfb-run -a -s '-screen 0 1280x800x24 -ac -noreset -nolisten tcp' bash -c '
  set -euo pipefail
  fluxbox >/tmp/manual-window-manager.log 2>&1 &
  x11vnc -display "$DISPLAY" -forever -shared -localhost -rfbport 5900 -nopw -noxdamage >/tmp/manual-vnc.log 2>&1 &
  websockify --web=/usr/share/novnc 6080 localhost:5900 >/tmp/manual-websocket.log 2>&1 &
  exec dbus-run-session -- google-chrome-stable \
    --no-sandbox --no-first-run --no-default-browser-check \
    --lang=pt-BR --window-position=0,0 --window-size=1280,760 \
    https://cav.receita.fazenda.gov.br/autenticacao/login
'
