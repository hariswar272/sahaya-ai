#!/usr/bin/env bash
# One-time, idempotent setup for Aapadbandhu AI on the Mumbai VPS (run as root).
# It touches only: user `aapadbandhu`, /srv/projects/aapadbandhu, its systemd unit,
# its nginx site + snippet, and one row in /srv/projects/README.md.
# Voxera, Just We and talk are never modified.
set -euo pipefail
BASE=/srv/projects/aapadbandhu
SRC=/tmp/aapadbandhu-setup

id aapadbandhu >/dev/null 2>&1 || useradd --system --home-dir "$BASE" --shell /usr/sbin/nologin aapadbandhu
mkdir -p "$BASE/releases" "$BASE/shared/data" "$BASE/shared/download"

# Secrets are assembled here on the server and never printed: the Sarvam key is
# read (read-only) from Voxera's env; nothing of Voxera's is changed.
if [ ! -s "$BASE/shared/.env" ]; then
  ( umask 077
    grep -E '^(SARVAM_API_KEY|VOICE_SPEAKER)=' /srv/projects/voxera/app/.env.local > "$BASE/shared/.env"
    printf 'PORT=4200\nHOST=127.0.0.1\nNODE_ENV=production\n' >> "$BASE/shared/.env" )
fi
install -m 644 "$SRC/SERVER-README.md" "$BASE/README.md"
chown -R aapadbandhu:aapadbandhu "$BASE"
# 711: nginx may traverse to shared/download (the APK) but cannot list anything;
# data stays private to the service user and the env file to its owner.
chmod 711 "$BASE" "$BASE/shared"
chmod 750 "$BASE/shared/data"
chmod 755 "$BASE/shared/download"
chmod 600 "$BASE/shared/.env"
echo "env keys: $(cut -d= -f1 "$BASE/shared/.env" | tr '\n' ' ')"

install -m 644 "$SRC/aapadbandhu.service" /etc/systemd/system/aapadbandhu.service
systemctl daemon-reload
systemctl enable aapadbandhu >/dev/null 2>&1 || true

# nginx: HTTP-only until the certificate exists, then HTTPS + redirect.
install -m 644 "$SRC/nginx-proxy.conf" /etc/nginx/snippets/aapadbandhu-proxy.conf
if [ -s /etc/letsencrypt/live/sahaya.hmgenx.in/fullchain.pem ] && [ -s /etc/letsencrypt/live/aapadbandhu.hmgenx.in/fullchain.pem ]; then
  install -m 644 "$SRC/nginx-https.conf" /etc/nginx/sites-available/aapadbandhu
else
  install -m 644 "$SRC/nginx-http.conf" /etc/nginx/sites-available/aapadbandhu
fi
ln -sfn /etc/nginx/sites-available/aapadbandhu /etc/nginx/sites-enabled/aapadbandhu
if ! nginx -t 2>&1; then
  rm -f /etc/nginx/sites-enabled/aapadbandhu
  echo "nginx -t failed: aapadbandhu site disabled, nothing reloaded"
  exit 1
fi
systemctl reload nginx

# One row in the projects index (added once, kept current).
ROW='| aapadbandhu/ | Sahaya AI (built as Aapadbandhu AI) — Telugu public-help platform (SOS, health, farmer, scam); hackathon 2026-10-14 | 4200 | sahaya.hmgenx.in (aapadbandhu.hmgenx.in redirects) |'
if grep -q '^| aapadbandhu/' /srv/projects/README.md; then
  awk -v row="$ROW" '/^\| aapadbandhu\//{print row; next} {print}' /srv/projects/README.md > /tmp/projects-readme.$$
  cat /tmp/projects-readme.$$ > /srv/projects/README.md && rm -f /tmp/projects-readme.$$
else
  cp /srv/projects/README.md /srv/projects/README.md.before-aapadbandhu
  awk -v row="$ROW" '{print} /^\| justwe\//{print row}' /srv/projects/README.md > /tmp/projects-readme.$$
  cat /tmp/projects-readme.$$ > /srv/projects/README.md && rm -f /tmp/projects-readme.$$
fi

echo "voxera units: $(systemctl is-active voxera voxera-voice voxera-live voxera-worker | tr '\n' ' ')"
echo "voxera https: $(curl -sI https://voxera.hmgenx.in | head -1)"
