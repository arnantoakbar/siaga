// BMKG — endpoint JSON publik, tanpa kunci.
// Dipakai untuk memisahkan gempa tektonik (urusan BMKG) dari gempa vulkanik
// di seismograf Anak Krakatau (urusan PVMBG). Dua hal berbeda yang sering tertukar.
import { ambil } from '../util.js';

const BASE = 'https://data.bmkg.go.id/DataMKG/TEWS';

/** "-6.10,105.42" atau "1.05,98.41" -> [lat, lon] */
function koordinat(s = '') {
  const [a, b] = s.split(',').map((n) => parseFloat(n));
  return Number.isFinite(a) && Number.isFinite(b) ? [a, b] : [null, null];
}

function rapikan(g) {
  const [lat, lon] = koordinat(g.Coordinates);
  return {
    waktu: g.DateTime,
    magnitudo: parseFloat(g.Magnitude),
    kedalamanKm: parseInt(g.Kedalaman, 10),
    lat,
    lon,
    wilayah: g.Wilayah,
    dirasakan: g.Dirasakan || null,
    potensi: g.Potensi || null,
  };
}

/** Gempa terbaru + 15 gempa terkini M>=5.0 + gempa yang dirasakan warga. */
export async function gempa() {
  const [auto, terkini, dirasakan] = await Promise.allSettled([
    ambil(`${BASE}/autogempa.json`, { json: true }),
    ambil(`${BASE}/gempaterkini.json`, { json: true }),
    ambil(`${BASE}/gempadirasakan.json`, { json: true }),
  ]);
  const amanArr = (r, k) =>
    r.status === 'fulfilled' ? (r.value?.Infogempa?.[k] || []).map(rapikan) : [];
  return {
    terbaru: auto.status === 'fulfilled' ? rapikan(auto.value.Infogempa.gempa) : null,
    terkini: amanArr(terkini, 'gempa'),
    dirasakan: amanArr(dirasakan, 'gempa'),
  };
}
