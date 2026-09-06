// Server tanpa dependensi: node:http untuk berkas statis + dua endpoint JSON,
// plus penjadwal pengumpulan data. Satu proses, satu port, cocok untuk homelab.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { bukaDb, bacaPotret } from './src/db.js';
import { kumpulkan, analisaTitik, CONFIG } from './src/kumpul.js';
import * as magma from './src/sumber/magma.js';

const AKAR = fileURLToPath(new URL('.', import.meta.url));
const PUBLIK = join(AKAR, 'public');
const DATA = join(AKAR, 'data');
const PORT = Number(process.env.PORT || CONFIG.port || 8080);
const INTERVAL_MS = Number(process.env.INTERVAL_MENIT || CONFIG.intervalMenit || 10) * 60_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const db = bukaDb(join(DATA, 'siaga.db'));
let potret = bacaPotret(DATA);
let sedangKumpul = false;
// Hasil per titik yang dibulatkan, ditahan 10 menit supaya Open-Meteo tidak
// ditanya berulang untuk koordinat yang sama. Hanya di memori.
const cacheLokasi = new Map();

// Bingkai kamera diperbarui MAGMA sekitar satu menit sekali, jadi disinggahkan
// 45 detik: cukup segar untuk disebut pemantauan langsung, cukup jarang untuk
// tidak membebani server mereka berapa pun jumlah pembaca halaman ini.
let cacheCctv = { pada: 0, kamera: [], galat: null };
let cctvBerjalan = null;
async function ambilCctv() {
  if (Date.now() - cacheCctv.pada < 45_000 && cacheCctv.kamera.length) return cacheCctv;
  // Enam <img> berangkat bersamaan begitu grid digambar. Tanpa penjaga ini,
  // keenamnya menembak MAGMA sekaligus saat singgahan kedaluwarsa dan sebagian
  // bisa gagal — pembaca melihat bingkai rusak. Satu pengambilan, semua menunggu.
  if (cctvBerjalan) return cctvBerjalan;
  cctvBerjalan = (async () => {
    try {
      cacheCctv = { pada: Date.now(), kamera: await magma.cctv(CONFIG.gunung.kodeMagma), galat: null };
    } catch (e) {
      // Bingkai lama dipertahankan; umurnya tetap dilaporkan apa adanya.
      cacheCctv = { ...cacheCctv, pada: Date.now(), galat: String(e.message).slice(0, 200) };
    } finally {
      cctvBerjalan = null;
    }
    return cacheCctv;
  })();
  return cctvBerjalan;
}

async function segarkan() {
  if (sedangKumpul) return;
  sedangKumpul = true;
  try {
    potret = await kumpulkan(db);
  } catch (e) {
    console.error('pengumpulan gagal total:', e.message);
  } finally {
    sedangKumpul = false;
  }
}

// Kompres sekali per potret, bukan tiap permintaan.
let cacheJson = { dibuat: null, mentah: null, gzip: null };
function badanPotret() {
  if (!potret) return null;
  if (cacheJson.dibuat !== potret.dibuat) {
    const mentah = Buffer.from(JSON.stringify(potret));
    cacheJson = { dibuat: potret.dibuat, mentah, gzip: gzipSync(mentah) };
  }
  return cacheJson;
}

function kirim(res, kode, tipe, badan, extra = {}) {
  res.writeHead(kode, { 'Content-Type': tipe, 'Content-Length': badan.length, ...extra });
  res.end(badan);
}

const srv = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const terimaGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');

  if (url.pathname === '/api/terkini') {
    const b = badanPotret();
    if (!b) return kirim(res, 503, MIME['.json'], Buffer.from('{"galat":"data belum tersedia, tunggu pengumpulan pertama"}'));
    return terimaGzip
      ? kirim(res, 200, MIME['.json'], b.gzip, { 'Content-Encoding': 'gzip', 'Cache-Control': 'no-cache' })
      : kirim(res, 200, MIME['.json'], b.mentah, { 'Cache-Control': 'no-cache' });
  }

  if (url.pathname === '/api/kesehatan') {
    const badan = Buffer.from(
      JSON.stringify({
        potretDibuat: potret?.dibuat ?? null,
        umurDetik: potret ? Math.round((Date.now() - Date.parse(potret.dibuat)) / 1000) : null,
        sumber: potret?.kesehatan ?? [],
      })
    );
    const sehat = potret && Date.now() - Date.parse(potret.dibuat) < INTERVAL_MS * 3;
    return kirim(res, sehat ? 200 : 503, MIME['.json'], badan);
  }

  // Kamera pemantau: satu daftar + satu berkas JPEG per kamera, disajikan dari
  // singgahan sendiri supaya peramban pembaca tidak menembak MAGMA langsung.
  if (url.pathname === '/api/cctv') {
    const c = await ambilCctv();
    const badan = Buffer.from(
      JSON.stringify({
        diambil: new Date(c.pada).toISOString(),
        galat: c.galat,
        lisensi: 'CC BY-NC-ND 4.0 — PVMBG, Badan Geologi KESDM',
        sumberUrl: `https://magma.esdm.go.id/v1/gunung-api/cctv/${CONFIG.gunung.kodeMagma}`,
        kamera: c.kamera.map((k) => ({ id: k.id, nama: k.nama, lebar: k.lebar ?? null, tinggi: k.tinggi ?? null, bytes: k.jpeg.length })),
      })
    );
    return kirim(res, c.kamera.length ? 200 : 503, MIME['.json'], badan, { 'Cache-Control': 'no-cache' });
  }

  const mCctv = url.pathname.match(/^\/api\/cctv\/(\d{1,2})\.jpg$/);
  if (mCctv) {
    const c = await ambilCctv();
    const k = c.kamera[Number(mCctv[1])];
    if (!k) return kirim(res, 404, 'text/plain', Buffer.from('kamera tidak ada'));
    return kirim(res, 200, 'image/jpeg', k.jpeg, { 'Cache-Control': 'public, max-age=40' });
  }

  // Lokasi perangkat. Sengaja POST, bukan query string: koordinat tidak boleh
  // mendarat di access log, riwayat peramban, atau header Referer.
  // Hasilnya tidak disimpan di mana pun.
  if (url.pathname === '/api/lokasi' && req.method === 'POST') {
    let badan = '';
    for await (const potong of req) {
      badan += potong;
      if (badan.length > 2000) { req.destroy(); return; }
    }
    let lat, lon;
    try {
      ({ lat, lon } = JSON.parse(badan));
    } catch {
      return kirim(res, 400, MIME['.json'], Buffer.from('{"galat":"badan bukan JSON"}'));
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
      return kirim(res, 400, MIME['.json'], Buffer.from('{"galat":"koordinat di luar jangkauan"}'));
    if (!potret)
      return kirim(res, 503, MIME['.json'], Buffer.from('{"galat":"data belum tersedia"}'));

    const kunci = `${Math.round(lat * 100)},${Math.round(lon * 100)}`;
    const singgah = cacheLokasi.get(kunci);
    if (singgah && Date.now() - singgah.pada < 10 * 60_000)
      return kirim(res, 200, MIME['.json'], Buffer.from(JSON.stringify(singgah.data)), { 'Cache-Control': 'no-store' });

    try {
      const data = await analisaTitik(lat, lon, potret);
      if (cacheLokasi.size > 500) cacheLokasi.clear();
      cacheLokasi.set(kunci, { pada: Date.now(), data });
      return kirim(res, 200, MIME['.json'], Buffer.from(JSON.stringify(data)), { 'Cache-Control': 'no-store' });
    } catch (e) {
      return kirim(res, 502, MIME['.json'], Buffer.from(JSON.stringify({ galat: String(e.message).slice(0, 200) })));
    }
  }

  if (url.pathname === '/api/segarkan' && req.method === 'POST') {
    segarkan();
    return kirim(res, 202, MIME['.json'], Buffer.from('{"status":"pengumpulan dijalankan"}'));
  }

  // berkas statis
  const jalur = url.pathname === '/' ? '/index.html' : url.pathname;
  const berkas = join(PUBLIK, normalize(jalur).replace(/^(\.\.[/\\])+/, ''));
  if (!berkas.startsWith(PUBLIK)) return kirim(res, 403, 'text/plain', Buffer.from('terlarang'));

  try {
    const st = await stat(berkas);
    if (!st.isFile()) throw new Error('bukan berkas');

    // ETag dari ukuran + waktu ubah. Tanpa validator, `no-cache` saja tidak cukup:
    // peramban tidak punya cara memeriksa kesegaran dan tetap memakai salinan lama.
    // Ini pernah membuat perbaikan halaman tidak sampai ke pembaca.
    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(36)}"`;
    // Aset dipanggil dengan ?v=… yang ikut berubah tiap rilis, jadi boleh disimpan
    // lama. Halaman induknya tidak: ia yang menentukan versi aset mana yang dipakai.
    const berversi = url.searchParams.has('v');
    const cache = berversi ? 'public, max-age=31536000, immutable' : 'no-cache';

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': cache });
      return res.end();
    }

    const isi = await readFile(berkas);
    const tipe = MIME[extname(berkas)] || 'application/octet-stream';
    const kepala = { 'Cache-Control': cache, ETag: etag };
    if (terimaGzip && /text|json|javascript|svg/.test(tipe))
      return kirim(res, 200, tipe, gzipSync(isi), { ...kepala, 'Content-Encoding': 'gzip' });
    return kirim(res, 200, tipe, isi, kepala);
  } catch {
    return kirim(res, 404, 'text/plain; charset=utf-8', Buffer.from('tidak ditemukan'));
  }
});

srv.listen(PORT, () => {
  console.log(`siaga berjalan di http://localhost:${PORT}`);
  console.log(`pengumpulan tiap ${INTERVAL_MS / 60000} menit`);
  segarkan();
  setInterval(segarkan, INTERVAL_MS);
});

for (const sinyal of ['SIGINT', 'SIGTERM'])
  process.on(sinyal, () => {
    srv.close();
    db.close();
    process.exit(0);
  });
