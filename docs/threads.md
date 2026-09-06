# Mendapatkan token Threads

Ringkasnya: **punya akun Threads saja tidak cukup.** Untuk membaca unggahan
publik orang lain, aplikasimu harus lolos App Review Meta. Tanpa itu, endpoint
pencarian hanya mengembalikan unggahanmu sendiri — tidak berguna untuk memantau
perbincangan warga.

Dokumen ini menjelaskan dua hal terpisah: cara mendapatkan tokennya, dan apa yang
token itu bisa dan tidak bisa lakukan.

---

## Yang perlu dipahami lebih dulu

| Izin | Untuk apa | Perlu App Review? |
|---|---|---|
| `threads_basic` | Dasar, wajib ada | Tidak |
| `threads_keyword_search` | Endpoint `/keyword_search` | **Ya**, untuk unggahan publik |

Meta menyebutnya dua tingkat akses:

- **Standard Access** — didapat otomatis begitu aplikasi dibuat. `/keyword_search`
  bisa dipanggil, tapi **hanya mencari di unggahan milik pengguna yang tokennya
  dipakai** (dan akun tester yang kamu daftarkan).
- **Advanced Access** — setelah App Review disetujui. Barulah unggahan publik ikut
  terjangkau.

Jadi kalau tujuanmu memantau apa yang sedang diunggah warga soal erupsi,
**langkah 6 (App Review) bukan opsional.** Siaga tetap jalan tanpa Threads; kanal
itu akan tampil sebagai "gagal" berikut alasannya di panel "Dari mana datanya".

Batas pemakaian setelah disetujui: **2.200 kueri per 24 jam bergulir** per pengguna.
Dengan interval bawaan Siaga 10 menit, itu 144 panggilan per hari — jauh di bawah batas.

---

## Langkah mendapatkan token

### 1. Aktifkan Threads di akun kamu

Buka Threads → **Settings → Account → Website permissions** dan pastikan profilmu
bukan akun privat. API tidak melayani akun terkunci.

### 2. Buat aplikasi Meta

1. Masuk ke <https://developers.facebook.com/apps> dengan akun Facebook/Meta kamu.
2. **Create App** → pilih use case **"Access the Threads API"**.
3. Beri nama aplikasi, lalu selesaikan pembuatan.

### 3. Tambahkan produk Threads API

Di dasbor aplikasi, tambahkan produk **Threads API**, lalu buka
**Threads API → Settings** dan isi:

- **Redirect Callback URL** — harus HTTPS. Untuk uji coba, `https://localhost/callback`
  biasanya diterima. Kalau Siaga kamu sudah punya domain, pakai
  `https://siaga.domainkamu.id/threads/callback`.
- Catat **Threads App ID** dan **Threads App Secret** dari halaman ini.

### 4. Daftarkan dirimu sebagai tester

**App roles → Roles → Add People → Threads Tester**, masukkan username Threads kamu.
Lalu buka Threads → **Settings → Account → Website permissions → Invites** dan
**terima undangannya**. Langkah menerima ini sering terlewat dan membuat semua
langkah berikutnya gagal.

### 5. Tukar kode otorisasi jadi token

**a. Buka URL otorisasi di peramban** (ganti `APP_ID` dan `REDIRECT_URI`):

```
https://threads.net/oauth/authorize
  ?client_id=APP_ID
  &redirect_uri=REDIRECT_URI
  &scope=threads_basic,threads_keyword_search
  &response_type=code
```

Setujui, lalu kamu dialihkan ke redirect URI dengan `?code=...` di URL-nya.
Salin nilai `code` itu — **buang `#_` di ujungnya kalau ada.** Kode ini kedaluwarsa
dalam 1 jam dan hanya bisa dipakai sekali.

**b. Tukar jadi token berumur pendek (1 jam):**

```bash
curl -X POST https://graph.threads.net/oauth/access_token \
  -F client_id=APP_ID \
  -F client_secret=APP_SECRET \
  -F grant_type=authorization_code \
  -F redirect_uri=REDIRECT_URI \
  -F code=KODE_DARI_LANGKAH_A
```

**c. Tukar lagi jadi token berumur panjang (60 hari):**

```bash
curl -s "https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=APP_SECRET&access_token=TOKEN_PENDEK"
```

Yang keluar dari langkah **c** itulah yang dipakai Siaga.

### 6. Ajukan App Review untuk `threads_keyword_search`

Tanpa ini, kanalnya tidak berguna. Di **App Review → Permissions and Features**,
cari `threads_keyword_search` → **Request Advanced Access**. Kamu akan diminta:

- Video screencast yang menunjukkan bagaimana aplikasimu memakai hasil pencarian.
- Penjelasan kegunaan. Untuk Siaga, sebutkan apa adanya: agregasi informasi
  kebencanaan publik yang menampilkan unggahan berikut tautan dan waktu aslinya,
  ditandai jelas sebagai belum terverifikasi, dan tidak disimpan permanen.
- Kemungkinan **Business Verification** dan **Data Use Checkup**.

Proses ini bisa makan waktu berhari-hari sampai berminggu-minggu, dan bisa ditolak.

---

## Memasang tokennya di Siaga

**Docker Compose** — buka komentar barisnya di `compose.yml`:

```yaml
environment:
  THREADS_TOKEN: "THAA..."
```

**systemd:**

```ini
Environment=THREADS_TOKEN=THAA...
```

**Langsung:**

```bash
THREADS_TOKEN=THAA... node server.js
```

Cek berhasil atau tidak lewat panel **"Dari mana datanya"** di halaman, atau:

```bash
curl -s localhost:8080/api/kesehatan | grep -o '"nama":"threads"[^}]*'
```

---

## Perpanjangan token

Token berumur panjang bertahan **60 hari** dan hanya bisa diperpanjang kalau
umurnya sudah lewat 24 jam:

```bash
curl -s "https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=TOKEN_LAMA"
```

Siaga tidak memperpanjang sendiri — kalau tokennya mati, kanal Threads tampil gagal
dan sisa halaman tetap jalan seperti biasa. Pasang pengingat kalender 50 hari, atau
tambahkan cron yang memanggil endpoint di atas lalu menulis ulang variabel
lingkungannya.

---

## Kalau App Review tidak lolos

Alternatif yang tetap memberi sinyal warga, sesuai keadaan hari ini:

- **Google News RSS** — sudah aktif dan paling andal. Banyak artikel justru
  menampilkan foto dan video kiriman warga.
- **X lewat endpoint sematan** — sudah aktif untuk akun resmi, dan FxTwitter
  melengkapi isi tiap unggahan (teks penuh, foto, video, metrik) tanpa kunci.
- **X lewat Nitter** — untuk pencarian kata kunci warga. Perlu pembaca RSS
  di-whitelist, lihat README.
- **`sumberX.postPilihan`** di `config/config.json` — tempel tautan unggahan X
  penting secara manual; FxTwitter yang mengambil isinya.
