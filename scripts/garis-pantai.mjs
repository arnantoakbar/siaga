// Membuat public/coastline.json dari Natural Earth ne_10m_land.
// Dijalankan sekali saat kotak peta berubah, bukan bagian dari layanan.
//
//   node scripts/garis-pantai.mjs [barat] [selatan] [timur] [utara]
//
// Bawaannya kotak Selat Sunda + Jawa Barat, menghasilkan sekitar 7 KB.
import { writeFileSync } from 'node:fs';

const SUMBER = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson';
const [W, S, E, N] = (process.argv.slice(2).map(Number).length === 4
  ? process.argv.slice(2).map(Number)
  : [103.6, -8.4, 109.2, -4.2]);
const PAD = 0.5;
const EPS = 0.006; // toleransi penyederhanaan dalam derajat

/** Potong cincin ke kotak; keluar kotak berarti garis diputus jadi ruas baru. */
function potong(ring) {
  const ruas = [];
  let kini = [];
  for (const [x, y] of ring) {
    if (x >= W - PAD && x <= E + PAD && y >= S - PAD && y <= N + PAD) kini.push([x, y]);
    else {
      if (kini.length > 2) ruas.push(kini);
      kini = [];
    }
  }
  if (kini.length > 2) ruas.push(kini);
  return ruas;
}

/** Ramer–Douglas–Peucker, iteratif supaya tidak menumpuk tumpukan panggilan. */
function sederhanakan(titik, eps) {
  const simpan = new Array(titik.length).fill(false);
  simpan[0] = simpan[titik.length - 1] = true;
  const tumpuk = [[0, titik.length - 1]];
  while (tumpuk.length) {
    const [i, j] = tumpuk.pop();
    if (j <= i + 1) continue;
    const [x1, y1] = titik[i];
    const [x2, y2] = titik[j];
    const dx = x2 - x1;
    const dy = y2 - y1;
    let maks = 0;
    let idx = i;
    for (let k = i + 1; k < j; k++) {
      const [x, y] = titik[k];
      let d;
      if (dx === 0 && dy === 0) d = Math.hypot(x - x1, y - y1);
      else {
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
        d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      }
      if (d > maks) { maks = d; idx = k; }
    }
    if (maks > eps) { simpan[idx] = true; tumpuk.push([i, idx], [idx, j]); }
  }
  return titik.filter((_, i) => simpan[i]);
}

console.log('mengunduh Natural Earth ne_10m_land…');
const geo = await fetch(SUMBER).then((r) => {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
});

const garis = [];
for (const f of geo.features) {
  const poligon = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poli of poligon)
    for (const ring of poli)
      for (const ruas of potong(ring)) {
        const halus = sederhanakan(ruas, EPS);
        if (halus.length > 2) garis.push(halus.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]));
      }
}

const keluar = JSON.stringify({ bbox: [W, S, E, N], lines: garis });
writeFileSync(new URL('../public/coastline.json', import.meta.url), keluar);
console.log(`${garis.length} ruas, ${garis.reduce((a, r) => a + r.length, 0)} titik, ${(keluar.length / 1024).toFixed(1)} KB`);
