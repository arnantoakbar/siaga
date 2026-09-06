// PVMBG / MAGMA Indonesia (Badan Geologi KESDM) — sumber resmi status gunung api.
// Tidak ada API publik tanpa token, jadi halaman HTML server-rendered yang dibaca.
// Kalau layout MAGMA berubah, parser melempar error dan pemanggilnya wajib menandai
// sumber ini "gagal" — bukan menyajikan data lama seolah-olah masih berlaku.
import { ambil, keTeks, unesc } from '../util.js';

const BASE = 'https://magma.esdm.go.id/v1/gunung-api';
const RE_LEVEL = /Level\s+(I|II|III|IV)\s*\((Normal|Waspada|Siaga|Awas)\)/g;
const RE_LEVEL_SATU = /Level\s+(I|II|III|IV)\s*\((Normal|Waspada|Siaga|Awas)\)/;
const RE_BARIS =
  />\s*([^<>\n]+?)\s+-\s+([^<>\n]+?)\s*<a\s+href="(https:\/\/magma\.esdm\.go\.id\/v1\/gunung-api\/laporan\/\d+\?signature=[a-f0-9]+)"/g;

const BULAN = ['januari','februari','maret','april','mei','juni','juli','agustus','september','oktober','november','desember'];

/** "06 September 2026" + "06:00" WIB -> ISO UTC. */
export function keWaktuISO(tanggal, jam) {
  const [d, namaBulan, th] = String(tanggal).trim().split(/\s+/);
  const bl = BULAN.indexOf(String(namaBulan).toLowerCase());
  if (bl < 0) return null;
  const [H, M] = jam.split(':').map(Number);
  return new Date(Date.UTC(+th, bl, +d, H - 7, M)).toISOString(); // WIB = UTC+7
}

/** Tabel tingkat aktivitas seluruh gunung api + tautan laporan terbaru masing-masing. */
export async function tingkatAktivitas() {
  const html = await ambil(`${BASE}/tingkat-aktivitas`);
  const penanda = [...html.matchAll(RE_LEVEL)].map((m) => ({ idx: m.index, romawi: m[1], nama: m[2] }));
  if (!penanda.length) throw new Error('MAGMA: penanda level tidak ditemukan');

  const keluar = [];
  for (let i = 0; i < penanda.length; i++) {
    const potong = html.slice(penanda[i].idx, penanda[i + 1]?.idx ?? html.length);
    for (const m of potong.matchAll(RE_BARIS)) {
      keluar.push({
        gunung: unesc(m[1]).trim(),
        wilayah: unesc(m[2]).trim(),
        level: penanda[i].romawi,
        levelNama: penanda[i].nama,
        laporanUrl: m[3],
      });
    }
  }
  if (!keluar.length) throw new Error('MAGMA: tidak ada baris gunung terbaca');
  return keluar;
}

const LABEL = ['Pengamatan Visual', 'Keterangan Lainnya', 'Klimatologi', 'Pengamatan Kegempaan', 'Rekomendasi'];
// Bagian terakhir ("Rekomendasi") tidak punya label penutup, jadi tanpa penanda ini
// footer situs MAGMA ikut terbaca sebagai rekomendasi keselamatan. Pernah terjadi.
const AKHIR = /^(Copyright|Dibuat oleh:|Pusat Vulkanologi|All Rights Reserved|© )/i;

export function bagian(baris) {
  const out = {};
  let aktif = null;
  for (const b of baris) {
    if (LABEL.includes(b)) { aktif = b; out[aktif] = []; continue; }
    if (AKHIR.test(b)) { aktif = null; continue; }
    if (aktif) out[aktif].push(b);
  }
  return out;
}

/** "3 kali gempa Hembusan dengan amplitudo 25-34 mm, dan lama gempa 38-47 detik." */
function uraiKegempaan(baris = []) {
  const out = [];
  for (const b of baris) {
    const m = b.match(/^(\d+)\s+kali\s+gempa\s+(.+?)\s+dengan\s+amplitudo\s+([\d\-–.,]+)\s*mm/i);
    if (m) out.push({ jenis: m[2].trim(), jumlah: +m[1], amplitudoMm: m[3], teks: b });
    else if (/tremor/i.test(b))
      out.push({ jenis: 'Tremor Menerus', jumlah: 1, amplitudoMm: (b.match(/amplitudo\s+([\d\-–.,]+)/i) || [])[1] ?? null, teks: b });
  }
  return out;
}

/** Laporan pengamatan 6-jam-an: level, periode, visual, kegempaan, rekomendasi resmi. */
export async function laporan(url) {
  const baris = keTeks(await ambil(url));
  const judul = baris.find((b) => /,\s*periode\s+[\d:]+\s*-\s*[\d:]+\s*WIB/i.test(b)) || '';
  const m = judul.match(/^(.+?),\s*(\w+)\s*-\s*(\d{1,2}\s+\w+\s+\d{4}),\s*periode\s+([\d:]+)\s*-\s*([\d:]+)\s*WIB/i);
  const lvBaris = baris.find((b) => RE_LEVEL_SATU.test(b) && b.length < 40);
  const lv = lvBaris && lvBaris.match(RE_LEVEL_SATU);
  if (!m || !lv) throw new Error('MAGMA: format laporan tidak dikenali');

  const sec = bagian(baris);
  return {
    url,
    gunung: m[1].replace(/^Laporan Aktivitas Gunung Api\s*-\s*/i, '').trim(),
    hari: m[2],
    tanggal: m[3],
    periodeMulai: m[4],
    periodeSelesai: m[5],
    waktuLaporan: keWaktuISO(m[3], m[5]),
    level: lv[1],
    levelNama: lv[2],
    pembuat: (baris.find((b) => /^Dibuat oleh/i.test(b)) || '').replace(/^Dibuat oleh,?\s*/i, '').trim(),
    visual: (sec['Pengamatan Visual'] || []).join(' '),
    keterangan: (sec['Keterangan Lainnya'] || []).join(' '),
    klimatologi: (sec['Klimatologi'] || []).join(' '),
    kegempaanTeks: sec['Pengamatan Kegempaan'] || [],
    kegempaan: uraiKegempaan(sec['Pengamatan Kegempaan']),
    rekomendasi: sec['Rekomendasi'] || [],
  };
}

/**
 * Kamera pemantau MAGMA. Halaman daftar menyematkan bingkai terbaru tiap kamera
 * sebagai JPEG base64, jadi tidak perlu menembus apa pun: yang dibaca persis
 * gambar yang ditampilkan MAGMA sendiri.
 *
 * Ukurannya 150x84 dan itu memang yang disediakan halaman publik. Gambar penuh
 * ada di balik endpoint ber-CSRF Laravel dan sengaja tidak diambil.
 * Bingkai diperbarui sekitar satu menit sekali — waktu pengambilannya tercetak
 * di dalam gambar oleh kameranya sendiri.
 *
 * Lisensi: CC BY-NC-ND 4.0, PVMBG Badan Geologi. Gambar disajikan apa adanya,
 * dengan atribusi, tanpa modifikasi.
 */
export async function cctv(kode) {
  const html = await ambil(`${BASE}/cctv/${kode}`);
  const potong = html.split(/<img class="img-fit-cover"\s+src="data:image\/jpeg;base64,/);
  const keluar = [];
  for (const [i, bagian] of potong.slice(1).entries()) {
    // Catatan: String.prototype.split(sep, limit) di JS MEMBUANG sisa string,
    // tidak seperti maxsplit di Python. Jadi pemotongannya dilakukan manual.
    const batas = bagian.indexOf('"');
    if (batas < 0) continue;
    const b64 = bagian.slice(0, batas);
    const sisa = bagian.slice(batas + 1);
    const nama = (sisa.match(/<small class="text-right">\s*([^<]{3,90}?)\s*<\/small>/) || [])[1];
    if (!b64) continue;
    keluar.push({
      id: String(i),
      nama: unesc(nama || `Kamera ${i + 1}`).trim(),
      jpeg: Buffer.from(b64, 'base64'),
    });
  }
  if (!keluar.length) throw new Error('MAGMA: tidak ada bingkai kamera terbaca');
  return keluar;
}

/** Ringkasan harian per gunung (visual / kegempaan / rekomendasi). */
export async function laporanHarian(namaGunung) {
  const html = await ambil(`${BASE}/laporan-harian`);
  const baris = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => keTeks(c[1]).join(' '))
  );
  const r = baris.find((c) => c[1] && c[1].toLowerCase().includes(namaGunung.toLowerCase()));
  return r ? { gunung: r[1], visual: r[2], kegempaan: r[3], rekomendasi: r[4] } : null;
}
