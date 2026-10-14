# aapadbandhu/ — Sahaya AI (built as Aapadbandhu AI)

Telugu-first public-help platform (Disaster SOS, Arogya Call, Rythu Call, Scam Shield),
built for a college AI hackathon on 2026-10-14.

| What | Where |
|---|---|
| Web address | https://sahaya.hmgenx.in (aapadbandhu.hmgenx.in → 301) |
| Linux user | `aapadbandhu` (nologin) |
| Service | `aapadbandhu.service` → `node server/index.mjs` on 127.0.0.1:4200 |
| Code | `current/` → `releases/<timestamp>/` (last 3 kept) |
| Secrets | `shared/.env` (600; Sarvam key copied server-side from Voxera, optional GEMINI_*) |
| Data | `shared/data/` (JSON, symlinked into each release as `server/data`) |
| nginx | `/etc/nginx/sites-available/aapadbandhu` + `/etc/nginx/snippets/aapadbandhu-proxy.conf` |
| TLS | Let's Encrypt `sahaya.hmgenx.in` + `aapadbandhu.hmgenx.in` (webroot /var/www/html, reload hook) |

Deploy from the laptop: `pwsh Desktop\aapadbandhu\deploy\deploy.ps1` (see deploy/README.md there).
Logs: `journalctl -u aapadbandhu -f`. Nothing here is shared with voxera / justwe / talk.
