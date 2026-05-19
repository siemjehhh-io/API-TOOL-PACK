#!/usr/bin/env pwsh
# ============================================================
# Deploy Script - WD Data Extractor ke VPS
# Usage: cd ke project folder, lalu jalankan:
#   .\scripts\deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# --- Konfigurasi ---
$VPS_IP       = "5.184.18.93"
$VPS_USER     = "kuyaba"
$REMOTE_PATH  = "/home/kuyaba/qris-tool"   # folder di VPS (bisa diubah)
$LOCAL_BUILD  = "dist/public"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY QRIS HOKI TOOL KE VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- 1. Cek & Generate SSH Key ---
$sshKey = "$env:USERPROFILE\.ssh\id_ed25519"
$sshPub = "$env:USERPROFILE\.ssh\id_ed25519.pub"

if (-not (Test-Path $sshKey)) {
    Write-Host "`n[1/5] SSH Key belum ada. Membuat baru..." -ForegroundColor Yellow
    ssh-keygen -t ed25519 -f $sshKey -N '""' -C "deploy-key"
    Write-Host "SSH key dibuat di $sshKey" -ForegroundColor Green
} else {
    Write-Host "`n[1/5] SSH Key ditemukan." -ForegroundColor Green
}

# --- 2. Copy Public Key ke VPS (kalau belum) ---
Write-Host "`n[2/5] Mengecek koneksi SSH ke VPS..." -ForegroundColor Cyan
$sshTest = ssh -o BatchMode=yes -o ConnectTimeout=5 "$VPS_USER@$VPS_IP" "echo OK" 2>$null

if ($sshTest -ne "OK") {
    Write-Host "Belum bisa login tanpa password." -ForegroundColor Yellow
    Write-Host "Meng-copy public key ke VPS. Masukkan password VPS kamu sekali:" -ForegroundColor Yellow
    Get-Content $sshPub | ssh "$VPS_USER@$VPS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    Write-Host "SSH key berhasil dipasang!" -ForegroundColor Green
} else {
    Write-Host "SSH key sudah aktif (login tanpa password)." -ForegroundColor Green
}

# --- 3. Build Project ---
Write-Host "`n[3/5] Building project..." -ForegroundColor Cyan
$env:PORT = "3000"
$env:BASE_PATH = "/"
$corepack = Get-Command corepack -ErrorAction SilentlyContinue
if (-not $corepack) {
    Write-Error "corepack tidak ditemukan. Pastikan Node.js terinstall."
    exit 1
}

corepack pnpm install
if ($LASTEXITCODE -ne 0) { exit 1 }

corepack pnpm build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build gagal! Periksa error di atas."
    exit 1
}

if (-not (Test-Path $LOCAL_BUILD)) {
    Write-Error "Folder build '$LOCAL_BUILD' tidak ditemukan."
    exit 1
}

Write-Host "Build sukses! Folder: $LOCAL_BUILD" -ForegroundColor Green

# --- 4. Setup folder di VPS ---
Write-Host "`n[4/5] Menyiapkan folder di VPS..." -ForegroundColor Cyan
ssh "$VPS_USER@$VPS_IP" "mkdir -p $REMOTE_PATH && rm -rf $REMOTE_PATH/*"

# --- 5. Deploy dengan tar (paling aman & cepat) ---
Write-Host "`n[5/5] Uploading files ke VPS..." -ForegroundColor Cyan
$tarFile = "deploy.tar.gz"

try {
    # Buat archive
    tar -czf $tarFile -C $LOCAL_BUILD .
    if (-not (Test-Path $tarFile)) {
        Write-Error "Gagal membuat archive."
        exit 1
    }

    # Upload & extract
    scp $tarFile "$VPS_USER@${VPS_IP}:/tmp/"
    ssh "$VPS_USER@$VPS_IP" "tar -xzf /tmp/$tarFile -C $REMOTE_PATH && rm /tmp/$tarFile"

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  DEPLOY SUKSES!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "File berada di: $VPS_USER@${VPS_IP}:$REMOTE_PATH" -ForegroundColor White
    Write-Host "`nCATATAN PENTING:" -ForegroundColor Yellow
    Write-Host "Kamu perlu web server untuk serve folder ini." -ForegroundColor Yellow
    Write-Host "Pilih salah satu:" -ForegroundColor Yellow
    Write-Host "  1. Nginx   (production, recommended)" -ForegroundColor White
    Write-Host "  2. Python  (testing cepat)" -ForegroundColor White
    Write-Host "  3. Node    (npx serve)" -ForegroundColor White
    Write-Host "`nUntuk Nginx config, lihat file scripts/nginx-config.txt" -ForegroundColor Cyan
}
finally {
    if (Test-Path $tarFile) {
        Remove-Item $tarFile -Force
    }
}
