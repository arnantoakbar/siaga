# Draft posting — Siaga

> Jangan diposting sebelum `siaga.flavida.co` benar-benar menyajikan aplikasinya.
> Saat draft ini dibuat, domainnya membalas 200 dengan badan kosong.

---

## X — utas (5 posting)

**1/**

Dua hari ini pertanyaannya sama terus: Anak Krakatau sekarang gimana, dan kita
mesti ngapain.

Jawabannya sebenarnya ada. Cuma kesebar, dan yang paling cepat sampai malah dari
timeline, bukan dari sumber resminya.

Gue kumpulin jadi satu halaman.

siaga.flavida.co

**2/**

Isinya jawab tiga hal:

Anak Krakatau sekarang gimana.
Kota kamu kena atau nggak.
Apa yang perlu kamu lakukan.

Semua informasi ada waktunya. Kalau tertulis "3 jam lalu", laporannya memang
sudah tiga jam. Nggak ada yang disembunyikan umurnya.

**3/**

Datanya ditarik langsung dari PVMBG dan BMKG, digabung sama berita dan unggahan
yang lagi ramai.

Tapi dipisah jelas: mana pernyataan lembaga resmi, mana liputan media, mana yang
belum diverifikasi. Tiga label berbeda, biar nggak ketuker.

**4/**

Ada juga enam kamera pemantau PVMBG di sekitar kawah, bingkainya diperbarui
sekitar semenit sekali.

Status kotamu dihitung dari radius larangan PVMBG, ISPU 24 jam menurut Permen
LHK, dan apakah kotamu ada di jalur angin pembawa abu. Bukan tebakan.

**5/**

Tiap anjuran yang muncul ada tautan sumbernya. Bisa kamu periksa sendiri.

Ini bukan pengganti pengumuman resmi. Untuk keputusan evakuasi, tetap ikuti BPBD
dan PVMBG.

Kodenya terbuka, silakan diperiksa atau diperbaiki:
github.com/arnantoakbar/siaga

---

## X — satu posting

Bingung Anak Krakatau sekarang gimana dan mesti ngapain?

siaga.flavida.co

Status resmi PVMBG dan BMKG, enam kamera pemantau, kualitas udara per kota, dan
apa yang perlu kamu lakukan. Semua bertanda waktu.

Kodenya terbuka: github.com/arnantoakbar/siaga

---

## Threads — posting utama

Dua hari ini pertanyaannya sama terus: Anak Krakatau sekarang gimana, dan kita
mesti ngapain.

Jawabannya sebenarnya ada. Cuma kesebar di banyak tempat, dan yang paling cepat
sampai malah dari timeline, bukan dari sumber resminya. Yang nggak punya media
sosial malah paling nggak tahu apa-apa.

Gue kumpulin jadi satu halaman: siaga.flavida.co

Isinya jawab tiga hal. Anak Krakatau sekarang gimana. Kota kamu kena atau nggak.
Apa yang perlu kamu lakukan.

## Threads — balasan di utas yang sama

Datanya ditarik langsung dari PVMBG dan BMKG, digabung sama berita dan unggahan
yang lagi ramai. Tapi dipisah jelas mana pernyataan resmi, mana liputan media,
mana yang belum diverifikasi.

Ada enam kamera pemantau PVMBG di sekitar kawah, diperbarui sekitar semenit
sekali. Status kotamu dihitung dari radius larangan PVMBG, ISPU 24 jam menurut
Permen LHK, dan arah angin pembawa abu. Tiap anjuran ada tautan sumbernya.

Semua informasi ada waktunya, jadi kamu tahu masih berlaku atau tidak.

## Threads — balasan penutup

Ini bukan pengganti pengumuman resmi. Untuk keputusan evakuasi, tetap ikuti BPBD
kabupaten/kota dan PVMBG.

Kodenya terbuka. Kalau ada yang keliru atau bisa diperbaiki, silakan:
github.com/arnantoakbar/siaga

---

## Yang perlu dicek sebelum posting

- [ ] `siaga.flavida.co` menyajikan aplikasinya, bukan 200 kosong
- [ ] Buka di ponsel sekali, pastikan kamera dan peta muncul
- [ ] `/api/kesehatan` membalas 200 (kalau 503, potretnya basi)
- [ ] Server homelab kuat menerima lonjakan; kalau ragu, taruh Cloudflare di
      depannya dan biarkan `/api/terkini` di-cache 60 detik
