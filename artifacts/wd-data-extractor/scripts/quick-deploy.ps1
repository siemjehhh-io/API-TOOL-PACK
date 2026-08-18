#!/usr/bin/env pwsh
# ============================================================
# Quick Deploy - Build + Sync ke VPS
# Usage: .\scripts\quick-deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$VPS_IP       = "52.184.18.93"
$VPS_USER     = "kuyaba"
$REMOTE_PATH  = "/home/kuyaba/qris-tool"
$LOCAL_BUILD  = "dist/public"
$DOMAIN       = "https://apitool.gwk.web.id"
$REPO_ROOT    = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$USER_DEPLOY_KEY = Join-Path $env:USERPROFILE ".ssh\apitool_deploy_ed25519"
$SSH_OPTS     = @("-o", "StrictHostKeyChecking=no")

if (Test-Path $USER_DEPLOY_KEY) {
    $SSH_OPTS += @("-i", $USER_DEPLOY_KEY)
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  QUICK DEPLOY -> $DOMAIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Build ---
Write-Host "`n[1/4] Building..." -ForegroundColor Yellow
$env:PORT = "3000"
$env:BASE_PATH = "/"
corepack pnpm build
if ($LASTEXITCODE -ne 0) { Write-Error "Build gagal!"; exit 1 }
Write-Host "Build sukses." -ForegroundColor Green

# --- 2. Archive ---
Write-Host "`n[2/4] Creating archive..." -ForegroundColor Yellow
$tarFile = "deploy.tar.gz"
if (Test-Path $tarFile) { Remove-Item $tarFile -Force }
tar -czf $tarFile -C $LOCAL_BUILD .
if (-not (Test-Path $tarFile)) { Write-Error "Gagal membuat archive."; exit 1 }
Write-Host "Archive created ($tarFile)." -ForegroundColor Green

# --- 3. Upload + Extract ---
Write-Host "`n[3/4] Uploading to VPS..." -ForegroundColor Yellow
try {
    $preflightOutput = ssh @SSH_OPTS "${VPS_USER}@${VPS_IP}" "mkdir -p ${REMOTE_PATH} && test -w ${REMOTE_PATH} && test -x ${REMOTE_PATH}" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $preflightText = ($preflightOutput | Out-String).Trim()
        if ($preflightText -match "Permission denied|Connection refused|Connection timed out|Could not resolve|No route to host|connect to host") {
            Write-Error "SSH ke VPS gagal: ${preflightText}"
            exit 1
        }
        Write-Error "Folder remote tidak writable oleh user ${VPS_USER}. Jalankan: ssh ${VPS_USER}@${VPS_IP} `"sudo chown -R ${VPS_USER}:${VPS_USER} ${REMOTE_PATH} && chmod -R u+rwX ${REMOTE_PATH}`""
        exit 1
    }

    scp @SSH_OPTS $tarFile "${VPS_USER}@${VPS_IP}:/tmp/deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { Write-Error "Upload SCP gagal."; exit 1 }

    ssh @SSH_OPTS "${VPS_USER}@${VPS_IP}" "find ${REMOTE_PATH} -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /tmp/deploy.tar.gz -C ${REMOTE_PATH} && rm /tmp/deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { Write-Error "Extract remote gagal."; exit 1 }

    Write-Host "Upload & extract sukses." -ForegroundColor Green
}
finally {
    if (Test-Path $tarFile) { Remove-Item $tarFile -Force }
}

# --- 4. Verify ---
Write-Host "`n[4/4] Verifying..." -ForegroundColor Yellow
$status = curl.exe -s -o NUL -w "%{http_code}" --max-time 15 $DOMAIN 2>$null
if ($status -eq "200") {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  DEPLOY SUKSES!" -ForegroundColor Green
    Write-Host "  Live: $DOMAIN" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "`n========================================" -ForegroundColor Yellow
    Write-Host "  Upload sukses, tapi verify return: $status" -ForegroundColor Yellow
    Write-Host "  Cek manual: $DOMAIN" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
}
