# Maintenance Mode — apitool.gwk.web.id

Toolkit untuk menampilkan halaman maintenance khusus pada domain
`apitool.gwk.web.id` tanpa mengganggu site lain di VPS yang sama.

## Isi Folder

| File | Fungsi |
| --- | --- |
| `maintenance.html` | Halaman 503 yang ditampilkan ke pengunjung. |
| `apitool.gwk.web.id.maintenance.nginx.conf` | Server block nginx untuk mode maintenance. |
| `enable-maintenance.ps1` | Aktifkan mode maintenance di VPS. |
| `disable-maintenance.ps1` | Matikan mode maintenance & restore config asli. |

## Mekanisme

1. Backup config nginx aktif domain ke
   `/etc/nginx/sites-available/apitool.gwk.web.id.conf.bak.before-maintenance`
   (hanya sekali, biar tidak menimpa backup yang sudah ada).
2. Upload `maintenance.html` ke `/var/www/maintenance/apitool/` di VPS.
3. Replace server block domain dengan versi maintenance yang return
   `HTTP 503` + custom error page.
4. `nginx -t` lalu `systemctl reload nginx` (no-downtime reload).
5. Disable: copy backup kembali ke posisi semula, reload nginx.

Site / domain lain di VPS tidak diubah karena `server_name` spesifik
hanya `apitool.gwk.web.id`.

## Cara Pakai

### Aktifkan maintenance

```powershell
cd "artifacts\wd-data-extractor\scripts\maintenance"
powershell -ExecutionPolicy Bypass -File .\enable-maintenance.ps1
```

### Matikan maintenance

```powershell
powershell -ExecutionPolicy Bypass -File .\disable-maintenance.ps1
```

## Catatan

- Asumsi nama file config di VPS: `/etc/nginx/sites-available/apitool.gwk.web.id.conf`
  dan symlink `/etc/nginx/sites-enabled/apitool.gwk.web.id.conf`.
  Jika di VPS struktur kamu berbeda (misal pakai `/etc/nginx/conf.d/`),
  edit variabel `$NGINX_AVAIL` & `$NGINX_ENABLE` pada kedua script `.ps1`.
- Block HTTPS (port 443) di file `.maintenance.nginx.conf` dikomentari
  secara default. Aktifkan jika domain pakai SSL (Let's Encrypt).
- Halaman dikirim dengan header `Cache-Control: no-store` agar setelah
  maintenance selesai user tidak terjebak versi cache.
