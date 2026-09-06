// Uji mandiri tanpa framework: `node test.js`.
// Fokus pada logika yang kalau salah bikin orang salah ambil keputusan —
// perhitungan ISPU, pembacaan radius larangan, arah sebaran abu, dan parser MAGMA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jarakKm, arahDerajat, bedaSudut, mataAngin, keTeks } from './src/util.js';
import { hitungIspu, ispuGabungan, radiusResmiKm, jalurAbu, analisaKota } from './src/analisa.js';
import { keWaktuISO, bagian } from './src/sumber/magma.js';
import { relevan } from './src/kumpul.js';

const ambang = JSON.parse(readFileSync(new URL('./config/ambang.json', import.meta.url)));
const tp = ambang.ispuTitikPatah;
let n = 0;
const uji = (nama, fn) => { fn(); n++; console.log('  ok —', nama); };

console.log('\nGeo');
uji('jarak Krakatau→Jakarta ±10 km dari 158 km', () => {
  const d = jarakKm(-6.102, 105.423, -6.209, 106.846);
  assert.ok(Math.abs(d - 158) < 10, `dapat ${d}`);
});
uji('arah Krakatau→Jakarta kira-kira timur', () => {
  assert.equal(mataAngin(arahDerajat(-6.102, 105.423, -6.209, 106.846)), 'timur');
});
uji('bedaSudut menyeberang 0°', () => {
  assert.equal(bedaSudut(350, 10), 20);
  assert.equal(bedaSudut(10, 350), 20);
  assert.equal(bedaSudut(270, 90), 180);
});

console.log('\nISPU — titik patah Permen LHK P.14/2020');
uji('batas atas tiap kategori PM2.5 pas di angka indeksnya', () => {
  assert.equal(hitungIspu(15.5, tp.pm2_5), 50);
  assert.equal(hitungIspu(55.4, tp.pm2_5), 100);
  assert.equal(hitungIspu(150.4, tp.pm2_5), 200);
  assert.equal(hitungIspu(250.4, tp.pm2_5), 300);
});
uji('batas atas PM10', () => {
  assert.equal(hitungIspu(50, tp.pm10), 50);
  assert.equal(hitungIspu(150, tp.pm10), 100);
  assert.equal(hitungIspu(350, tp.pm10), 200);
});
uji('interpolasi di tengah rentang', () => {
  // PM2.5 65.2 ug/m3 -> (200-101)/(150.4-55.5)*(65.2-55.5)+101 = 111
  assert.equal(hitungIspu(65.2, tp.pm2_5), 111);
});
uji('di atas titik patah tertinggi tetap dibatasi 500', () => {
  assert.equal(hitungIspu(9999, tp.pm2_5), 500);
});
uji('nilai kosong menghasilkan null, bukan 0', () => {
  assert.equal(hitungIspu(null, tp.pm2_5), null);
  assert.equal(hitungIspu(undefined, tp.pm2_5), null);
  assert.equal(ispuGabungan({}, ambang), null);
});
uji('parameter dominan yang menentukan ISPU gabungan', () => {
  const g = ispuGabungan({ pm2_5: 10, pm10: 300, so2: 5 }, ambang);
  assert.equal(g.dominan, 'pm10');
  assert.equal(g.kategori, 'Tidak Sehat');
  assert.equal(g.status, 'siaga');
});

console.log('\nRadius larangan — dibaca dari teks PVMBG');
uji('menangkap "radius 3 km"', () => {
  assert.equal(
    radiusResmiKm(['Masyarakat tidak mendekati G. Anak Krakatau atau beraktivitas dalam radius 3 km dari kawah aktif.']),
    3
  );
});
uji('menangkap desimal koma', () => {
  assert.equal(radiusResmiKm(['dalam radius 2,5 km dari kawah']), 2.5);
});
uji('tanpa radius menghasilkan null, bukan angka karangan', () => {
  assert.equal(radiusResmiKm(['Waspada terhadap hujan abu.']), null);
  assert.equal(radiusResmiKm([]), null);
});

console.log('\nJalur sebaran abu');
const anginKe90 = { lapisan: [{ hPa: 700, kmKira: 3, kecepatanKmj: 20, arahHembusDerajat: 90 }] };
uji('kota tepat searah hembusan kena', () => {
  assert.ok(jalurAbu(94, 158, anginKe90, ambang));
});
uji('kota di luar sektor toleransi tidak kena', () => {
  assert.equal(jalurAbu(200, 158, anginKe90, ambang), null);
});
uji('kota di luar jangkauan tidak kena walau searah', () => {
  assert.equal(jalurAbu(90, 999, anginKe90, ambang), null);
});
uji('tanpa data angin menghasilkan null', () => {
  assert.equal(jalurAbu(90, 100, null, ambang), null);
  assert.equal(jalurAbu(90, 100, { lapisan: [] }, ambang), null);
});

console.log('\nWaktu MAGMA (WIB → UTC)');
uji('06 September 2026 06:00 WIB = 2026-09-05T23:00Z', () => {
  assert.equal(keWaktuISO('06 September 2026', '06:00'), '2026-09-05T23:00:00.000Z');
});
uji('bulan tak dikenal menghasilkan null', () => {
  assert.equal(keWaktuISO('06 Sept 2026', '06:00'), null);
});

console.log('\nParser HTML');
uji('keTeks membuang script dan menormalkan spasi', () => {
  const b = keTeks('<div>Halo <script>var x=1;</script> <b>dunia</b></div><p>baris dua</p>');
  assert.deepEqual(b, ['Halo dunia', 'baris dua']);
});

console.log('\nBagian laporan MAGMA');
uji('footer situs tidak ikut jadi rekomendasi keselamatan', () => {
  const sec = bagian([
    'Rekomendasi',
    'Masyarakat tidak beraktivitas dalam radius 3 km dari kawah aktif.',
    'Copyright 2026 © All Rights Reserved. MAGMA Indonesia',
    'Dibuat oleh:',
    'Pusat Vulkanologi dan Mitigasi Bencana Geologi',
  ]);
  assert.deepEqual(sec['Rekomendasi'], ['Masyarakat tidak beraktivitas dalam radius 3 km dari kawah aktif.']);
});
uji('tiap bagian berhenti di label berikutnya', () => {
  const sec = bagian(['Pengamatan Visual', 'kabut tebal', 'Pengamatan Kegempaan', '2 kali gempa Hembusan']);
  assert.deepEqual(sec['Pengamatan Visual'], ['kabut tebal']);
  assert.deepEqual(sec['Pengamatan Kegempaan'], ['2 kali gempa Hembusan']);
});

console.log('\nSaringan relevansi media sosial');
const KUNCI = ['anak krakatau', 'krakatau', 'abu vulkanik', 'erupsi', 'gunung api', 'vulkanik'];
uji('laporan gempa rutin BMKG tidak lolos', () => {
  assert.equal(
    relevan({ kanal: 'x', judul: '#Gempa Mag:2.1, 06-Sep-2026 08:53:26WIB, Lok:8.70LS, 119.78BT' }, KUNCI),
    false
  );
});
uji('pengumuman soal gunungnya lolos', () => {
  assert.ok(relevan({ kanal: 'x', judul: '🚨 UPDATE KONDISI TERKINI GUNUNG ANAK KRAKATAU 🚨' }, KUNCI));
  assert.ok(relevan({ kanal: 'x', judul: 'Sebaran abu vulkanik meluas hingga Jakarta' }, KUNCI));
});
uji('berita tidak disaring ulang — sudah tersaring di kueri sumbernya', () => {
  assert.ok(relevan({ kanal: 'berita', judul: 'apa pun' }, KUNCI));
});

console.log('\nAnalisa kota — ujung ke ujung');
const gunung = { lat: -6.102, lon: 105.423 };
const laporan = {
  tanggal: '06 September 2026', periodeMulai: '00:00', periodeSelesai: '06:00',
  rekomendasi: ['Masyarakat tidak beraktivitas dalam radius 3 km dari kawah aktif.'],
};
uji('kota di dalam radius larangan berstatus bahaya', () => {
  const a = analisaKota(
    { id: 'x', nama: 'Pulau Sebesi', lat: -5.96, lon: 105.48 },
    gunung, laporan, null, null, ambang
  );
  assert.ok(a.jarakKm <= 20);
  // pulau ini >3 km, jadi bukan bahaya — yang diuji: aturan tidak salah menaikkan status
  assert.equal(a.status, 'aman');
  const dekat = analisaKota({ id: 'y', nama: 'Kawah', lat: -6.11, lon: 105.43 }, gunung, laporan, null, null, ambang);
  assert.equal(dekat.status, 'bahaya');
  assert.ok(dekat.alasan.some((r) => r.kode === 'zona-dilarang'));
});
uji('udara tidak sehat menaikkan status ke siaga', () => {
  const a = analisaKota(
    { id: 'jkt', nama: 'Jakarta', lat: -6.209, lon: 106.846 },
    gunung, laporan, { rata24j: { pm2_5: 65.2, pm10: 70, so2: 40 } }, null, ambang
  );
  assert.equal(a.status, 'siaga');
  assert.equal(a.ispu.nilai, 111);
  assert.ok(a.langkah.some((t) => /N95/.test(t.teks)));
});
uji('setiap langkah punya dasar dan sumber yang bisa diperiksa', () => {
  const a = analisaKota(
    { id: 'jkt', nama: 'Jakarta', lat: -6.209, lon: 106.846 },
    gunung, laporan, { rata24j: { pm2_5: 65.2 } }, null, ambang
  );
  assert.ok(a.langkah.length > 0);
  for (const t of a.langkah) {
    assert.ok(t.dasar && t.sumber, `langkah tanpa dasar/sumber: ${t.teks}`);
  }
});
uji('tanpa data sama sekali tetap aman dan tidak melempar error', () => {
  const a = analisaKota({ id: 'z', nama: 'Entah', lat: 0, lon: 0 }, gunung, null, null, null, ambang);
  assert.equal(a.status, 'aman');
  assert.equal(a.ispu, null);
  assert.deepEqual(a.langkah, []);
});

console.log(`\n${n} pemeriksaan lolos.\n`);
