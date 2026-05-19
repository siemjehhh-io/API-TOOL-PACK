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
    scp $tarFile "${VPS_USER}@${VPS_IP}:/tmp/deploy.tar.gz"
    ssh "${VPS_USER}@${VPS_IP}" "rm -rf ${REMOTE_PATH}/* && tar -xzf /tmp/deploy.tar.gz -C ${REMOTE_PATH} && rm /tmp/deploy.tar.gz"
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
