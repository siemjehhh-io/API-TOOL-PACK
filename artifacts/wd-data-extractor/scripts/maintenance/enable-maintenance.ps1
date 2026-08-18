# =====================================================================
# enable-maintenance.ps1
# Mengaktifkan mode maintenance HANYA untuk apitool.gwk.web.id
# Site lain pada VPS tidak terpengaruh.
#
# Cara pakai:
#   powershell -ExecutionPolicy Bypass -File .\enable-maintenance.ps1
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
$REMOTE_DIR   = "/var/www/maintenance/apitool"

# ---- Path file lokal --------------------------------------------------
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$LocalHtml    = Join-Path $ScriptDir "maintenance.html"
$LocalConf    = Join-Path $ScriptDir "$DOMAIN.maintenance.nginx.conf"

# ---- Validasi file lokal ---------------------------------------------
foreach ($f in @($LocalHtml, $LocalConf)) {
    if (-not (Test-Path $f)) {
        Write-Host "ERROR: File tidak ditemukan: $f" -ForegroundColor Red
        exit 1
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ENABLE MAINTENANCE: $DOMAIN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ---- 1. Buat folder remote utk halaman maintenance --------------------
Write-Host "[1/5] Menyiapkan folder maintenance di VPS..." -ForegroundColor Yellow
ssh "$REMOTE_USER" "sudo mkdir -p $REMOTE_DIR && sudo chown -R ${VPS_USER}:${VPS_USER} $REMOTE_DIR"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

# ---- 2. Upload halaman maintenance.html -------------------------------
Write-Host "[2/5] Upload maintenance.html..." -ForegroundColor Yellow
scp "$LocalHtml" "${REMOTE_USER}:$REMOTE_DIR/maintenance.html"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED" -ForegroundColor Red; exit 1 }

# ---- 3. Backup config nginx aktif (sekali saja) -----------------------
Write-Host "[3/5] Backup nginx config existing (sekali, kalau belum ada)..." -ForegroundColor Yellow
$backupCmd = "if sudo test -f $NGINX_AVAIL; then " +
             "  if ! sudo test -f $BACKUP_PATH; then " +
             "    sudo cp $NGINX_AVAIL $BACKUP_PATH && echo 'backup OK -> $BACKUP_PATH'; " +
             "  else echo 'backup sudah ada, dilewati'; fi; " +
             "else echo 'config existing tidak ditemukan ($NGINX_AVAIL), lanjut tanpa backup'; fi"
ssh "$REMOTE_USER" "$backupCmd"

# ---- 4. Upload config nginx maintenance & aktifkan --------------------
Write-Host "[4/5] Upload & aktifkan nginx config maintenance..." -ForegroundColor Yellow
$tmpRemote = "/tmp/$DOMAIN.maintenance.nginx.conf"
scp "$LocalConf" "${REMOTE_USER}:$tmpRemote"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED upload conf" -ForegroundColor Red; exit 1 }

$activateCmd = "sudo mv $tmpRemote $NGINX_AVAIL && " +
               "sudo ln -sf $NGINX_AVAIL $NGINX_ENABLE && " +
               "sudo nginx -t"
ssh "$REMOTE_USER" "$activateCmd"
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED: nginx -t error. Tidak melakukan reload." -ForegroundColor Red
    exit 1
}

# ---- 5. Reload nginx --------------------------------------------------
Write-Host "[5/5] Reload nginx..." -ForegroundColor Yellow
ssh "$REMOTE_USER" "sudo systemctl reload nginx"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED reload" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  MAINTENANCE MODE: AKTIF" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "  URL : https://$DOMAIN/" -ForegroundColor White
Write-Host "  HTTP: 503 Service Temporarily Unavailable" -ForegroundColor White
Write-Host ""
Write-Host "  Untuk menonaktifkan jalankan:" -ForegroundColor Cyan
Write-Host "    .\disable-maintenance.ps1" -ForegroundColor White
Write-Host ""
