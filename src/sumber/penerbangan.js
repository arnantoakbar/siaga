// Cuaca penerbangan dari Aviation Weather Center (NOAA/NWS) — gratis, tanpa kunci.
//
// AWC menyalurkan ulang pertukaran OPMET dunia, jadi laporan Indonesia yang keluar
// dari sini tetap terbitan Indonesia: METAR ditulis stasiun meteorologi BMKG di
// bandara yang bersangkutan, dan SIGMET abu untuk FIR Jakarta diterbitkan kantor
// meteorologi penerbangan Jakarta (berkode WIII). Nama penerbitnya ada di dalam
// teks mentah, dan teks mentah itu ikut dibawa sampai ke layar supaya bisa dicek.
//
// Yang TIDAK ada di sini: NOTAM. Pengumuman resmi "bandara ditutup" berjalan lewat
// NOTAM, dan tidak ada saluran NOTAM Indonesia yang bisa dibaca gratis tanpa kunci —
// sudah dicoba: API NOTAM FAA menjawab 401 tanpa kunci, notams.aim.faa.gov menolak
// dengan 403, dan alamat AIS Indonesia (aim.dephub.go.id) tidak beralamat sama sekali.
// Karena itu berkas ini tidak pernah menyimpulkan sebuah bandara buka atau tutup.
// Yang dilaporkan hanya apa yang benar-benar diamati dan diperingatkan.
import { ambil } from '../util.js';

const AWC = 'https://aviationweather.gov/api/data';

/** Arah pergerakan pada SIGMET ditulis singkatan Inggris. */
const ARAH = {
  N: 'utara', NE: 'timur laut', E: 'timur', SE: 'tenggara',
  S: 'selatan', SW: 'barat daya', W: 'barat', NW: 'barat laut',
};

/**
 * SIGMET abu vulkanik yang masih berlaku untuk FIR yang diminta.
 *
 * SIGMET adalah peringatan cuaca berbahaya untuk penerbangan. Yang jenis VA
 * berarti ada awan abu vulkanik teramati di wilayah udara itu, lengkap dengan
 * batas areanya, ketinggiannya, dan ke mana ia bergerak.
 */
export async function sigmetAbu(fir = []) {
  const semua = await ambil(`${AWC}/isigmet?format=json`, { json: true });
  const kini = Date.now() / 1000;
  return semua
    .filter((s) => s.hazard === 'VA' && fir.includes(s.firId) && (!s.validTimeTo || s.validTimeTo > kini))
    .map((s) => ({
      fir: s.firId,
      firNama: s.firName,
      nomor: s.seriesId,
      gunung: s.qualifier || null,
      // base/top dalam kaki; SFC ditulis 0 oleh AWC.
      dasarKaki: s.base ?? null,
      puncakKaki: s.top ?? null,
      arah: s.dir || null,
      arahTeks: ARAH[s.dir] || null,
      kecepatanKnot: s.spd ? Number(s.spd) : null,
      mulai: s.validTimeFrom ? new Date(s.validTimeFrom * 1000).toISOString() : null,
      sampai: s.validTimeTo ? new Date(s.validTimeTo * 1000).toISOString() : null,
      // Poligon area abu. Dipakai untuk menguji bandara mana yang ada di dalamnya.
      titik: s.geom === 'AREA' && Array.isArray(s.coords) ? s.coords.map((c) => ({ lat: c.lat, lon: c.lon })) : [],
      teksAsli: s.rawSigmet || null,
    }));
}

const CUACA = {
  VA: 'abu vulkanik', HZ: 'kabut asap', BR: 'kabut tipis', FG: 'kabut tebal',
  FU: 'asap', DU: 'debu', SA: 'pasir', RA: 'hujan', DZ: 'gerimis', SN: 'salju',
  TS: 'badai petir', SH: 'hujan lokal', SQ: 'angin kencang mendadak', GR: 'hujan es',
};

/** Satu sandi cuaca METAR jadi kalimat Indonesia. Sandi tak dikenal dilewati. */
export function jelasCuaca(sandi = '') {
  return sandi
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      let akhiran = '';
      let sisa = t;
      if (sisa[0] === '-') { akhiran = ' ringan'; sisa = sisa.slice(1); }
      else if (sisa[0] === '+') { akhiran = ' lebat'; sisa = sisa.slice(1); }
      if (sisa.startsWith('VC')) { akhiran += ' di sekitar bandara'; sisa = sisa.slice(2); }
      const bagian = (sisa.match(/.{2}/g) || []).map((k) => CUACA[k]).filter(Boolean);
      return bagian.length ? bagian.join(' disertai ') + akhiran : null;
    })
    .filter(Boolean);
}

/**
 * Jarak pandang dari teks METAR mentah, dalam meter.
 *
 * Diambil dari teks asli, bukan dari ruas `visib` AWC yang sudah dialihkan ke mil
 * darat: METAR Indonesia menulis meter, dan 9999 punya arti baku "10 km atau lebih".
 * Membaca angka aslinya menghindari pembulatan dua kali.
 */
export function pandangMeter(teks = '') {
  if (/\bCAVOK\b/.test(teks)) return { meter: 10000, atauLebih: true };
  const m = teks.match(/\d{3}\d{2}(?:G\d{2,3})?KT(?:\s+\d{3}V\d{3})?\s+(\d{4})\b/);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 9999 ? { meter: 10000, atauLebih: true } : { meter: n, atauLebih: false };
}

/** METAR terakhir tiap bandara. Satu permintaan untuk semua kode sekaligus. */
export async function metar(kode = []) {
  if (!kode.length) return [];
  const j = await ambil(`${AWC}/metar?ids=${kode.join(',')}&format=json`, { json: true });
  return (Array.isArray(j) ? j : []).map((x) => ({
    icao: x.icaoId,
    waktu: x.reportTime ? new Date(`${x.reportTime.replace(' ', 'T')}${/Z$/.test(x.reportTime) ? '' : 'Z'}`).toISOString() : null,
    cuacaKode: x.wxString || '',
    cuaca: jelasCuaca(x.wxString || ''),
    pandang: pandangMeter(x.rawOb || ''),
    // Kategori penerbangan dihitung NOAA dari jarak pandang dan tinggi awan.
    kategori: x.fltCat || null,
    anginDerajat: x.wdir ?? null,
    anginKnot: x.wspd ?? null,
    teksAsli: x.rawOb || null,
  }));
}
