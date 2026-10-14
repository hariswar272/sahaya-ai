# Deploy: Sahaya AI → https://sahaya.hmgenx.in (aapadbandhu.hmgenx.in 301s here)

Hostinger Mumbai VPS `187.126.115.132` (Ubuntu 24.04), root by key `~/.ssh/swaram_server`.
It shares the box with Voxera (production), Just We and talk. Nothing in this folder touches them:
the app has its own user, folder, systemd unit, nginx site file and certificate.

## Every deploy (from Windows PowerShell, repo root)

```powershell
pwsh deploy\deploy.ps1                       # build web → pack → upload → install → switch → health check
pwsh deploy\deploy.ps1 -SkipBuild            # reuse web/dist
pwsh deploy\deploy.ps1 -GeminiFromLocalEnv   # also copy GEMINI_* lines from the local .env (values never printed)
pwsh deploy\deploy.ps1 -SetupOnly            # idempotent server setup + issue HTTPS once DNS answers
```

What `deploy.ps1` does:
1. `npm run build` in `web/` (installs deps first if `node_modules` is missing).
2. Packs `server/` (without node_modules and data) + `web/dist` into a tarball and uploads it.
3. On the server, `remote-install.sh`:
   - extracts to `releases/<ts>` and runs `npm ci --omit=dev`
   - symlinks `server/data → shared/data` and `.env → shared/.env`
   - atomically switches `current`, restarts `aapadbandhu`, and polls `/api/health`
   - rolls back to the previous release if the health check fails; keeps the last 3 releases
4. Issues the Let's Encrypt certificate the first time DNS resolves (`enable-https.sh`, webroot `/var/www/html`, nginx reload hook).

## Server layout

| Thing | Path |
|---|---|
| Code | `/srv/projects/aapadbandhu/current → releases/<ts>` |
| Secrets | `/srv/projects/aapadbandhu/shared/.env` (600). Sarvam key copied server-side from Voxera's env, plus PORT/HOST/NODE_ENV and optional GEMINI_* |
| Data | `/srv/projects/aapadbandhu/shared/data` |
| Service | `aapadbandhu.service` (User=aapadbandhu, 127.0.0.1:4200, CPUWeight=50, MemoryMax=768M) |
| nginx | `/etc/nginx/sites-available/aapadbandhu` + `/etc/nginx/snippets/aapadbandhu-proxy.conf` (SSE unbuffered at `/api/stream`) |

Logs: `ssh -i ~/.ssh/swaram_server root@187.126.115.132 journalctl -u aapadbandhu -f`

## Files here
- `server-setup.sh`: one-time, idempotent: user, folders, env, unit, nginx (HTTP until the cert exists), projects README row
- `enable-https.sh`: certbot webroot + HTTPS site (reverts to HTTP-only if `nginx -t` fails)
- `remote-install.sh`: per-release install with rollback
- `nginx-*.conf`, `aapadbandhu.service`, `SERVER-README.md`: the exact files installed on the server
