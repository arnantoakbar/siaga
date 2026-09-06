// Server tanpa dependensi: node:http untuk berkas statis + dua endpoint JSON,
// plus penjadwal pengumpulan data. Satu proses, satu port, cocok untuk homelab.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { bukaDb, bacaPotret } from './src/db.js';
import { kumpulkan, CONFIG } from './src/kumpul.js';

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
    const isi = await readFile(berkas);
    const tipe = MIME[extname(berkas)] || 'application/octet-stream';
    // Halaman, skrip, dan gaya tidak boleh basi: perbaikan pada halaman peringatan
    // harus sampai ke pembaca pada muat berikutnya, bukan sejam kemudian.
    const cache = /\.(html|js|css)$/.test(berkas) ? 'no-cache' : 'public, max-age=3600';
    if (terimaGzip && /text|json|javascript|svg/.test(tipe))
      return kirim(res, 200, tipe, gzipSync(isi), { 'Content-Encoding': 'gzip', 'Cache-Control': cache });
    return kirim(res, 200, tipe, isi, { 'Cache-Control': cache });
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
