#!/usr/bin/env bash
# Installs one release of Aapadbandhu AI and switches traffic to it atomically.
# Usage (as root): bash remote-install.sh /tmp/aapadbandhu-<ts>.tgz <ts>
# On a failed health check it switches back to the previous release.
set -euo pipefail
TGZ="$1"
TS="$2"
BASE=/srv/projects/aapadbandhu
REL="$BASE/releases/$TS"
PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"

mkdir -p "$REL"
tar -xzf "$TGZ" -C "$REL"
rm -f "$TGZ"

cd "$REL/server"
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
else
  npm install --omit=dev --no-audit --no-fund --loglevel=error
fi
rm -rf "$REL/server/data"
ln -sfn "$BASE/shared/data" "$REL/server/data"
ln -sfn "$BASE/shared/.env" "$REL/.env"
chown -R aapadbandhu:aapadbandhu "$REL"

ln -sfn "$REL" "$BASE/current.new"
mv -Tf "$BASE/current.new" "$BASE/current"
systemctl restart aapadbandhu

ok=0
for _ in $(seq 1 40); do
  if curl -fsS -m 3 http://127.0.0.1:4200/api/health >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
if [ "$ok" != 1 ]; then
  echo "HEALTH CHECK FAILED for $TS"
  journalctl -u aapadbandhu -n 40 --no-pager || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$BASE/current.new" && mv -Tf "$BASE/current.new" "$BASE/current"
    systemctl restart aapadbandhu
    echo "rolled back to $(basename "$PREV")"
  fi
  exit 1
fi

echo "health: $(curl -fsS -m 3 http://127.0.0.1:4200/api/health)"
ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r rm -rf
echo "release $TS live"
echo "voxera units: $(systemctl is-active voxera voxera-voice voxera-live voxera-worker | tr '\n' ' ')"
