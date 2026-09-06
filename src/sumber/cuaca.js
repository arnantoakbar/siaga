// Open-Meteo — gratis, tanpa kunci, tanpa batas untuk pemakaian non-komersial.
// Dua peran:
//   1. Kualitas udara per kota (PM2.5 / PM10 / SO2) -> dasar penghitungan ISPU.
//   2. Angin pada beberapa ketinggian di atas kawah -> arah sebaran abu.
// Angin permukaan TIDAK dipakai untuk sebaran abu: kolom erupsi belasan kilometer
// digerakkan angin lapisan atas, dan arahnya sering berlawanan dengan angin 10 m.
import { ambil } from '../util.js';

const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const FC = 'https://api.open-meteo.com/v1/forecast';

/** Rata-rata bergerak 24 jam terakhir — satuan yang dipakai ISPU. */
function rata24(waktu, nilai, sampai = Date.now()) {
  const batas = sampai - 24 * 3600e3;
  const pakai = [];
  for (let i = 0; i < waktu.length; i++) {
    const t = new Date(waktu[i]).getTime();
    if (t <= sampai && t >= batas && nilai[i] != null) pakai.push(nilai[i]);
  }
  if (!pakai.length) return null;
  return +(pakai.reduce((a, b) => a + b, 0) / pakai.length).toFixed(1);
}

/**
 * Kualitas udara banyak kota dalam satu permintaan.
 * Open-Meteo menerima daftar koordinat dipisah koma dan membalas array.
 */
export async function kualitasUdara(kota) {
  const q = new URLSearchParams({
    latitude: kota.map((k) => k.lat).join(','),
    longitude: kota.map((k) => k.lon).join(','),
    hourly: 'pm10,pm2_5,sulphur_dioxide',
    current: 'pm10,pm2_5,sulphur_dioxide',
    past_days: '1',
    forecast_days: '1',
    timezone: 'UTC',
  });
  const j = await ambil(`${AQ}?${q}`, { json: true });
  const arr = Array.isArray(j) ? j : [j];
  const sekarang = Date.now();
  return kota.map((k, i) => {
    const d = arr[i];
    if (!d?.hourly) return { kotaId: k.id, gagal: true };
    return {
      kotaId: k.id,
      waktuData: d.current?.time ? `${d.current.time}Z` : null,
      kini: {
        pm2_5: d.current?.pm2_5 ?? null,
        pm10: d.current?.pm10 ?? null,
        so2: d.current?.sulphur_dioxide ?? null,
      },
      rata24j: {
        pm2_5: rata24(d.hourly.time, d.hourly.pm2_5, sekarang),
        pm10: rata24(d.hourly.time, d.hourly.pm10, sekarang),
        so2: rata24(d.hourly.time, d.hourly.sulphur_dioxide, sekarang),
      },
      // deret 24 jam untuk grafik; dipangkas ke titik yang sudah lewat saja
      deret: d.hourly.time
        .map((t, n) => ({ t: `${t}Z`, pm2_5: d.hourly.pm2_5[n], pm10: d.hourly.pm10[n] }))
        .filter((p) => {
          const ms = new Date(p.t).getTime();
          return ms <= sekarang && ms >= sekarang - 24 * 3600e3;
        }),
    };
  });
}

// Ketinggian geopotensial kasar tiap lapisan tekanan, untuk label yang bisa dipahami orang.
const LAPISAN = [
  { hPa: 850, kmKira: 1.5, label: 'Rendah' },
  { hPa: 700, kmKira: 3, label: 'Menengah' },
  { hPa: 500, kmKira: 5.5, label: 'Tinggi' },
  { hPa: 250, kmKira: 10.5, label: 'Puncak kolom' },
];

/** Angin di atas kawah per lapisan. Arah dilaporkan sebagai arah TUJUAN hembusan abu. */
export async function anginKolom(lat, lon) {
  const vars = LAPISAN.flatMap((l) => [`wind_speed_${l.hPa}hPa`, `wind_direction_${l.hPa}hPa`]);
  const q = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: [...vars, 'wind_speed_10m', 'wind_direction_10m'].join(','),
    timezone: 'UTC',
  });
  const j = await ambil(`${FC}?${q}`, { json: true });
  const c = j.current;
  return {
    waktuData: c.time ? `${c.time}Z` : null,
    permukaan: {
      kecepatanKmj: c.wind_speed_10m,
      // Open-Meteo melaporkan arah ASAL angin; sebaran abu bergerak ke arah sebaliknya.
      arahHembusDerajat: (c.wind_direction_10m + 180) % 360,
    },
    lapisan: LAPISAN.map((l) => ({
      ...l,
      kecepatanKmj: c[`wind_speed_${l.hPa}hPa`],
      arahAsalDerajat: c[`wind_direction_${l.hPa}hPa`],
      arahHembusDerajat: (c[`wind_direction_${l.hPa}hPa`] + 180) % 360,
    })).filter((l) => l.kecepatanKmj != null),
  };
}
