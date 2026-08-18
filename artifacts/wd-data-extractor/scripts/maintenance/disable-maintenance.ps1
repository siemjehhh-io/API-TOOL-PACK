# =====================================================================
# disable-maintenance.ps1
# Menonaktifkan mode maintenance untuk apitool.gwk.web.id
# Mengembalikan nginx config ke versi sebelum maintenance.
# =====================================================================

$ErrorActionPreference = "Stop"

# ---- Konfigurasi VPS --------------------------------------------------
$VPS_USER     = "kuyaba"
$VPS_HOST     = "52.184.18.93"
$DOMAIN       = "apitool.gwk.web.id"
$REMOTE_USER  = "$VPS_USER@$VPS_HOST"

# Path file di VPS
$NGINX_AVAIL  = "/etc/nginx/sites-available/$DOMAIN"
$NGINX_ENABLE = "/etc/nginx/sites-enabled/$DOMAIN"
$BACKUP_PATH  = "/etc/nginx/sites-available/$DOMAIN.bak.before-maintenance"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DISABLE MAINTENANCE: $DOMAIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. Restore config asli dari backup -------------------------------
Write-Host "[1/3] Restore nginx config asli dari backup..." -ForegroundColor Yellow
$restoreCmd = "if sudo test -f $BACKUP_PATH; then " +
              "  sudo cp $BACKUP_PATH $NGINX_AVAIL && " +
              "  sudo ln -sf $NGINX_AVAIL $NGINX_ENABLE && " +
              "  echo 'restore OK'; " +
              "else " +
              "  echo 'BACKUP TIDAK DITEMUKAN: $BACKUP_PATH'; " +
              "  echo 'Tidak ada perubahan dilakukan. Cek manual di VPS.'; " +
              "  exit 1; " +
              "fi"
ssh "$REMOTE_USER" "$restoreCmd"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED restore" -ForegroundColor Red; exit 1 }

# ---- 2. Test config nginx --------------------------------------------
Write-Host "[2/3] Test konfigurasi nginx..." -ForegroundColor Yellow
ssh "$REMOTE_USER" "sudo nginx -t"
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: nginx -t error. Tidak melakukan reload." -ForegroundColor Red
    exit 1
}

# ---- 3. Reload nginx --------------------------------------------------
Write-Host "[3/3] Reload nginx..." -ForegroundColor Yellow
ssh "$REMOTE_USER" "sudo systemctl reload nginx"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED reload" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  MAINTENANCE MODE: NON-AKTIF" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Site $DOMAIN sudah kembali normal." -ForegroundColor White
Write-Host ""
