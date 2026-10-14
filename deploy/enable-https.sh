#!/usr/bin/env bash
# Issues the certificates (webroot, same as voxera) and switches the site to HTTPS:
# sahaya.hmgenx.in serves the app, aapadbandhu.hmgenx.in 301s to it.
# Safe to re-run. Falls back to the HTTP-only site if the HTTPS config fails nginx -t.
set -euo pipefail
SRC=/tmp/aapadbandhu-setup
for d in sahaya.hmgenx.in aapadbandhu.hmgenx.in; do
  certbot certonly --webroot -w /var/www/html -d "$d" \
    --non-interactive --agree-tos --keep-until-expiring \
    --deploy-hook "systemctl reload nginx"
done
install -m 644 "$SRC/nginx-https.conf" /etc/nginx/sites-available/aapadbandhu
if ! nginx -t 2>&1; then
  install -m 644 "$SRC/nginx-http.conf" /etc/nginx/sites-available/aapadbandhu
  nginx -t && systemctl reload nginx
  echo "HTTPS config failed nginx -t; reverted to HTTP-only"
  exit 1
fi
systemctl reload nginx
echo "https enabled"
echo "voxera units: $(systemctl is-active voxera voxera-voice voxera-live voxera-worker | tr '\n' ' ')"
echo "voxera https: $(curl -sI https://voxera.hmgenx.in | head -1)"
