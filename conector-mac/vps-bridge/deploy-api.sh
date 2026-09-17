#!/bin/bash
# Expõe a ponte FS em api.fssolucoestributarias.com.br (só /zapi, TLS via Coolify/Traefik)
# e registra o webhook de recebimento na Z-API. Não imprime segredos.
cd /opt/fs-mac-bridge || exit 1
grep -q "^WEBHOOK_TOKEN=" bridge.env || echo "WEBHOOK_TOKEN=$(openssl rand -hex 24)" >> bridge.env
if grep -q "^BRIDGE_HOST=" bridge.env; then sed -i "s/^BRIDGE_HOST=.*/BRIDGE_HOST=0.0.0.0/" bridge.env; else echo "BRIDGE_HOST=0.0.0.0" >> bridge.env; fi
docker rm -f fs-mac-bridge 2>/dev/null || true
docker run -d --name fs-mac-bridge --restart unless-stopped \
  --network coolify -p 127.0.0.1:18790:18790 \
  -v /opt/fs-mac-bridge:/app --env-file /opt/fs-mac-bridge/bridge.env \
  --label traefik.enable=true --label traefik.docker.network=coolify \
  --label 'traefik.http.routers.fsapi.rule=Host(`api.fssolucoestributarias.com.br`) && PathPrefix(`/zapi`)' \
  --label traefik.http.routers.fsapi.entrypoints=https \
  --label traefik.http.routers.fsapi.tls=true \
  --label traefik.http.routers.fsapi.tls.certresolver=letsencrypt \
  --label traefik.http.services.fsapi.loadbalancer.server.port=18790 \
  --label 'traefik.http.routers.fsapi-http.rule=Host(`api.fssolucoestributarias.com.br`) && PathPrefix(`/zapi`)' \
  --label traefik.http.routers.fsapi-http.entrypoints=http \
  --label traefik.http.routers.fsapi-http.middlewares=fsapi-redir \
  --label traefik.http.middlewares.fsapi-redir.redirectscheme.scheme=https \
  node:24-alpine node /app/bridge.mjs
echo "container: $(docker ps --filter name=fs-mac-bridge --format '{{.Status}}')"
sleep 6
echo "== logs =="; docker logs --tail 4 fs-mac-bridge 2>&1
set -a; . /opt/fs-mac-bridge/bridge.env; set +a
resp=$(curl -s -m 20 -X PUT -H "Client-Token: $ZAPI_CLIENT_TOKEN" -H "content-type: application/json" \
  -d "{\"value\":\"https://api.fssolucoestributarias.com.br/zapi/$WEBHOOK_TOKEN\"}" \
  "$ZAPI_BASE_URL/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_INSTANCE_TOKEN/update-webhook-received")
if echo "$resp" | grep -qi error; then echo "Z-API: FALHOU"; else echo "Z-API: webhook registrado OK"; fi
echo "FIM"
