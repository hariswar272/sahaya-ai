<#
.SYNOPSIS
  Build and ship Sahaya AI to https://sahaya.hmgenx.in (Hostinger Mumbai VPS).
.EXAMPLE
  pwsh deploy\deploy.ps1                         # build web, upload, install, switch, health-check
  pwsh deploy\deploy.ps1 -SkipBuild              # reuse the existing web/dist
  pwsh deploy\deploy.ps1 -GeminiFromLocalEnv     # also copy GEMINI_* lines from the local .env (values never shown)
  pwsh deploy\deploy.ps1 -PhoneFromLocalEnv      # also copy SAMVAAD_* / PHONE_* / PUBLIC_URL lines (values never shown)
  pwsh deploy\deploy.ps1 -PhoneFromLocalEnv -EnvOnly   # only copy those env lines + restart + health check
  pwsh deploy\deploy.ps1 -SetupOnly              # re-run the idempotent server setup (+ HTTPS once DNS is live)
#>
param([switch]$GeminiFromLocalEnv, [switch]$PhoneFromLocalEnv, [switch]$EnvOnly, [switch]$SkipBuild, [switch]$SetupOnly, [switch]$PlaceholderWeb)
# -PlaceholderWeb: ship a one-line holding page when web/dist doesn't exist yet (pipeline test).
$ErrorActionPreference = "Stop"
$Deploy = $PSScriptRoot
$Root = Split-Path -Parent $Deploy
$Key = Join-Path $env:USERPROFILE ".ssh\swaram_server"
$Server = "root@187.126.115.132"
$Domain = "sahaya.hmgenx.in"   # aapadbandhu.hmgenx.in 301s here
$SshOpts = @("-i", $Key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")

function Step([string]$m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Remote([string]$cmd) {
  & ssh @SshOpts $Server $cmd
  if ($LASTEXITCODE -ne 0) { throw "remote command failed ($LASTEXITCODE): $cmd" }
}
function Test-Dns {
  try { $null = Resolve-DnsName $Domain -Type A -DnsOnly -ErrorAction Stop; return $true } catch { return $false }
}

# Setup files go up every time so the server copy never drifts from this folder.
# bash on the server needs LF line endings.
$setupFiles = "server-setup.sh", "enable-https.sh", "remote-install.sh", "nginx-proxy.conf", "nginx-http.conf", "nginx-https.conf", "aapadbandhu.service", "SERVER-README.md"
foreach ($f in $setupFiles) {
  $p = Join-Path $Deploy $f
  $t = [IO.File]::ReadAllText($p)
  if ($t.Contains("`r")) { [IO.File]::WriteAllText($p, ($t -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false)) }
}
Remote "mkdir -p /tmp/aapadbandhu-setup"
& scp -q @SshOpts ($setupFiles | ForEach-Object { Join-Path $Deploy $_ }) "${Server}:/tmp/aapadbandhu-setup/"
if ($LASTEXITCODE -ne 0) { throw "upload of setup files failed" }

if ($SetupOnly) {
  Step "Server setup (idempotent)"
  Remote "bash /tmp/aapadbandhu-setup/server-setup.sh"
}

# Copies only the local .env lines matching $pattern into shared/.env, replacing the same
# keys and keeping everything else. Values travel over ssh stdin and are never printed.
function Copy-EnvLines([string]$pattern, [string]$label) {
  $lines = @(Get-Content (Join-Path $Root ".env") | ForEach-Object { $_.Trim() } | Where-Object { $_ -match $pattern })
  if (-not $lines.Count) { Write-Warning "No $label lines in the local .env; skipped"; return $false }
  $names = ($lines | ForEach-Object { ($_ -split '=', 2)[0] }) -join ', '
  Step "Copying $($lines.Count) env line(s) to the server: $names (values not shown)"
  (($lines -join "`n") + "`n") | & ssh @SshOpts $Server 'f=/srv/projects/aapadbandhu/shared/.env; t=$(mktemp); n=$(mktemp); tr -d "\r" | grep -v "^$" > "$n"; cut -d= -f1 "$n" | sed "s/^/^/; s/$/=/" > "$n.keys"; grep -v -f "$n.keys" "$f" > "$t" || true; cat "$n" >> "$t"; install -m 600 -o aapadbandhu -g aapadbandhu "$t" "$f"; rm -f "$t" "$n" "$n.keys"'
  if ($LASTEXITCODE -ne 0) { throw "$label env copy failed" }
  return $true
}

$envChanged = $false
if ($GeminiFromLocalEnv) { if (Copy-EnvLines '^GEMINI_[A-Z0-9_]*\s*=' "GEMINI_*") { $envChanged = $true } }
if ($PhoneFromLocalEnv) { if (Copy-EnvLines '^(SAMVAAD_[A-Z0-9_]+|PHONE_[A-Z0-9_]+|PUBLIC_URL)\s*=' "SAMVAAD_*/PHONE_*/PUBLIC_URL") { $envChanged = $true } }

if ($EnvOnly) {
  if ($envChanged) {
    Step "Restarting aapadbandhu so the new env applies"
    Remote 'systemctl restart aapadbandhu; for i in $(seq 1 40); do curl -fsS -m 3 http://127.0.0.1:4200/api/health >/dev/null 2>&1 && break; sleep 1; done; curl -fsS -m 3 http://127.0.0.1:4200/api/health; echo; echo "env keys: $(cut -d= -f1 /srv/projects/aapadbandhu/shared/.env | tr "\n" " ")"'
  }
  return
}

if (-not $SetupOnly) {
  if (-not $SkipBuild) {
    Step "Building web"
    Push-Location (Join-Path $Root "web")
    try {
      if (-not (Test-Path node_modules)) {
        if (Test-Path package-lock.json) { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
        if ($LASTEXITCODE -ne 0) { throw "npm install in web failed" }
      }
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "web build failed" }
    } finally { Pop-Location }
  }
  $haveDist = Test-Path (Join-Path $Root "web\dist\index.html")
  if (-not $haveDist -and -not $PlaceholderWeb) { throw "web/dist/index.html is missing; build the web app first" }
  if (-not (Test-Path (Join-Path $Root "server\index.mjs"))) { throw "server/index.mjs is missing" }

  Step "Packing"
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $stage = Join-Path $env:TEMP "aapadbandhu-stage-$ts"
  New-Item -ItemType Directory -Force $stage | Out-Null
  robocopy (Join-Path $Root "server") (Join-Path $stage "server") /E /XD (Join-Path $Root "server\node_modules") (Join-Path $Root "server\data") /XF .env *.log /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "copying server/ failed" }
  if ($haveDist) {
    robocopy (Join-Path $Root "web\dist") (Join-Path $stage "web\dist") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copying web/dist failed" }
  } else {
    New-Item -ItemType Directory -Force (Join-Path $stage "web\dist") | Out-Null
    Set-Content (Join-Path $stage "web\dist\index.html") '<!doctype html><meta charset="utf-8"><title>Aapadbandhu AI</title><p style="font-family:sans-serif;padding:2rem">Aapadbandhu AI: deploying, back in a minute.</p>' -Encoding utf8
  }
  foreach ($f in "package.json", "package-lock.json") { $p = Join-Path $Root $f; if (Test-Path $p) { Copy-Item $p $stage } }
  $tgz = Join-Path $env:TEMP "aapadbandhu-$ts.tgz"
  tar.exe -czf $tgz -C $stage .
  if ($LASTEXITCODE -ne 0) { throw "tar failed" }

  Step ("Uploading {0:N1} MB" -f ((Get-Item $tgz).Length / 1MB))
  & scp -q @SshOpts $tgz "${Server}:/tmp/aapadbandhu-$ts.tgz"
  if ($LASTEXITCODE -ne 0) { throw "upload failed" }

  Step "Installing release $ts (health-checked, rolls back on failure)"
  Remote "bash /tmp/aapadbandhu-setup/remote-install.sh /tmp/aapadbandhu-$ts.tgz $ts"
  Remove-Item -Recurse -Force $stage, $tgz -ErrorAction SilentlyContinue
}

# HTTPS: issue the certificate the first time DNS answers.
$hasCert = ((& ssh @SshOpts $Server "test -s /etc/letsencrypt/live/$Domain/fullchain.pem && echo yes || echo no") | Out-String).Trim() -eq "yes"
if (-not $hasCert) {
  if (Test-Dns) {
    Step "DNS is live: issuing the certificate"
    Remote "bash /tmp/aapadbandhu-setup/enable-https.sh"
    $hasCert = $true
  } else {
    Write-Warning "$Domain does not resolve yet. Add the A record sahaya -> 187.126.115.132 in hPanel, then run: pwsh deploy\deploy.ps1 -SetupOnly"
  }
}

if ($hasCert) {
  try {
    $h = Invoke-RestMethod "https://$Domain/api/health" -TimeoutSec 20
    Step ("Public health: " + ($h | ConvertTo-Json -Compress))
  } catch {
    # This laptop may still hold a cached NXDOMAIN from before the record existed.
    Step "Public health (pinned to the server IP; local DNS cache is stale):"
    & curl.exe -s -m 20 --resolve "${Domain}:443:187.126.115.132" "https://$Domain/api/health"
    Write-Host ""
  }
} else {
  Step "HTTP smoke test via Host header (DNS not live yet):"
  & curl.exe -s -m 15 -H "Host: $Domain" "http://187.126.115.132/api/health"
  Write-Host ""
}
Step ("Voxera: " + ((& curl.exe -sI -m 15 https://voxera.hmgenx.in | Select-Object -First 1) -join ""))
if ($hasCert) { Write-Host "`nLive: https://$Domain" -ForegroundColor Green } else { Write-Host "`nDeployed; public URL waits for DNS: https://$Domain" -ForegroundColor Yellow }
