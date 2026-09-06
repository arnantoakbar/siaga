// Kolektor: tarik semua sumber, hitung analisa, tulis potret.
//
// Aturan yang dipegang di sini: satu sumber gagal tidak boleh menjatuhkan yang lain,
// dan kegagalan tidak boleh disembunyikan. Setiap sumber melaporkan sendiri
// status "ok / gagal" berikut waktu pengambilan terakhir, dan itu ikut dikirim ke UI.
import { readFileSync } from 'node:fs';
import * as magma from './sumber/magma.js';
import * as cuaca from './sumber/cuaca.js';
import * as bmkg from './sumber/bmkg.js';
import * as publik from './sumber/publik.js';
import { analisaKota, ringkasGunung, ispuGabungan } from './analisa.js';
import { simpanLaporan, simpanUdara, simpanPos, catatSumber, riwayatLaporan, tulisPotret } from './db.js';

const muat = (nama) => JSON.parse(readFileSync(new URL(`../config/${nama}`, import.meta.url)));
export const CONFIG = muat('config.json');
export const AMBANG = muat('ambang.json');

/** Bungkus satu sumber: hasilnya selalu { ok, data | pesan, waktu }. */
async function coba(db, nama, fn) {
  const mulai = Date.now();
  try {
    const data = await fn();
    catatSumber(db, nama, true, null);
    return { nama, ok: true, data, waktu: new Date().toISOString(), msDurasi: Date.now() - mulai };
  } catch (e) {
    const pesan = String(e.message || e).slice(0, 300);
    catatSumber(db, nama, false, pesan);
    console.warn(`  ! sumber ${nama} gagal: ${pesan}`);
    return { nama, ok: false, pesan, waktu: new Date().toISOString(), msDurasi: Date.now() - mulai };
  }
}

/**
 * Apakah sebuah posting benar-benar soal gunung yang dipantau?
 *
 * Linimasa akun resmi seperti @infoBMKG berisi laporan gempa otomatis setiap
 * beberapa menit dari seluruh Indonesia. Tanpa saringan, halaman erupsi Krakatau
 * penuh gempa magnitudo 2 di Flores dan yang penting jadi tenggelam.
 * Berita sudah tersaring di sumbernya lewat kata kunci pencarian, jadi hanya
 * kanal media sosial yang perlu diperiksa di sini.
 */
export function relevan(pos, kunci) {
  if (pos.kanal === 'berita') return true;
  const teks = `${pos.judul} ${pos.ringkas || ''}`.toLowerCase();
  return kunci.some((k) => teks.includes(k));
}

/** Media sosial + berita. Tiap kanal berdiri sendiri; yang mati dilaporkan mati. */
async function kanalPublik(db) {
  const g = CONFIG.gunung.nama;
  const kunci = CONFIG.sumberX.kataKunci?.[0] || g;

  const hasil = await Promise.all([
    coba(db, 'berita', () => publik.berita(g)),
    coba(db, 'berita-abu', () => publik.berita('abu vulkanik')),
    coba(db, 'berita-penerbit', () => publik.beritaPenerbit(CONFIG.umpanBerita || [], [
      g.toLowerCase(), ...(CONFIG.sumberX.kataKunci || []), 'abu vulkanik', 'erupsi',
    ])),
    CONFIG.sumberX.aktif
      ? coba(db, 'x-nitter', () => publik.xNitter(CONFIG.sumberX.nitterInstances, kunci))
      : { nama: 'x-nitter', ok: false, pesan: 'dimatikan lewat config', waktu: new Date().toISOString() },
    CONFIG.sumberX.aktif
      ? coba(db, 'x-resmi', async () => {
          const per = await Promise.allSettled(CONFIG.sumberX.akunResmi.map((a) => publik.xSindikasi(a)));
          const ok = per.filter((p) => p.status === 'fulfilled').flatMap((p) => p.value);
          if (!ok.length) throw new Error(per.map((p) => p.reason?.message).filter(Boolean).join(' | ') || 'kosong');
          return ok;
        })
      : { nama: 'x-resmi', ok: false, pesan: 'dimatikan lewat config', waktu: new Date().toISOString() },
    process.env.THREADS_TOKEN
      ? coba(db, 'threads', () => publik.threads(kunci))
      : {
          nama: 'threads',
          ok: false,
          pesan: 'THREADS_TOKEN belum diisi. Pencarian posting publik Threads juga butuh App Review Meta untuk izin threads_keyword_search.',
          waktu: new Date().toISOString(),
        },
  ]);

  const kunciRelevan = [
    g.toLowerCase(),
    ...(CONFIG.sumberX.kataKunci || []).map((k) => k.toLowerCase()),
    'krakatau', 'abu vulkanik', 'erupsi', 'gunung api', 'vulkanik',
  ];

  let pos = hasil
    .filter((h) => h.ok)
    .flatMap((h) => (Array.isArray(h.data) ? h.data : h.data?.item || []))
    .filter((p) => p.waktu && relevan(p, kunciRelevan));

  // FxTwitter melengkapi setiap tautan X yang sudah ditemukan: teks penuh,
  // foto/video, dan metrik — hal yang tidak diberikan RSS Nitter maupun
  // endpoint sematan. Ia tidak bisa MENEMUKAN posting (tak ada endpoint
  // pencarian), jadi perannya murni memperkaya apa yang sudah ada,
  // ditambah posting yang sengaja dipasang di config.
  const tautanX = [
    ...pos.filter((p) => p.kanal === 'x').map((p) => p.tautan),
    ...(CONFIG.sumberX.postPilihan || []),
  ];
  const sFx = tautanX.length
    ? await coba(db, 'x-fxtwitter', async () => {
        const { hasil: kaya, galat } = await publik.xLengkapiBanyak(tautanX);
        if (!kaya.length) throw new Error(galat.slice(0, 2).join(' | ') || 'tidak ada yang berhasil dilengkapi');
        return { kaya, galat };
      })
    : {
        nama: 'x-fxtwitter',
        ok: false,
        pesan:
          'Tidak ada tautan X untuk dilengkapi. FxTwitter hanya bisa membaca posting yang tautannya sudah diketahui — ' +
          'ia tidak punya endpoint pencarian, jadi penemuan harus datang dari x-resmi, x-nitter, atau sumberX.postPilihan di config.',
        waktu: new Date().toISOString(),
      };

  if (sFx.ok) {
    // yang sudah dilengkapi menggantikan versi mentahnya
    const perTautan = new Map(sFx.data.kaya.map((k) => [k.tautan.replace(/^https?:\/\/(x|twitter)\.com/, ''), k]));
    const kunci = (u) => String(u).replace(/^https?:\/\/(x|twitter)\.com/, '').split('?')[0];
    pos = pos.filter((p) => p.kanal !== 'x' || !perTautan.has(kunci(p.tautan)));
    // Diperiksa ulang setelah dilengkapi: teks penuh dari FxTwitter kadang
    // mengungkap posting yang cuplikannya tadi tidak menyebut gunungnya.
    pos.push(...sFx.data.kaya.filter((k) => relevan(k, kunciRelevan)));
  }
  hasil.push(sFx);
  pos.sort((a, b) => b.waktu.localeCompare(a.waktu));

  // buang judul kembar antar media
  const unik = [];
  const terlihat = new Set();
  for (const p of pos) {
    const k = p.judul.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60);
    if (terlihat.has(k)) continue;
    terlihat.add(k);
    unik.push(p);
  }

  if (unik.length) simpanPos(db, unik);
  return { pos: unik.slice(0, 40), kesehatan: hasil.map(({ data, ...s }) => s) };
}

export async function kumpulkan(db) {
  const t0 = Date.now();
  const g = CONFIG.gunung;
  console.log(`[${new Date().toISOString()}] mengumpulkan data…`);

  // 1. PVMBG dulu — tanpa ini tidak ada status resmi untuk ditampilkan.
  const sTingkat = await coba(db, 'magma-tingkat-aktivitas', magma.tingkatAktivitas);
  const barisGunung = sTingkat.ok ? sTingkat.data.find((x) => x.gunung.toLowerCase() === g.nama.toLowerCase()) : null;

  const [sLaporan, sHarian, sAngin, sUdara, sGempa, publikHasil] = await Promise.all([
    barisGunung
      ? coba(db, 'magma-laporan', () => magma.laporan(barisGunung.laporanUrl))
      : { nama: 'magma-laporan', ok: false, pesan: 'tautan laporan tidak ditemukan', waktu: new Date().toISOString() },
    coba(db, 'magma-laporan-harian', () => magma.laporanHarian(g.nama)),
    coba(db, 'angin', () => cuaca.anginKolom(g.lat, g.lon)),
    coba(db, 'udara', () => cuaca.kualitasUdara(CONFIG.kota)),
    coba(db, 'bmkg-gempa', bmkg.gempa),
    kanalPublik(db),
  ]);

  // Kalau laporan terbaru gagal diambil, pakai laporan tersimpan terakhir dan
  // tandai umurnya. Halaman kosong lebih berbahaya daripada halaman yang jujur
  // bilang "ini laporan 6 jam lalu, pengambilan terbaru gagal".
  let laporan = sLaporan.ok ? sLaporan.data : null;
  let laporanCadangan = false;
  if (!laporan) {
    laporan = riwayatLaporan(db, g.nama, 1)[0] ?? null;
    laporanCadangan = !!laporan;
    if (laporan) console.warn(`  ! memakai laporan tersimpan ${laporan.tanggal} ${laporan.periodeMulai}-${laporan.periodeSelesai}`);
  }
  const angin = sAngin.ok ? sAngin.data : null;
  const udaraPer = new Map((sUdara.ok ? sUdara.data : []).map((u) => [u.kotaId, u]));

  if (laporan) simpanLaporan(db, laporan);
  for (const [id, u] of udaraPer) if (u.deret?.length) simpanUdara(db, id, u.deret);

  const kota = CONFIG.kota
    .map((k) => analisaKota(k, g, laporan, udaraPer.get(k.id), angin, AMBANG))
    .sort((a, b) => a.jarakKm - b.jarakKm);

  // Tren kegempaan antar periode laporan — hanya bisa dari simpanan sendiri.
  const tren = riwayatLaporan(db, g.nama, 28).map((l) => ({
    waktu: l.waktuLaporan,
    tanggal: l.tanggal,
    periode: `${l.periodeMulai}–${l.periodeSelesai}`,
    level: l.level,
    letusan: (l.kegempaan || []).find((x) => /letusan|erupsi/i.test(x.jenis))?.jumlah ?? 0,
    hembusan: (l.kegempaan || []).find((x) => /hembusan/i.test(x.jenis))?.jumlah ?? 0,
    total: (l.kegempaan || []).reduce((a, x) => a + x.jumlah, 0),
  }));

  const kesehatan = [sTingkat, sLaporan, sHarian, sAngin, sUdara, sGempa, ...publikHasil.kesehatan].map(
    ({ data, ...s }) => s
  );

  const potret = {
    dibuat: new Date().toISOString(),
    msDurasi: Date.now() - t0,
    gunung: { ...g, ...(barisGunung || {}) },
    ringkas: ringkasGunung(barisGunung, laporan, sHarian.ok ? sHarian.data : null, angin, AMBANG),
    laporan,
    laporanCadangan,
    angin,
    kota,
    tren,
    gempa: sGempa.ok ? sGempa.data : null,
    pos: publikHasil.pos,
    kesehatan,
    ambang: {
      ispuKategori: AMBANG.ispuKategori,
      sektorToleransiDerajat: AMBANG.sektorToleransiDerajat,
      jangkauanAbuKm: AMBANG.jangkauanAbuKm,
    },
  };

  tulisPotret(new URL('../data', import.meta.url).pathname, potret);
  const gagal = kesehatan.filter((s) => !s.ok);
  console.log(
    `  selesai ${potret.msDurasi} ms — ${kesehatan.length - gagal.length}/${kesehatan.length} sumber ok` +
      (gagal.length ? `, gagal: ${gagal.map((s) => s.nama).join(', ')}` : '')
  );
  return potret;
}

export { ispuGabungan };

/**
 * Analisa untuk satu titik koordinat, dipakai endpoint lokasi perangkat.
 *
 * Koordinat sudah dibulatkan ke 2 desimal (sekitar 1,1 km) di peramban DAN di sini.
 * Ketelitian itu lebih dari cukup untuk jarak ke kawah dan sel model kualitas udara
 * yang lebarnya ~40 km, sekaligus menahan posisi persis pengguna agar tidak ikut
 * terkirim. Tidak ada yang disimpan: tidak ke SQLite, tidak ke log.
 */
export async function analisaTitik(lat, lon, potret) {
  const bulat = (n) => Math.round(n * 100) / 100;
  const titik = { id: 'lokasi-saya', nama: 'Lokasi kamu', provinsi: 'dari perangkat', lat: bulat(lat), lon: bulat(lon) };
  const udara = (await cuaca.kualitasUdara([titik]))[0];
  const hasil = analisaKota(titik, CONFIG.gunung, potret?.laporan ?? null, udara, potret?.angin ?? null, AMBANG);
  return { ...hasil, dariPerangkat: true };
}
