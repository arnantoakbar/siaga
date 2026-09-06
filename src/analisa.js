// Mesin analisa berbasis aturan. Tanpa LLM, tanpa tebakan.
// Setiap keluaran membawa `dasar` (aturan mana yang jalan) dan `sumber` (dari mana angkanya),
// supaya siapa pun bisa memeriksa ulang. Kalau data sumbernya tidak ada, keluarannya
// null — bukan diisi nilai default yang kelihatan meyakinkan.
import { jarakKm, arahDerajat, bedaSudut, mataAngin } from './util.js';

export const URUTAN = ['aman', 'waspada', 'siaga', 'bahaya'];
const lebihTinggi = (a, b) => (URUTAN.indexOf(a) >= URUTAN.indexOf(b) ? a : b);

/** ISPU satu parameter, interpolasi linier antar titik patah (Permen LHK P.14/2020). */
export function hitungIspu(nilai, titikPatah) {
  if (nilai == null || !Number.isFinite(nilai)) return null;
  for (const t of titikPatah) {
    if (nilai <= t.xAtas) {
      const span = t.xAtas - t.xBawah;
      const i = span === 0 ? t.iAtas : ((t.iAtas - t.iBawah) / span) * (nilai - t.xBawah) + t.iBawah;
      return Math.round(Math.max(0, i));
    }
  }
  return 500; // di atas titik patah tertinggi
}

/** ISPU gabungan: parameter dominan menentukan, sesuai definisi ISPU. */
export function ispuGabungan(rata24j, ambang) {
  const per = {};
  for (const [kunci, tp] of Object.entries(ambang.ispuTitikPatah)) {
    per[kunci] = hitungIspu(rata24j?.[kunci], tp);
  }
  const ada = Object.entries(per).filter(([, v]) => v != null);
  if (!ada.length) return null;
  const [dominan, nilai] = ada.reduce((a, b) => (b[1] > a[1] ? b : a));
  const kat = ambang.ispuKategori.find((k) => nilai <= k.sampai) ?? ambang.ispuKategori.at(-1);
  return { nilai, dominan, kategori: kat.nama, status: kat.status, perParameter: per };
}

/** Radius larangan diambil dari teks rekomendasi PVMBG, bukan dari angka yang kita karang. */
export function radiusResmiKm(rekomendasi = []) {
  for (const r of rekomendasi) {
    const m = r.match(/radius\s+(\d+(?:[.,]\d+)?)\s*km/i);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return null;
}

/**
 * Apakah kota berada di jalur sebaran abu?
 * Dicek terhadap SETIAP lapisan angin, karena arah angin berbeda-beda per ketinggian —
 * abu di 3 km bisa ke tenggara sementara abu di 10 km ke barat.
 */
export function jalurAbu(arahKota, jarak, angin, ambang) {
  if (!angin?.lapisan?.length || jarak > ambang.jangkauanAbuKm) return null;
  const kena = angin.lapisan
    .map((l) => ({ ...l, selisih: bedaSudut(arahKota, l.arahHembusDerajat) }))
    .filter((l) => l.selisih <= ambang.sektorToleransiDerajat)
    .sort((a, b) => a.selisih - b.selisih);
  return kena.length ? { lapisan: kena, terdekat: kena[0] } : null;
}

function tindakan(teks, dasar, sumber, prioritas) {
  return { teks, dasar, sumber, prioritas };
}

/** Analisa satu kota. */
export function analisaKota(kota, gunung, laporan, udara, angin, ambang) {
  const jarak = Math.round(jarakKm(gunung.lat, gunung.lon, kota.lat, kota.lon));
  const arah = Math.round(arahDerajat(gunung.lat, gunung.lon, kota.lat, kota.lon));
  const radius = radiusResmiKm(laporan?.rekomendasi);
  const ispu = udara?.rata24j ? ispuGabungan(udara.rata24j, ambang) : null;
  const abu = jalurAbu(arah, jarak, angin, ambang);

  const alasan = [];
  let status = 'aman';

  if (radius != null && jarak <= radius) {
    status = lebihTinggi(status, 'bahaya');
    alasan.push({
      kode: 'zona-dilarang',
      teks: `${kota.nama} berada di dalam radius larangan ${radius} km dari kawah.`,
      sumber: 'PVMBG',
    });
  }

  if (ispu) {
    status = lebihTinggi(status, ispu.status);
    alasan.push({
      kode: 'ispu',
      teks: `ISPU ${ispu.nilai} (${ispu.kategori}), ditentukan oleh ${ispu.dominan.toUpperCase().replace('_', '.')}.`,
      sumber: 'Open-Meteo CAMS (model, bukan sensor darat)',
    });
  }

  if (abu) {
    status = lebihTinggi(status, 'waspada');
    const l = abu.terdekat;
    alasan.push({
      kode: 'jalur-abu',
      teks: `Angin di ketinggian ~${l.kmKira} km menghembus ke ${mataAngin(l.arahHembusDerajat)} (${Math.round(l.arahHembusDerajat)}°), searah posisi ${kota.nama}. Selisih ${Math.round(l.selisih)}°.`,
      sumber: 'Open-Meteo (angin lapisan tekanan)',
    });
  }

  // ── Susun tindakan, paling mendesak di atas ────────────────────────────
  const langkah = [];
  if (radius != null && jarak <= radius)
    for (const t of ambang.tindakanZonaDilarang)
      langkah.push(tindakan(t, `Jarak ${jarak} km, di dalam radius larangan ${radius} km`, 'PVMBG', 1));

  for (const r of laporan?.rekomendasi || [])
    langkah.push(tindakan(r, `Rekomendasi resmi pada laporan ${laporan.tanggal} periode ${laporan.periodeMulai}-${laporan.periodeSelesai} WIB`, 'PVMBG', 1));

  if (ispu)
    for (const t of ambang.tindakanIspu[ispu.kategori] || [])
      langkah.push(tindakan(t, `ISPU ${ispu.nilai} — ${ispu.kategori}`, 'Permen LHK P.14/2020', ispu.status === 'aman' ? 4 : 2));

  if (abu || (ispu && ispu.status !== 'aman'))
    for (const t of ambang.tindakanAbu)
      langkah.push(tindakan(t, abu ? 'Kota berada di jalur sebaran abu' : 'Kualitas udara terpengaruh abu', 'IVHHN / Kemenkes', 3));

  return {
    kotaId: kota.id,
    nama: kota.nama,
    provinsi: kota.provinsi,
    lat: kota.lat,
    lon: kota.lon,
    jarakKm: jarak,
    arahDerajat: arah,
    arahMata: mataAngin(arah),
    status,
    ispu,
    diJalurAbu: !!abu,
    jalurAbu: abu,
    udaraKini: udara?.kini ?? null,
    udaraRata24j: udara?.rata24j ?? null,
    deretUdara: udara?.deret ?? [],
    alasan,
    langkah: langkah
      .sort((a, b) => a.prioritas - b.prioritas)
      .filter((t, i, arr) => arr.findIndex((x) => x.teks === t.teks) === i),
  };
}

/**
 * Ringkasan situasi gunung — kalimat pendek yang dirangkai dari angka, bukan opini.
 *
 * Level diambil dari tabel tingkat aktivitas kalau tersedia, karena tabel itu
 * halaman terpisah dari laporan pengamatan: saat salah satu gagal diambil,
 * yang satunya masih bisa memberi status. Level yang salah lebih berbahaya
 * daripada rincian yang hilang.
 */
export function ringkasGunung(barisGunung, laporan, harian, angin, ambang) {
  if (!laporan) {
    if (!barisGunung) return null;
    const lv = ambang.level[barisGunung.level];
    return {
      level: barisGunung.level,
      levelNama: lv?.nama ?? barisGunung.levelNama,
      tingkat: lv?.tingkat ?? null,
      status: lv?.status ?? null,
      radiusLaranganKm: null,
      totalGempa: null,
      gempaLetusan: null,
      adaTremor: null,
      poin: [`Status ${barisGunung.gunung}: Level ${barisGunung.level} (${lv?.nama ?? barisGunung.levelNama}).`],
      visual: harian?.visual ?? null,
      keterangan: null,
      ringkasHarian: harian?.visual ?? null,
      tanpaLaporan: true,
    };
  }
  const lv = ambang.level[barisGunung?.level ?? laporan.level];
  const erupsi = (laporan.kegempaan || []).find((k) => /letusan|erupsi/i.test(k.jenis));
  const totalGempa = (laporan.kegempaan || []).reduce((a, k) => a + k.jumlah, 0);
  const tremor = (laporan.kegempaan || []).find((k) => /tremor/i.test(k.jenis));

  const poin = [];
  const lvKode = barisGunung?.level ?? laporan.level;
  poin.push(`Status ${laporan.gunung}: Level ${lvKode} (${lv?.nama ?? laporan.levelNama}).`);
  if (erupsi) poin.push(`Tercatat ${erupsi.jumlah} gempa letusan dalam periode ${laporan.periodeMulai}–${laporan.periodeSelesai} WIB.`);
  else poin.push(`Tidak ada gempa letusan tercatat pada periode ${laporan.periodeMulai}–${laporan.periodeSelesai} WIB.`);
  if (tremor) poin.push('Tremor menerus masih terekam, artinya magma masih bergerak di bawah kawah.');
  if (laporan.keterangan) poin.push(laporan.keterangan);
  if (angin?.lapisan?.length) {
    const l = angin.lapisan.reduce((a, b) => (b.kecepatanKmj > a.kecepatanKmj ? b : a));
    poin.push(`Angin terkuat di ketinggian ~${l.kmKira} km, ${Math.round(l.kecepatanKmj)} km/jam menghembus ke ${mataAngin(l.arahHembusDerajat)}.`);
  }
  return {
    level: lvKode,
    levelNama: lv?.nama ?? laporan.levelNama,
    tingkat: lv?.tingkat ?? null,
    status: lv?.status ?? null,
    radiusLaranganKm: radiusResmiKm(laporan.rekomendasi),
    totalGempa,
    gempaLetusan: erupsi?.jumlah ?? 0,
    adaTremor: !!tremor,
    poin,
    visual: laporan.visual,
    keterangan: laporan.keterangan,
    ringkasHarian: harian?.visual ?? null,
  };
}
