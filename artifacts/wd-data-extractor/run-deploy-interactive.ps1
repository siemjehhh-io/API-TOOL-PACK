$ErrorActionPreference = "Stop"
Set-Location "D:\MJ\PROJECT PACK MJ\api project tool pack\artifacts\wd-data-extractor"
Write-Host "DEPLOY CHECK PUSAT GIGA -> VPS" -ForegroundColor Cyan
Write-Host "Jika diminta password SSH VPS, masukkan password user kuyaba." -ForegroundColor Yellow
$env:PORT = "3000"
$env:BASE_PATH = "/"
corepack pnpm build
if ($LASTEXITCODE -ne 0) { throw "Build gagal" }
$tarFile = "deploy.tar.gz"
if (Test-Path $tarFile) { Remove-Item $tarFile -Force }
tar -czf $tarFile -C "dist/public" .
if (-not (Test-Path $tarFile)) { throw "Archive gagal dibuat" }
scp -o StrictHostKeyChecking=no $tarFile "kuyaba@52.184.18.93:/tmp/deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "Upload SCP gagal" }
ssh -o StrictHostKeyChecking=no "kuyaba@52.184.18.93" "mkdir -p /home/kuyaba/qris-tool && rm -rf /home/kuyaba/qris-tool/* && tar -xzf /tmp/deploy.tar.gz -C /home/kuyaba/qris-tool && rm /tmp/deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "Extract remote gagal" }
$status = curl.exe -s -o NUL -w "%{http_code}" --max-time 20 "https://apitool.gwk.web.id"
Write-Host "HTTP status: $status" -ForegroundColor Cyan
if ($status -eq "200") { Write-Host "DEPLOY SUKSES: https://apitool.gwk.web.id" -ForegroundColor Green } else { Write-Host "Upload selesai, tapi verifikasi HTTP bukan 200. Cek manual domain." -ForegroundColor Yellow }
Read-Host "Tekan Enter untuk tutup"
