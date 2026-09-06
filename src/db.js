// SQLite bawaan Node (node:sqlite) — tanpa paket tambahan.
//
// Pembagian penyimpanan:
//   - Potret terkini  -> data/terkini.json  (satu berkas, dibaca tiap permintaan, murah)
//   - Riwayat/deret   -> data/siaga.db      (tumbuh terus, butuh kueri rentang waktu)
// MAGMA hanya menampilkan laporan terbaru, jadi tren kegempaan antar periode
// cuma bisa ada kalau kita sendiri yang menyimpannya.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function bukaDb(berkas) {
  mkdirSync(dirname(berkas), { recursive: true });
  const db = new DatabaseSync(berkas);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS laporan (
      url           TEXT PRIMARY KEY,
      gunung        TEXT NOT NULL,
      level         TEXT NOT NULL,
      waktu_laporan TEXT NOT NULL,
      diambil       TEXT NOT NULL,
      json          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_laporan_waktu ON laporan (gunung, waktu_laporan DESC);

    CREATE TABLE IF NOT EXISTS udara (
      kota_id TEXT NOT NULL,
      waktu   TEXT NOT NULL,
      pm25    REAL, pm10 REAL, so2 REAL, ispu INTEGER,
      PRIMARY KEY (kota_id, waktu)
    );

    CREATE TABLE IF NOT EXISTS pos (
      tautan  TEXT PRIMARY KEY,
      kanal   TEXT NOT NULL,
      judul   TEXT NOT NULL,
      sumber  TEXT,
      waktu   TEXT NOT NULL,
      diambil TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_pos_waktu ON pos (waktu DESC);

    CREATE TABLE IF NOT EXISTS sumber_status (
      nama   TEXT NOT NULL,
      waktu  TEXT NOT NULL,
      ok     INTEGER NOT NULL,
      pesan  TEXT,
      PRIMARY KEY (nama, waktu)
    );
  `);
  return db;
}

export function simpanLaporan(db, lap) {
  db.prepare(
    `INSERT INTO laporan (url, gunung, level, waktu_laporan, diambil, json)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(url) DO NOTHING`
  ).run(lap.url, lap.gunung, lap.level, lap.waktuLaporan ?? '', new Date().toISOString(), JSON.stringify(lap));
}

/** Deret kegempaan antar periode laporan — bahan grafik tren. */
export function riwayatLaporan(db, gunung, batas = 28) {
  return db
    .prepare(`SELECT json FROM laporan WHERE gunung = ? ORDER BY waktu_laporan DESC LIMIT ?`)
    .all(gunung, batas)
    .map((r) => JSON.parse(r.json))
    .reverse();
}

export function simpanUdara(db, kotaId, titik) {
  const s = db.prepare(
    `INSERT INTO udara (kota_id, waktu, pm25, pm10, so2, ispu) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kota_id, waktu) DO UPDATE SET pm25=excluded.pm25, pm10=excluded.pm10`
  );
  for (const t of titik) s.run(kotaId, t.t, t.pm2_5 ?? null, t.pm10 ?? null, t.so2 ?? null, t.ispu ?? null);
}

export function simpanPos(db, daftar) {
  const s = db.prepare(
    `INSERT INTO pos (tautan, kanal, judul, sumber, waktu, diambil) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(tautan) DO NOTHING`
  );
  const now = new Date().toISOString();
  let baru = 0;
  for (const p of daftar) {
    if (!p.tautan || !p.waktu) continue;
    baru += s.run(p.tautan, p.kanal, p.judul, p.sumber ?? null, p.waktu, now).changes;
  }
  return baru;
}

export function catatSumber(db, nama, ok, pesan) {
  db.prepare(`INSERT OR REPLACE INTO sumber_status (nama, waktu, ok, pesan) VALUES (?, ?, ?, ?)`)
    .run(nama, new Date().toISOString(), ok ? 1 : 0, pesan ?? null);
}

/** Berapa lama sumber ini sudah gagal berturut-turut — untuk peringatan data basi. */
export function riwayatSumber(db, nama, batas = 20) {
  return db
    .prepare(`SELECT waktu, ok, pesan FROM sumber_status WHERE nama = ? ORDER BY waktu DESC LIMIT ?`)
    .all(nama, batas);
}

// ── Potret terkini: satu berkas JSON, ditulis atomik ───────────────────────
export function tulisPotret(dir, potret) {
  mkdirSync(dir, { recursive: true });
  const akhir = join(dir, 'terkini.json');
  const sementara = `${akhir}.tmp`;
  writeFileSync(sementara, JSON.stringify(potret));
  renameSync(sementara, akhir); // ganti atomik: pembaca tak pernah lihat berkas separuh
}

export function bacaPotret(dir) {
  const p = join(dir, 'terkini.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}
