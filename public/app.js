// Siaga — lapisan tampilan. Tanpa kerangka kerja, tanpa langkah build.
// Semua angka datang dari /api/terkini; berkas ini tidak pernah menghitung ulang
// status atau mengarang nilai pengganti saat data kosong — yang kosong ditulis kosong.
//
// Halaman dibagi empat tampilan yang mengikuti urutan pertanyaan pembaca:
// apa yang terjadi (situasi) → di mana aku (lokasi) → artinya buat aku (dampak) →
// dari mana angkanya (sumber). Hanya satu tampilan aktif, jadi tidak ada gulungan panjang.

const $ = (s, akar = document) => akar.querySelector(s);
const $$ = (s, akar = document) => [...akar.querySelectorAll(s)];
const NS = 'http://www.w3.org/2000/svg';

const el = (tag, atr = {}, anak = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atr)) if (v != null) n.setAttribute(k, v);
  for (const a of [].concat(anak)) n.append(a);
  return n;
};
const html = (tag, atr = {}, isi) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(atr)) if (v != null) n.setAttribute(k, v);
  if (isi != null) n.innerHTML = isi;
  return n;
};

/** Lebar wadah dalam piksel — grafik digambar 1 unit = 1 piksel supaya
 *  ukuran teks di dalam SVG sama persis dengan ukuran teks di luar SVG. */
const lebarWadah = (sel, cadangan = 360) => {
  const n = document.querySelector(sel);
  return Math.max(300, Math.min(900, Math.round(n?.clientWidth || cadangan)));
};

// Kelas `ikon` wajib ikut: ia yang memberi ukuran bawaan. SVG tanpa width/height
// diberi 300x150 oleh peramban, dan dengan `svg { display: block }` global ikon
// hiasan berubah jadi balok raksasa — pernah terjadi pada keterangan kamera.
const ikon = (nama, kelas) =>
  `<svg viewBox="0 0 24 24" class="ikon${kelas ? ` ${kelas}` : ''}" aria-hidden="true"><use href="#i-${String(nama).replace(/^i-/, '')}"/></svg>`;
const aman = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
// PVMBG menulis "Masyarakat/pengunjung/wisatawan/pendaki" sebagai satu kata panjang.
// Peramban tidak memutus baris setelah garis miring, jadi disisipkan titik putus
// tak terlihat — teksnya sendiri tidak diubah, hanya boleh berganti baris di sana.
const bolehPutus = (s) => aman(s).replace(/\//g, '/​');

// ── waktu ─────────────────────────────────────────────────────────────────
const WIB = { timeZone: 'Asia/Jakarta' };
const jamWib = (iso) =>
  new Date(iso).toLocaleString('id-ID', { ...WIB, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';

function lalu(iso) {
  if (!iso) return 'waktu tidak diketahui';
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 60) return 'baru saja';
  if (d < 3600) return `${Math.floor(d / 60)} menit lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  return `${Math.floor(d / 86400)} hari lalu`;
}

const LABEL_STATUS = { aman: 'Aman', waspada: 'Waspada', siaga: 'Siaga', bahaya: 'Bahaya' };
const IKON_STATUS = { aman: 'i-cek', waspada: 'i-info', siaga: 'i-awas', bahaya: 'i-awas' };
const warnaStatus = (s) => getComputedStyle(document.body).getPropertyValue(`--h-${s}`).trim() || '#999';
const lencana = (status, teks) =>
  `<span class="lencana st-${status}"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${IKON_STATUS[status]}"/></svg>${aman(teks ?? LABEL_STATUS[status])}</span>`;

// ── keadaan ───────────────────────────────────────────────────────────────
let D = null;
let kotaTerpilih = localStorage.getItem('siaga.kota') || null;
let lapisanAktif = new Set();
let tabKabar = 'semua';
let garisPantai = null;
let lokasiSaya = null;
let petaWindy = false;
let windySetuju = localStorage.getItem('siaga.windy') === 'ya';
let windyOverlay = 'wind';
let windyLevel = '700h';
let tampilan = 'situasi';
let tindakanTerbuka = null;
let cctvBesar = null;

// ── tema: terang atau gelap; tanpa pilihan tersimpan, ikut perangkat ──────
// `tema` bernilai null selama pembaca belum memilih. Selama null, atribut
// data-tema tidak dipasang sama sekali sehingga @media prefers-color-scheme
// yang menentukan — termasuk saat perangkat berganti tema di tengah jalan.
const gelapPerangkat = () => matchMedia('(prefers-color-scheme: dark)').matches;
const temaUrl = new URLSearchParams(location.search).get('tema');
let tema =
  (temaUrl === 'terang' || temaUrl === 'gelap' ? temaUrl : null) ||
  (['terang', 'gelap'].includes(localStorage.getItem('siaga.tema')) ? localStorage.getItem('siaga.tema') : null);

const temaEfektif = () => tema ?? (gelapPerangkat() ? 'gelap' : 'terang');

function terapkanTema() {
  if (tema) document.documentElement.setAttribute('data-tema', tema);
  else document.documentElement.removeAttribute('data-tema');

  // Tombol menampilkan tujuan, bukan keadaan sekarang: bulan berarti "ganti ke gelap".
  const lawan = temaEfektif() === 'gelap' ? 'terang' : 'gelap';
  const b = $('#tombol-tema');
  b.innerHTML = ikon(lawan);
  b.title = `Ganti ke mode ${lawan}`;
  b.setAttribute('aria-label', b.title);
  // Grafik memakai warna dari token CSS, jadi harus digambar ulang saat tema berubah.
  if (D) gambarTampilanAktif(true);
}

// ── navigasi tampilan ─────────────────────────────────────────────────────
const TAMPILAN = ['situasi', 'lokasi', 'dampak', 'sumber'];

function pindahTab(ke, dariPengguna = true) {
  if (!TAMPILAN.includes(ke)) ke = 'situasi';
  tampilan = ke;
  for (const t of TAMPILAN) $(`#v-${t}`).hidden = t !== ke;
  for (const b of $$('.tab-u')) b.setAttribute('aria-current', b.dataset.ke === ke);
  if (dariPengguna) {
    history.replaceState(null, '', `#${ke}`);
    scrollTo({ top: 0, behavior: 'instant' });
  }
  // Elemen di dalam section tersembunyi punya lebar 0, jadi grafiknya baru bisa
  // digambar dengan ukuran benar setelah tampilannya terlihat.
  if (D) gambarTampilanAktif(true);
}

/** Gambar hanya isi tampilan yang sedang terlihat. */
function gambarTampilanAktif(ulang = false) {
  if (tampilan === 'situasi') {
    gambarVonis();
    gambarGempa();
    if (!ulang) gambarCctv();
  } else if (tampilan === 'lokasi') {
    gambarPilihKota();
    gambarRingkasLokasi();
    gambarSaringLapisan();
    petaWindy ? gambarWindy() : gambarPeta();
    if ($('#angin-wadah').closest('details').open) gambarAngin();
  } else if (tampilan === 'dampak') {
    gambarDampak();
    gambarTindakan();
    if ($('#udara-wadah').closest('details').open) gambarUdara();
  } else if (tampilan === 'sumber') {
    gambarKabar();
    gambarSumber();
  }
}

// ── kepala & strip ────────────────────────────────────────────────────────
function gambarSegar() {
  const s = $('#segar');
  const umurMenit = (Date.now() - Date.parse(D.dibuat)) / 60000;
  s.dataset.usia = umurMenit < 30 ? 'baru' : umurMenit < 180 ? 'lawas' : 'basi';
  s.title = `Data diambil ${jamWib(D.dibuat)}`;
  $('#segar-teks').textContent = `Diperbarui ${lalu(D.dibuat)}`;
  // Versi pendek untuk layar sempit: umur data terlalu penting untuk disembunyikan,
  // tapi kalimat penuhnya tidak muat berdampingan dengan tombol bantuan dan tema.
  const menit = Math.round((Date.now() - Date.parse(D.dibuat)) / 60000);
  $('#segar-pendek').textContent = menit < 1 ? 'baru' : menit < 60 ? `${menit} mnt` : `${Math.floor(menit / 60)} jam`;
  $('#kaki-waktu').textContent = `Halaman ini menarik data tiap beberapa menit. Pengambilan terakhir ${jamWib(D.dibuat)}.`;
}

function gambarStrip() {
  const r = D.ringkas;
  const k = kotaKini();
  $('#strip').hidden = false;
  $('#strip-gunung').innerHTML = r
    ? `<span class="titik-st" style="background:${warnaStatus(r.status)}"></span>
       <div><b>Level ${aman(r.level)} ${aman(r.levelNama)}</b>
       <small>gunung${r.radiusLaranganKm ? ` · jauhi ${r.radiusLaranganKm} km` : ''}</small></div>`
    : `<span class="titik-st" style="background:var(--ink-3)"></span><div><b>Status gunung tidak ada</b><small>sumber PVMBG gagal</small></div>`;
  $('#strip-kota').innerHTML = k
    ? `<span class="titik-st" style="background:${warnaStatus(k.status)}"></span>
       <div><b>${aman(k.nama)}: ${LABEL_STATUS[k.status]}</b>
       <small>${k.jarakKm} km · ISPU ${k.ispu?.nilai ?? '—'}</small></div>`
    : '';
}

// ── 1. SITUASI ────────────────────────────────────────────────────────────
const ARTI_LEVEL = {
  I: 'Tidak ada gejala tekanan magma yang berarti.',
  II: 'Aktivitas naik di atas normal. Ada potensi erupsi.',
  III: 'Gunung sudah erupsi atau sangat mungkin erupsi. Ada radius yang dilarang dimasuki.',
  IV: 'Erupsi besar sedang berlangsung atau segera terjadi. Ikuti perintah evakuasi.',
};
const TANGGA = [
  { kode: 'I', nama: 'Normal', status: 'aman' },
  { kode: 'II', nama: 'Waspada', status: 'waspada' },
  { kode: 'III', nama: 'Siaga', status: 'siaga' },
  { kode: 'IV', nama: 'Awas', status: 'bahaya' },
];

/**
 * Kalimat pembuka yang dirangkai ulang tiap kali data masuk, dari angka laporan
 * terbaru — bukan teks tetap. Isinya hanya yang benar-benar ada di laporan;
 * kalau sebuah angka tidak tersedia, kalimatnya tidak dibuat-buat.
 */
function ringkasSituasi(r, lap) {
  const bagian = [];
  const erupsiTeks = (lap.keterangan || '').match(/erupsi[^.]*?(?:berhenti|menerus|berlangsung)[^.]*\./i);

  if (r.gempaLetusan > 0)
    bagian.push(`Dalam periode ${lap.periodeMulai}–${lap.periodeSelesai} WIB tercatat ${r.gempaLetusan} gempa letusan.`);
  else if (r.gempaLetusan === 0)
    bagian.push(`Tidak ada gempa letusan tercatat pada periode ${lap.periodeMulai}–${lap.periodeSelesai} WIB.`);

  if (erupsiTeks) bagian.push(erupsiTeks[0].trim().replace(/^./, (c) => c.toUpperCase()));
  if (r.adaTremor) bagian.push('Tremor menerus masih terekam — magma masih bergerak di bawah kawah.');

  // Ke mana abunya condong: lapisan angin paling kencang di atas kawah.
  const l = (D.angin?.lapisan || []).reduce((a, b) => (!a || b.kecepatanKmj > a.kecepatanKmj ? b : a), null);
  if (l) bagian.push(`Angin terkuat di ketinggian ~${l.kmKira} km membawa abu ke arah ${mataAngin(l.arahHembusDerajat)}.`);

  const kena = D.kota.filter((k) => k.diJalurAbu);
  if (kena.length) bagian.push(`${kena.length} dari ${D.kota.length} kota yang dipantau berada di jalur sebaran abu.`);

  return bagian;
}

const MATA_ANGIN = ['utara', 'timur laut', 'timur', 'tenggara', 'selatan', 'barat daya', 'barat', 'barat laut'];
const mataAngin = (deg) => MATA_ANGIN[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
function gambarVonis() {
  const r = D.ringkas;
  const lap = D.laporan;
  const v = $('#vonis');

  if (!r || !lap) {
    v.innerHTML = `<div class="galat"><b>Status resmi tidak bisa diambil</b>
      Data dari MAGMA/PVMBG gagal dimuat, jadi halaman ini tidak bisa menampilkan status gunung.
      Jangan simpulkan apa pun dari sini — buka <a href="https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas" rel="noopener">magma.esdm.go.id</a> langsung.</div>`;
    return;
  }

  const arti = ARTI_LEVEL[r.level];

  v.innerHTML = `
    <div class="vonis-atas">
      ${lencana(r.status, `Level ${r.level} · ${r.levelNama}`)}
      ${r.radiusLaranganKm ? `<span class="lencana st-bahaya">${ikon('perisai')}Dilarang dalam ${r.radiusLaranganKm} km</span>` : ''}
    </div>
    <h1>${aman(lap.gunung)}</h1>
    <p class="vonis-lead">${aman(arti)}</p>
    <ul class="ringkas-kini">${ringkasSituasi(r, lap).map((b) => `<li>${aman(b)}</li>`).join('')}</ul>
    <p class="cap">${ikon('jam')}<span>Laporan pengamatan PVMBG <b>${aman(lap.tanggal)}</b>, periode ${aman(lap.periodeMulai)}–${aman(lap.periodeSelesai)} WIB.
      Terbit ${lalu(lap.waktuLaporan)}. Pengamat: ${aman(lap.pembuat || '—')}.</span></p>
    ${D.laporanCadangan ? `<p class="cap peringatan-basi">${ikon('awas')}<span><b>Pengambilan laporan terbaru gagal.</b> Yang tampil adalah laporan tersimpan terakhir. Level gunung tetap dari tabel tingkat aktivitas PVMBG.</span></p>` : ''}
    <ul class="fakta">
      <li><b>${r.gempaLetusan ?? '—'}</b> gempa letusan periode ini</li>
      <li><b>${r.totalGempa ?? '—'}</b> total gempa terekam</li>
      <li>Tremor menerus: <b>${r.adaTremor == null ? '—' : r.adaTremor ? 'ada' : 'tidak ada'}</b></li>
    </ul>`;

  gambarTangga(r);

  $('#visual-lengkap').innerHTML = [
    lap.visual && `<p><b>Pengamatan visual.</b> ${aman(lap.visual)}</p>`,
    lap.keterangan && `<p><b>Keterangan lainnya.</b> ${aman(lap.keterangan)}</p>`,
    lap.klimatologi && `<p><b>Klimatologi.</b> ${aman(lap.klimatologi)}</p>`,
    r.ringkasHarian && `<p><b>Ringkasan harian.</b> ${aman(r.ringkasHarian)}</p>`,
    `<p><a href="${aman(lap.url)}" target="_blank" rel="noopener">Buka laporan asli di MAGMA Indonesia</a></p>`,
  ].filter(Boolean).join('');
}

/** Empat tingkat PVMBG sebagai tangga: makin ke kanan makin berbahaya. */
function gambarTangga(r) {
  $('#tangga-level').innerHTML = `
    <div class="tangga">
      <div class="tangga-baris">
        ${TANGGA.map((t) => `
          <div class="tangga-sel ${t.kode === r.level ? `st-${t.status}` : ''}" data-kini="${t.kode === r.level}">
            <small>Level ${t.kode}</small><b>${t.nama}</b>
          </div>`).join('')}
      </div>
      <div class="tangga-arah"><span>lebih aman</span><span>lebih berbahaya →</span></div>
      <p class="tangga-arti"><b>Sekarang di Level ${aman(r.level)} dari IV.</b>
        ${aman(ARTI_LEVEL[r.level])}
        ${r.level === 'IV' ? '' : `Kalau naik ke Level ${TANGGA[TANGGA.findIndex((t) => t.kode === r.level) + 1].kode}, artinya ${aman(ARTI_LEVEL[TANGGA[TANGGA.findIndex((t) => t.kode === r.level) + 1].kode]).toLowerCase()}`}
      </p>
      <details class="lipat"><summary>Arti keempat tingkat</summary>
        <div class="lipat-isi">
          <ol>${TANGGA.map((t) => `<li><b>Level ${t.kode} — ${t.nama}.</b> ${aman(ARTI_LEVEL[t.kode])}</li>`).join('')}</ol>
          <p><a class="tautan-sumber" href="https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas" target="_blank" rel="noopener">${ikon('tautan')}Tabel tingkat aktivitas PVMBG</a></p>
        </div>
      </details>
    </div>`;
}

async function gambarCctv() {
  const wadah = $('#cctv');
  try {
    const r = await fetch('/api/cctv', { cache: 'no-store' });
    const j = await r.json();
    if (!j.kamera?.length) throw new Error(j.galat || 'tidak ada kamera terbaca');
    const t = Date.parse(j.diambil);

    wadah.innerHTML = `
      <div class="cctv-grid">
        ${j.kamera.map((k, i) => `
          <button class="cctv-sel" type="button" data-i="${i}" title="${aman(k.nama)}">
            <img src="/api/cctv/${i}.jpg?t=${t}" alt="Kamera ${aman(k.nama)}"
                 width="${k.lebar || 150}" height="${k.tinggi || 84}">
            <span class="cctv-gagal">${ikon('silang')}Bingkai tidak tersedia</span>
            <figcaption>${aman(k.nama.replace(/^Anak Krakatau\s*-\s*/i, ''))}</figcaption>
          </button>`).join('')}
      </div>
      <div id="cctv-besar"></div>
      <p class="cctv-kaki">${ikon('kamera')} Bingkai diperbarui sekitar semenit sekali; diambil ${lalu(j.diambil)}.
        Ukuran 150 × 84 piksel, sebagaimana disediakan halaman publik MAGMA.
        Gambar oleh ${aman(j.lisensi)}, disajikan tanpa perubahan —
        <a href="${aman(j.sumberUrl)}" target="_blank" rel="noopener">buka di MAGMA</a>.</p>`;

    // Bingkai yang gagal dimuat tidak boleh menyisakan ikon gambar rusak bawaan
    // peramban; diganti keterangan yang menyebutkan apa yang terjadi.
    for (const im of $$('.cctv-sel img', wadah)) {
      im.onerror = () => {
        im.dataset.gagal = '1';
        im.closest('.cctv-sel').dataset.gagal = 'true';
      };
      if (im.complete && im.naturalWidth === 0) im.onerror();
    }

    for (const b of $$('.cctv-sel', wadah))
      b.onclick = () => {
        const i = Number(b.dataset.i);
        cctvBesar = cctvBesar === i ? null : i;
        $('#cctv-besar').innerHTML =
          cctvBesar == null
            ? ''
            : `<figure>
                 <img src="/api/cctv/${cctvBesar}.jpg?t=${t}" alt="${aman(j.kamera[cctvBesar].nama)}">
                 <figcaption class="cctv-kaki">${aman(j.kamera[cctvBesar].nama)} · ${j.kamera[cctvBesar].lebar}×${j.kamera[cctvBesar].tinggi} piksel ·
                   <a href="${aman(j.sumberUrl)}" target="_blank" rel="noopener">lihat di MAGMA</a></figcaption>
               </figure>`;
      };
  } catch (e) {
    wadah.innerHTML = `<p class="cap">${ikon('silang')}<span>Kamera pemantau tidak bisa diambil: ${aman(e.message)}.
      Coba langsung di <a href="https://magma.esdm.go.id/v1/gunung-api/cctv" target="_blank" rel="noopener">MAGMA Indonesia</a>.</span></p>`;
  }
}

function gambarGempa() {
  const g = D.laporan?.kegempaan || [];
  const wadah = $('#gempa-wadah');
  if (!g.length) {
    wadah.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Rincian kegempaan tidak tersedia pada laporan terakhir.</p>';
    return;
  }
  const urut = [...g].sort((a, b) => b.jumlah - a.jumlah);
  const maks = Math.max(...urut.map((x) => x.jumlah));
  const W = lebarWadah('#gempa-wadah');
  const sempit = W < 430;
  const ml = sempit ? 14 : 150;
  // Di tata letak sempit label duduk di atas batangnya, jadi ruang atas harus
  // memuat satu baris teks penuh — bukan cuma jarak antar batang.
  const mr = 44, tb = sempit ? 20 : 30, jarak = sempit ? 30 : 10, mt = sempit ? 26 : 16;
  // Jarak antar batang tidak perlu ikut di bawah batang terakhir.
  const H = mt + urut.length * (tb + jarak) - jarak + 14;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img',
    'aria-label': `Jumlah gempa per jenis pada laporan terakhir: ${urut.map((x) => `${x.jenis} ${x.jumlah}`).join(', ')}.` });

  urut.forEach((x, i) => {
    const y = mt + i * (tb + jarak);
    const w = Math.max((x.jumlah / maks) * (W - ml - mr), 3);
    const sorot = /letusan|erupsi/i.test(x.jenis);
    svg.append(
      sempit
        ? el('text', { x: ml, y: y - 6, fill: sorot ? 'var(--ink)' : 'var(--ink-2)', 'font-size': 13, 'font-weight': sorot ? 700 : 500 }, x.jenis)
        : el('text', { x: ml - 12, y: y + tb / 2 + 4, 'text-anchor': 'end', fill: sorot ? 'var(--ink)' : 'var(--ink-2)', 'font-size': 13, 'font-weight': sorot ? 700 : 500 }, x.jenis)
    );
    svg.append(el('rect', { x: ml, y, width: w, height: tb, rx: 4, fill: sorot ? 'var(--h-bahaya)' : 'var(--accent)', 'fill-opacity': sorot ? 1 : 0.68 }));
    svg.append(el('text', { x: ml + w + 9, y: y + tb / 2 + 4.5, fill: 'var(--ink)', 'font-size': 13, 'font-weight': 700 }, String(x.jumlah)));
    const t = el('title');
    t.textContent = x.teks;
    svg.append(t);
  });

  wadah.replaceChildren(svg);
  const lap = D.laporan;
  $('#gempa-kaki').textContent = `Laporan PVMBG ${lap.tanggal}, periode ${lap.periodeMulai}–${lap.periodeSelesai} WIB${D.tren.length > 1 ? ` · ${D.tren.length} periode tersimpan` : ' · riwayat antar periode terkumpul seiring waktu'}.`;
}

// ── 2. LOKASIMU ───────────────────────────────────────────────────────────
function gambarPilihKota() {
  const sel = $('#pilih-kota');
  sel.innerHTML = '';
  if (lokasiSaya) {
    const o = html('option');
    o.value = 'lokasi-saya';
    o.textContent = `Lokasi kamu — ${lokasiSaya.jarakKm} km`;
    sel.append(o);
  }
  for (const k of D.kota) {
    const o = html('option');
    o.value = k.kotaId;
    o.textContent = `${k.nama} — ${k.jarakKm} km`;
    sel.append(o);
  }
  // Pilihan tersimpan bisa menunjuk 'lokasi-saya' dari kunjungan sebelumnya,
  // padahal sesi ini belum punya izin lokasi. Tanpa penjagaan ini, select
  // menunjuk opsi yang tidak ada dan tampil kosong.
  const sah = kotaTerpilih === 'lokasi-saya' ? !!lokasiSaya : D.kota.some((k) => k.kotaId === kotaTerpilih);
  if (!sah) kotaTerpilih = D.kota[0]?.kotaId;
  sel.value = kotaTerpilih;
  sel.onchange = () => {
    if (sel.value !== 'lokasi-saya' && lokasiSaya) lokasiSaya = null;
    kotaTerpilih = sel.value;
    localStorage.setItem('siaga.kota', kotaTerpilih);
    gantiKota();
  };
}

const kotaKini = () =>
  (kotaTerpilih === 'lokasi-saya' && lokasiSaya) || D.kota.find((k) => k.kotaId === kotaTerpilih) || D.kota[0];

function gantiKota() {
  gambarStrip();
  gambarRingkasLokasi();
  gambarPeta();
  if ($('#tabel-kota').firstElementChild) gambarTabelKota();
  gambarDampak();
  gambarTindakan();
  if ($('#udara-wadah').closest('details').open) gambarUdara();
}

function gambarRingkasLokasi() {
  const k = kotaKini();
  if (!k) return;
  $('#ringkas-lokasi').innerHTML = `
    <dl class="ukur ukur-2">
      <div><dt>Jarak</dt><dd>${k.jarakKm}<small> km</small></dd></div>
      <div><dt>Arah</dt><dd style="font-size:19px">${aman(k.arahMata)}</dd></div>
      <div><dt>Jalur abu</dt><dd style="font-size:19px">${k.diJalurAbu ? 'Ya' : 'Tidak'}</dd></div>
    </dl>`;
}

// ── 3. DAMPAK ─────────────────────────────────────────────────────────────
function gambarDampak() {
  const k = kotaKini();
  if (!k) return;
  const i = k.ispu;
  $('#kartu-dampak').innerHTML = `
    <div class="kartu-kota">
      <div class="kota-kepala">
        <div><h3>${aman(k.nama)}</h3><p>${k.dariPerangkat ? 'Dari lokasi perangkat kamu' : aman(k.provinsi)}</p></div>
        ${lencana(k.status)}
      </div>
      <dl class="ukur ukur-2">
        <div><dt>Jarak</dt><dd>${k.jarakKm}<small> km</small></dd></div>
        <div><dt>ISPU 24 jam</dt><dd>${i ? i.nilai : '—'}<small> ${i ? aman(i.kategori) : 'data tidak ada'}</small></dd></div>
        <div><dt>Jalur abu</dt><dd style="font-size:19px">${k.diJalurAbu ? 'Ya' : 'Tidak'}</dd></div>
      </dl>
      ${k.alasan.length ? `<ul class="alasan">${k.alasan.map((a) => `<li>${ikon('info')}<div>${bolehPutus(a.teks)}
            <small>${aman(a.sumber)}</small>${tautanSumber(a)}</div></li>`).join('')}</ul>` : ''}
    </div>`;
}

/**
 * Infografis tindakan. Anjuran prioritas satu tampil utuh sebagai kalimat —
 * itu larangan resmi, tidak boleh disembunyikan di balik ketukan. Sisanya jadi
 * petak berikon supaya muat di satu layar; teks lengkapnya muncul saat diketuk.
 */
/** Tautan rujukan, kalau sumbernya memang punya alamat yang bisa dibuka. */
const tautanSumber = (t) =>
  t.sumberUrl
    ? `<a class="tautan-sumber" href="${aman(t.sumberUrl)}" target="_blank" rel="noopener">${ikon('tautan')}Buka sumbernya</a>`
    : '';

function gambarTindakan() {
  const k = kotaKini();
  const wadah = $('#tindakan');
  if (!k?.langkah?.length) {
    wadah.innerHTML = `<div class="tindakan-utama st-aman">${ikon('cek')}<div><p>Tidak ada tindakan khusus untuk ${aman(k?.nama ?? 'lokasi ini')} saat ini. Tetap ikuti kabar resmi.</p></div></div>`;
    return;
  }
  const utama = k.langkah.filter((t) => t.prioritas === 1);
  const sisa = k.langkah.filter((t) => t.prioritas !== 1);
  const kelas = { aman: 'st-aman', waspada: 'st-waspada', siaga: 'st-siaga', bahaya: 'st-bahaya' }[k.status];

  wadah.innerHTML =
    utama.map((t) => `<div class="tindakan-utama ${kelas}">${ikon(t.ikon)}<div>
        <p>${bolehPutus(t.teks)}</p>
        <small>${aman(t.sumber)} · ${aman(t.dasar)}</small>
        ${tautanSumber(t)}
      </div></div>`).join('') +
    (sisa.length
      ? `<div class="petak">${sisa
          .map((t, n) => `<button class="petak-sel" type="button" data-n="${n}" aria-expanded="false">${ikon(t.ikon)}<span>${aman(t.ringkas || 'Tindakan')}</span></button>`)
          .join('')}</div><div id="tindakan-detail"></div>`
      : '');

  if (!sisa.length) return;
  const detail = $('#tindakan-detail');
  const tampilkan = () => {
    for (const x of $$('.petak-sel', wadah)) x.setAttribute('aria-expanded', Number(x.dataset.n) === tindakanTerbuka);
    const t = sisa[tindakanTerbuka];
    detail.innerHTML = t
      ? `<div class="tindakan-detail"><p>${bolehPutus(t.teks)}</p>
           <small>${aman(t.sumber)} · ${aman(t.dasar)}</small>${tautanSumber(t)}</div>`
      : '';
    // Petaknya bisa tiga baris; tanpa ini detail terbuka di luar layar.
    if (t) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  for (const b of $$('.petak-sel', wadah))
    b.onclick = () => {
      const n = Number(b.dataset.n);
      tindakanTerbuka = tindakanTerbuka === n ? null : n;
      tampilkan();
    };
  if (tindakanTerbuka != null && tindakanTerbuka < sisa.length) tampilkan();
  else tindakanTerbuka = null;
}

// ── lokasi perangkat ──────────────────────────────────────────────────────
// Izin tidak pernah diminta saat halaman dibuka — pengguna yang menekan tombol.
// Koordinat dibulatkan ke 2 desimal (~1,1 km) sebelum dikirim, lewat badan POST,
// dan tidak disimpan di mana pun.
function kabarLokasi(teks, nada, aksi) {
  const e = $('#lokasi-kabar');
  e.hidden = !teks;
  e.dataset.nada = nada || '';
  if (!teks) return;
  e.innerHTML = `${ikon(nada === 'galat' ? 'awas' : 'pin')}<span>${aman(teks)}</span>`;
  if (aksi) {
    const b = html('button', { type: 'button' }, aksi.label);
    b.onclick = aksi.fn;
    e.querySelector('span').append(b);
  }
}

async function pakaiLokasi() {
  const tombol = $('#tombol-lokasi');
  if (!navigator.geolocation)
    return kabarLokasi('Peramban ini tidak mendukung deteksi lokasi. Pilih kota terdekat secara manual.', 'galat');

  tombol.dataset.keadaan = 'memuat';
  kabarLokasi('Meminta izin lokasi…');
  try {
    const pos = await new Promise((ok, gagal) =>
      navigator.geolocation.getCurrentPosition(ok, gagal, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })
    );
    const bulat = (n) => Math.round(n * 100) / 100;
    const r = await fetch('/api/lokasi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: bulat(pos.coords.latitude), lon: bulat(pos.coords.longitude) }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).galat || `server membalas ${r.status}`);

    lokasiSaya = await r.json();
    kotaTerpilih = 'lokasi-saya';
    localStorage.setItem('siaga.kota', 'lokasi-saya');
    tombol.dataset.keadaan = 'aktif';
    gambarPilihKota();
    gantiKota();
    kabarLokasi('Memakai lokasi perangkat, dibulatkan ke sekitar 1 km. Koordinat tidak disimpan.', '', {
      label: 'Kembali ke daftar kota',
      fn: lepasLokasi,
    });
  } catch (e) {
    tombol.dataset.keadaan = '';
    kabarLokasi(
      e.code === 1 ? 'Izin lokasi ditolak. Pilih kota terdekat secara manual.'
      : e.code === 2 ? 'Lokasi tidak bisa ditentukan perangkat. Pilih kota terdekat secara manual.'
      : e.code === 3 ? 'Permintaan lokasi kehabisan waktu. Coba lagi atau pilih kota manual.'
      : `Gagal memakai lokasi: ${e.message}`,
      'galat'
    );
  }
}

function lepasLokasi() {
  lokasiSaya = null;
  kotaTerpilih = D.kota[0]?.kotaId;
  localStorage.setItem('siaga.kota', kotaTerpilih);
  $('#tombol-lokasi').dataset.keadaan = '';
  kabarLokasi(null);
  gambarPilihKota();
  gantiKota();
}

// ── peta ──────────────────────────────────────────────────────────────────
const PETA = { w: 104.0, s: -7.7, e: 108.6, n: -4.7 };
const KM_PER_DERAJAT = 111.32;
const S = 100;

function proyeksi() {
  const lat0 = (PETA.s + PETA.n) / 2;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  return {
    kx,
    lebar: (PETA.e - PETA.w) * kx * S,
    tinggi: (PETA.n - PETA.s) * S,
    xy: (lon, lat) => [(lon - PETA.w) * kx * S, (PETA.n - lat) * S],
    km: (km) => (km / KM_PER_DERAJAT) * S,
  };
}

/** Juring sebaran: dari kawah, melebar ±toleransi ke arah tiupan angin. */
function juring(cx, cy, r, arahDeg, bukaDeg) {
  const rad = (d) => ((d - 90) * Math.PI) / 180;
  const a1 = rad(arahDeg - bukaDeg);
  const a2 = rad(arahDeg + bukaDeg);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

const RONA = { 850: '#F6C98A', 700: '#F0A053', 500: '#E4700C', 250: '#B01D14' };
const warnaRona = (hPa) => RONA[hPa] || '#E4700C';

function gambarSaringLapisan() {
  const wadah = $('#saring-lapisan');
  wadah.innerHTML = '';
  const lap = D.angin?.lapisan || [];
  if (!lap.length) return;
  if (!lapisanAktif.size) lap.forEach((l) => lapisanAktif.add(l.hPa));

  for (const l of lap) {
    const b = html('button', { class: 'cip', type: 'button', 'aria-pressed': lapisanAktif.has(l.hPa) });
    b.innerHTML = `<i style="background:${warnaRona(l.hPa)}"></i>${l.label} · ~${l.kmKira} km`;
    b.onclick = () => {
      lapisanAktif.has(l.hPa) ? lapisanAktif.delete(l.hPa) : lapisanAktif.add(l.hPa);
      b.setAttribute('aria-pressed', lapisanAktif.has(l.hPa));
      gambarPeta();
      gambarAngin();
    };
    wadah.append(b);
  }
}

const kakiPeta = () =>
  D.angin
    ? `Juring menunjukkan sejauh mana abu terbawa dalam 6 jam pada kecepatan angin saat ini, melebar ${D.ambang.sektorToleransiDerajat}° ke kiri dan kanan. Angin diambil ${lalu(D.angin.waktuData)}.`
    : 'Data angin tidak tersedia, jadi arah sebaran tidak bisa digambar.';

function gambarPeta() {
  if (petaWindy || tampilan !== 'lokasi') return;
  const p = proyeksi();
  const sk = p.lebar / lebarWadah('#peta-wadah');
  const fs = (px) => +(px * sk).toFixed(1);
  const g = D.gunung;
  const [gx, gy] = p.xy(g.lon, g.lat);
  const svg = el('svg', { class: 'peta', viewBox: `0 0 ${p.lebar} ${p.tinggi}`, role: 'img',
    'aria-label': `Peta Selat Sunda: posisi ${g.nama}, arah sebaran abu, dan status ${D.kota.length} kota.` });

  svg.append(el('rect', { width: p.lebar, height: p.tinggi, fill: 'var(--laut)' }));

  if (garisPantai)
    for (const baris of garisPantai.lines) {
      const d = baris.map(([lo, la], i) => `${i ? 'L' : 'M'}${p.xy(lo, la).map((v) => v.toFixed(1)).join(' ')}`).join('');
      svg.append(el('path', { d: d + 'Z', fill: 'var(--darat)', stroke: 'var(--grid)', 'stroke-width': 1 }));
    }

  for (const km of [50, 100, 200, 300]) {
    const r = p.km(km);
    svg.append(el('circle', { cx: gx, cy: gy, r, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1.2, 'stroke-dasharray': '5 5' }));
    const a = (215 * Math.PI) / 180;
    const lx = gx + r * Math.cos(a), ly = gy + r * Math.sin(a);
    if (lx > 26 && ly < p.tinggi - 8)
      svg.append(el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': fs(11), 'font-weight': 600, 'paint-order': 'stroke', stroke: 'var(--laut)', 'stroke-width': fs(3) }, `${km} km`));
  }

  const lapisan = (D.angin?.lapisan || []).filter((l) => lapisanAktif.has(l.hPa));
  const gJuring = el('g', { class: 'kerucut', style: `--pusat-x:${gx}px;--pusat-y:${gy}px` });
  for (const [i, l] of lapisan.entries()) {
    const jangkauKm = Math.min(l.kecepatanKmj * 6, D.ambang.jangkauanAbuKm);
    gJuring.append(el('path', {
      d: juring(gx, gy, p.km(jangkauKm), l.arahHembusDerajat, D.ambang.sektorToleransiDerajat),
      fill: warnaRona(l.hPa), 'fill-opacity': 0.2, stroke: warnaRona(l.hPa),
      'stroke-width': 1.4, 'stroke-opacity': 0.75, style: `animation-delay:${i * 90}ms`,
    }));
  }
  svg.append(gJuring);

  const gKota = el('g');
  const lwG = g.nama.length * fs(7.2) + fs(8);
  const kotak = [{ x1: gx - lwG / 2, x2: gx + lwG / 2, y1: gy - fs(13), y2: gy + fs(26) }];
  const semua = lokasiSaya ? [lokasiSaya, ...D.kota] : D.kota;
  for (const k of semua) {
    const [x, y] = p.xy(k.lon, k.lat);
    kotak.push({ x1: x - fs(8), x2: x + fs(8), y1: y - fs(8), y2: y + fs(8) });
  }
  const bentrok = (a) => kotak.some((b) => !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2));
  const urutLabel = [...semua].sort((a, b) => {
    if ((a.kotaId === kotaTerpilih) !== (b.kotaId === kotaTerpilih)) return a.kotaId === kotaTerpilih ? -1 : 1;
    const s = ['bahaya', 'siaga', 'waspada', 'aman'];
    return s.indexOf(a.status) - s.indexOf(b.status) || a.jarakKm - b.jarakKm;
  });

  for (const k of urutLabel) {
    const [x, y] = p.xy(k.lon, k.lat);
    const dipilih = k.kotaId === kotaTerpilih;
    const t = el('g', { style: 'cursor:pointer', tabindex: '0', role: 'button',
      'aria-label': `${k.nama}, ${k.jarakKm} km, status ${LABEL_STATUS[k.status]}` });
    if (dipilih) t.append(el('circle', { cx: x, cy: y, r: fs(11), fill: 'none', stroke: 'var(--ink)', 'stroke-width': fs(1.5) }));
    t.append(el('circle', { cx: x, cy: y, r: fs(dipilih ? 6.5 : 5), fill: warnaStatus(k.status), stroke: 'var(--surface)', 'stroke-width': fs(1.8) }));

    const lw = k.nama.length * fs(7.3) + fs(10);
    for (const c of [
      { dx: fs(10), dy: fs(4), anchor: 'start' },
      { dx: -fs(10), dy: fs(4), anchor: 'end' },
      { dx: 0, dy: -fs(11), anchor: 'middle' },
      { dx: 0, dy: fs(17), anchor: 'middle' },
    ]) {
      const x1 = c.anchor === 'start' ? x + c.dx : c.anchor === 'end' ? x + c.dx - lw : x - lw / 2;
      const kk = { x1, x2: x1 + lw, y1: y + c.dy - fs(13), y2: y + c.dy + fs(6) };
      if (bentrok(kk) && !dipilih) continue;
      kotak.push(kk);
      t.append(el('text', { x: x + c.dx, y: y + c.dy, 'text-anchor': c.anchor, fill: 'var(--ink)',
        'font-size': fs(12), 'font-weight': dipilih ? 800 : 600, 'paint-order': 'stroke',
        stroke: 'var(--surface)', 'stroke-width': fs(3.5) }, k.nama));
      break;
    }

    const pilih = () => {
      kotaTerpilih = k.kotaId;
      localStorage.setItem('siaga.kota', kotaTerpilih);
      $('#pilih-kota').value = kotaTerpilih;
      gantiKota();
    };
    t.onclick = pilih;
    t.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pilih(); } };
    gKota.append(t);
  }
  svg.append(gKota);

  const r = D.ringkas;
  if (r?.radiusLaranganKm)
    svg.append(el('circle', { cx: gx, cy: gy, r: Math.max(p.km(r.radiusLaranganKm), fs(3)), fill: 'var(--h-bahaya)', 'fill-opacity': 0.35, stroke: 'var(--h-bahaya)', 'stroke-width': 1.5 }));
  svg.append(el('path', { d: `M${gx} ${gy - fs(10)} L${gx + fs(9)} ${gy + fs(7)} L${gx - fs(9)} ${gy + fs(7)} Z`, fill: 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': fs(1.5) }));
  svg.append(el('text', { x: gx, y: gy + fs(22), 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': fs(12.5), 'font-weight': 800, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': fs(3.5) }, g.nama));

  $('#peta-wadah').replaceChildren(svg);
  $('#peta-keterangan').innerHTML = Object.entries(LABEL_STATUS)
    .map(([s, l]) => `<span><i style="background:${warnaStatus(s)}"></i>${l}</span>`).join('');
  $('#peta-kaki').textContent = kakiPeta();

  gambarTabelKota();
}

/** Padanan tabel untuk peta: identitas tidak pernah lewat warna saja. */
function gambarTabelKota() {
  const tabel = $('#tabel-kota');
  tabel.innerHTML = `<table class="data">
    <thead><tr><th>Kota</th><th>Jarak</th><th>Arah</th><th>ISPU</th><th>Status</th></tr></thead>
    <tbody>${D.kota.map((k) => `
      <tr data-kota="${aman(k.kotaId)}" data-pilih="${k.kotaId === kotaTerpilih}" tabindex="0" role="button"
          aria-label="Pilih ${aman(k.nama)}">
        <td>${aman(k.nama)}</td>
        <td>${k.jarakKm} km</td>
        <td>${aman(k.arahMata)}</td>
        <td>${k.ispu?.nilai ?? '—'}</td>
        <td><span class="cip-status st-${k.status}">
          <svg viewBox="0 0 24 24" class="ikon" aria-hidden="true"><use href="#${IKON_STATUS[k.status]}"/></svg>${LABEL_STATUS[k.status]}
        </span></td>
      </tr>`).join('')}
    </tbody></table>`;

  for (const tr of $$('tr[data-kota]', tabel)) {
    const pilih = () => {
      kotaTerpilih = tr.dataset.kota;
      if (lokasiSaya) lokasiSaya = null;
      localStorage.setItem('siaga.kota', kotaTerpilih);
      $('#pilih-kota').value = kotaTerpilih;
      gantiKota();
    };
    tr.onclick = pilih;
    tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pilih(); } };
  }
}

// ── peta Windy ────────────────────────────────────────────────────────────
// Lapisan pihak ketiga, sengaja tidak aktif sejak awal: membukanya berarti
// peramban pembaca menghubungi windy.com. Kunci overlay sudah diuji satu per satu;
// `so2` tidak dipakai karena diam-diam jatuh kembali ke lapisan angin.
const WINDY_OVERLAY = [
  { kunci: 'wind', nama: 'Angin', satuan: 'arah & kecepatan udara' },
  { kunci: 'pm2p5', nama: 'PM2.5', satuan: 'partikel halus, µg/m³' },
  { kunci: 'aod550', nama: 'Aerosol', satuan: 'ketebalan optik aerosol — paling dekat dengan abu' },
  { kunci: 'dustsm', nama: 'Debu', satuan: 'debu permukaan, µg/m³' },
];
const WINDY_LEVEL = [
  { kunci: 'surface', nama: 'Permukaan' },
  { kunci: '850h', nama: '~1,5 km' },
  { kunci: '700h', nama: '~3 km' },
  { kunci: '500h', nama: '~5,5 km' },
  { kunci: '250h', nama: '~10,5 km' },
];

function urlWindy() {
  const g = D.gunung;
  const q = new URLSearchParams({
    lat: g.lat, lon: g.lon, zoom: '7',
    overlay: windyOverlay,
    product: windyOverlay === 'wind' ? 'ecmwf' : 'cams',
    level: windyOverlay === 'wind' ? windyLevel : 'surface',
    marker: 'true', menu: '', message: '', calendar: 'now', type: 'map',
    location: 'coordinates', metricWind: 'km/h', metricTemp: '°C',
  });
  return `https://embed.windy.com/embed2.html?${q}`;
}

function gambarWindy() {
  const wadah = $('#windy-wadah');
  const saring = $('#saring-windy');

  if (!windySetuju) {
    saring.hidden = true;
    wadah.innerHTML = '';
    wadah.append(html('div', { class: 'windy-catatan' },
      `${ikon('awas')}<div><b>Lapisan ini dimuat dari windy.com.</b> Kalau kamu membukanya, peramban kamu
       menghubungi server mereka dan mereka bisa melihat alamat IP kamu. Peta bawaan Siaga tidak memanggil
       siapa pun. Data Windy berasal dari model ECMWF dan CAMS — perkiraan, bukan pengamatan resmi PVMBG.
       <br><button type="button" id="windy-setuju">Muat peta Windy</button></div>`));
    $('#windy-setuju').onclick = () => {
      windySetuju = true;
      localStorage.setItem('siaga.windy', 'ya');
      gambarWindy();
    };
    return;
  }

  saring.hidden = false;
  saring.innerHTML = '';
  for (const o of WINDY_OVERLAY) {
    const b = html('button', { class: 'cip', type: 'button', 'aria-pressed': windyOverlay === o.kunci, title: o.satuan });
    b.textContent = o.nama;
    b.onclick = () => { windyOverlay = o.kunci; gambarWindy(); };
    saring.append(b);
  }
  if (windyOverlay === 'wind')
    for (const l of WINDY_LEVEL) {
      const b = html('button', { class: 'cip', type: 'button', 'aria-pressed': windyLevel === l.kunci });
      b.textContent = l.nama;
      b.onclick = () => { windyLevel = l.kunci; gambarWindy(); };
      saring.append(b);
    }

  wadah.replaceChildren(html('iframe', {
    src: urlWindy(), title: 'Peta Windy', loading: 'lazy',
    referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-popups',
  }));
}

function alihPeta(keWindy) {
  petaWindy = keWindy;
  $('#alih-siaga').setAttribute('aria-pressed', !keWindy);
  $('#alih-windy').setAttribute('aria-pressed', keWindy);
  $('#peta-wadah').hidden = keWindy;
  $('#peta-keterangan').hidden = keWindy;
  $('#saring-lapisan').hidden = keWindy;
  $('#saring-windy').hidden = !keWindy || !windySetuju;
  $('#windy-wadah').hidden = !keWindy;
  if (keWindy) gambarWindy();
  else {
    $('#windy-wadah').innerHTML = '';
    gambarPeta();
  }
  $('#peta-kaki').textContent = keWindy
    ? 'Sumber: windy.com (model ECMWF & CAMS). Lapisan ini perkiraan pihak ketiga, bukan prakiraan sebaran abu resmi. Prakiraan resmi ada di VONA PVMBG dan Darwin VAAC.'
    : kakiPeta();
}

// ── kompas angin ──────────────────────────────────────────────────────────
function gambarAngin() {
  const lap = D.angin?.lapisan || [];
  const wadah = $('#angin-wadah');
  if (!lap.length) {
    wadah.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Data angin tidak tersedia saat ini.</p>';
    return;
  }
  const W = lebarWadah('#angin-wadah');
  const H = Math.round(Math.min(320, Math.max(240, W * 0.72)));
  const cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) / 2 - 58;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img',
    'aria-label': 'Arah dan kecepatan angin pada empat ketinggian di atas kawah.' });

  for (const f of [0.34, 0.67, 1]) svg.append(el('circle', { cx, cy, r: R * f, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1 }));
  for (const [i, m] of ['U', 'T', 'S', 'B'].entries()) {
    const a = ((i * 90 - 90) * Math.PI) / 180;
    svg.append(el('text', { x: cx + (R + 18) * Math.cos(a), y: cy + (R + 18) * Math.sin(a) + 5, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': 13, 'font-weight': 700 }, m));
  }

  const maks = Math.max(...lap.map((l) => l.kecepatanKmj), 1);
  const dipakai = [];
  for (const l of lap) {
    const redup = lapisanAktif.size && !lapisanAktif.has(l.hPa);
    const a = ((l.arahHembusDerajat - 90) * Math.PI) / 180;
    const r = 26 + (R - 26) * (l.kecepatanKmj / maks);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    const g = el('g', { opacity: redup ? 0.22 : 1 });
    g.append(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: warnaRona(l.hPa), 'stroke-width': 3, 'stroke-linecap': 'round' }));
    g.append(el('circle', { cx: x, cy: y, r: 5.5, fill: warnaRona(l.hPa), stroke: 'var(--surface)', 'stroke-width': 1.8 }));

    let lx = cx + (r + 22) * Math.cos(a);
    let ly = cy + (r + 22) * Math.sin(a) + 4;
    for (let n = 0; n < 8 && dipakai.some((q) => Math.hypot(q.x - lx, q.y - ly) < 30); n++) {
      lx += 15 * Math.cos(a + Math.PI / 2);
      ly += 15 * Math.sin(a + Math.PI / 2);
    }
    dipakai.push({ x: lx, y: ly });
    if (Math.hypot(lx - x, ly - y) > 30)
      g.append(el('line', { x1: x, y1: y, x2: lx, y2: ly - 4, stroke: warnaRona(l.hPa), 'stroke-width': 1, 'stroke-opacity': 0.5 }));
    g.append(el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 12.5, 'font-weight': 700, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': 3.5 }, `~${l.kmKira} km · ${Math.round(l.kecepatanKmj)} km/j`));
    svg.append(g);
  }
  svg.append(el('circle', { cx, cy, r: 5, fill: 'var(--ink)' }));
  svg.append(el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': 11.5, 'font-weight': 600 }, 'titik tengah = kawah'));
  wadah.replaceChildren(svg);
}

// ── grafik udara ──────────────────────────────────────────────────────────
const PATAH_PM25 = [
  { nilai: 15.5, nama: 'Baik' },
  { nilai: 55.4, nama: 'Sedang' },
  { nilai: 150.4, nama: 'Tidak Sehat' },
];

function gambarUdara() {
  const k = kotaKini();
  const d = (k?.deretUdara || []).filter((t) => t.pm2_5 != null);
  const wadah = $('#udara-wadah');
  if (d.length < 2) {
    wadah.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Deret kualitas udara untuk lokasi ini tidak tersedia.</p>';
    return;
  }
  $('#udara-sub').textContent = `PM2.5 di ${k.nama} selama 24 jam terakhir. Garis putus-putus adalah batas kategori ISPU resmi.`;

  const W = lebarWadah('#udara-wadah'), H = 252, ml = 40, mr = 14, mt = 18, mb = 46;
  const pw = W - ml - mr, ph = H - mt - mb;
  const maks = Math.max(Math.max(...d.map((t) => t.pm2_5)) * 1.15, 20);
  const X = (i) => ml + (i / (d.length - 1)) * pw;
  const Y = (v) => mt + ph - (v / maks) * ph;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img',
    'aria-label': `Grafik PM2.5 di ${k.nama}, 24 jam terakhir. Nilai sekarang ${k.udaraKini?.pm2_5 ?? '-'} mikrogram per meter kubik.` });

  for (const b of PATAH_PM25) {
    if (b.nilai > maks) continue;
    const y = Y(b.nilai);
    svg.append(el('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: 'var(--grid)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    // Kalau garisnya dekat tepi atas, keterangannya ditaruh di bawah garis —
    // di atas garis ia terpotong bingkai.
    const yTeks = y - 5 < mt + 10 ? y + 13 : y - 5;
    svg.append(el('text', { x: W - mr, y: yTeks, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 11.5, 'font-weight': 600 }, `${b.nama} · ${b.nilai}`));
  }
  for (const v of [0, Math.round(maks / 2), Math.round(maks)])
    svg.append(el('text', { x: ml - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 11.5 }, String(v)));

  const titik = d.map((t, i) => [X(i), Y(t.pm2_5)]);
  const garis = titik.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  svg.append(el('path', { d: `${garis}L${X(d.length - 1)} ${mt + ph}L${ml} ${mt + ph}Z`, fill: 'var(--accent)', 'fill-opacity': 0.1 }));
  svg.append(el('path', { d: garis, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  // Deretnya memang urut dari lama ke baru, tapi tanpa tanggal label "14.00"
  // di kiri dan "13.00" di kanan terbaca seolah mundur. Hari ikut ditulis,
  // dan tanda waktu dipasang di beberapa titik supaya arahnya jelas.
  const jam = (t) => new Date(t).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' });
  const hari = (t) => new Date(t).toLocaleDateString('id-ID', { ...WIB, day: 'numeric', month: 'short' });
  const hariIni = hari(d.at(-1).t);
  const labelWaktu = (t) => (hari(t) === hariIni ? `${jam(t)}` : `${jam(t)}\u2009·\u2009${hari(t)}`);

  const tandaX = [0, Math.round((d.length - 1) / 2), d.length - 1];
  for (const [n, i] of tandaX.entries()) {
    const anchor = n === 0 ? 'start' : n === tandaX.length - 1 ? 'end' : 'middle';
    svg.append(el('line', { x1: X(i), x2: X(i), y1: mt + ph, y2: mt + ph + 4, stroke: 'var(--grid)', 'stroke-width': 1 }));
    svg.append(el('text', { x: X(i), y: H - 16, 'text-anchor': anchor, fill: 'var(--ink-3)', 'font-size': 11 }, labelWaktu(d[i].t)));
  }
  svg.append(el('text', { x: ml, y: H - 3, fill: 'var(--ink-3)', 'font-size': 10.5, 'font-weight': 600 }, 'lebih lama'));
  svg.append(el('text', { x: W - mr, y: H - 3, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 10.5, 'font-weight': 600 }, 'sekarang →'));

  const sorot = el('g', { opacity: 0 });
  const bidik = el('line', { y1: mt, y2: mt + ph, stroke: 'var(--ink-3)', 'stroke-width': 1 });
  const bulat = el('circle', { r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 });
  const LT = 146;
  const kotakT = el('rect', { rx: 7, fill: 'var(--ink)', height: 38, width: LT });
  const teks1 = el('text', { fill: 'var(--bg)', 'font-size': 13, 'font-weight': 700 });
  const teks2 = el('text', { fill: 'var(--bg)', 'font-size': 11.5, opacity: 0.75 });
  sorot.append(bidik, kotakT, teks1, teks2, bulat);
  svg.append(sorot);

  const tutup = el('rect', { x: ml, y: mt, width: pw, height: ph, fill: 'transparent', style: 'cursor:crosshair' });
  const gerak = (ev) => {
    const rc = svg.getBoundingClientRect();
    const px = ((ev.touches?.[0]?.clientX ?? ev.clientX) - rc.left) * (W / rc.width);
    const i = Math.max(0, Math.min(d.length - 1, Math.round(((px - ml) / pw) * (d.length - 1))));
    const [x, y] = titik[i];
    sorot.setAttribute('opacity', 1);
    bidik.setAttribute('x1', x); bidik.setAttribute('x2', x);
    bulat.setAttribute('cx', x); bulat.setAttribute('cy', y);
    const kx = Math.min(Math.max(x - LT / 2, 4), W - LT - 4);
    const ky = Math.max(y - 48, mt);
    kotakT.setAttribute('x', kx); kotakT.setAttribute('y', ky);
    teks1.setAttribute('x', kx + 11); teks1.setAttribute('y', ky + 16);
    teks2.setAttribute('x', kx + 11); teks2.setAttribute('y', ky + 30);
    teks1.textContent = `${d[i].pm2_5} µg/m³ PM2.5`;
    teks2.textContent = `${jam(d[i].t)} WIB · ${hari(d[i].t)}`;
  };
  tutup.addEventListener('pointermove', gerak);
  tutup.addEventListener('pointerdown', gerak);
  tutup.addEventListener('pointerleave', () => sorot.setAttribute('opacity', 0));
  svg.append(tutup);
  wadah.replaceChildren(svg);
}

// ── 4. SUMBER ─────────────────────────────────────────────────────────────
// Sebuah artikel yang MENYEBUT BNPB bukan pernyataan resmi BNPB. Label "Resmi"
// hanya untuk unggahan yang memang berasal dari akun lembaganya, atau dari
// kanal lembaga itu sendiri. Sisanya jurnalisme atau perbincangan.
const AKUN_RESMI = /^@(infobmkg|bnpb_indonesia|pvmbg_|id_magma|bmkg|bnpb)$/i;
function jenisPos(p) {
  if (p.resmi || AKUN_RESMI.test(p.sumber || '')) return 'resmi';
  return p.kanal === 'berita' ? 'berita' : 'sosial';
}
const LABEL_JENIS = { resmi: 'Resmi', berita: 'Berita', sosial: 'Perbincangan' };

/**
 * Linimasa satu aliran, terbaru di atas. Resmi dan perbincangan tidak dipisah
 * jadi dua daftar lagi — orang membaca kabar secara kronologis — tapi tiap butir
 * tetap membawa lencana asalnya, dan penyaring di atas tetap ada untuk yang
 * hanya mau melihat pernyataan resmi.
 */
function gambarKabar() {
  const daftar = D.pos
    .filter((p) => (tabKabar === 'semua' ? true : tabKabar === 'resmi' ? jenisPos(p) === 'resmi' : jenisPos(p) !== 'resmi'))
    .slice()
    .sort((a, b) => b.waktu.localeCompare(a.waktu));

  const peringatan =
    tabKabar === 'resmi'
      ? `<div class="awas-verifikasi" style="background:var(--h-aman-bg);color:var(--h-aman)">${ikon('perisai')}<span>Unggahan dari akun lembaga resmi. Tetap buka tautannya untuk memastikan.</span></div>`
      : `<div class="awas-verifikasi">${ikon('awas')}<span><b>Belum diverifikasi.</b> Butir bertanda <b>Berita</b> adalah liputan media — menyebut sebuah lembaga bukan berarti pernyataan resmi lembaga itu. Butir <b>Perbincangan</b> adalah unggahan yang sedang ramai. Cocokkan dulu dengan laporan PVMBG sebelum meneruskannya.</span></div>`;

  const angka = (n) => (n == null ? null : n >= 1000 ? `${(n / 1000).toFixed(1)} rb` : String(n));

  $('#isi-kabar').innerHTML =
    peringatan +
    (daftar.length
      ? `<ul class="kabar">${daftar.slice(0, 30).map((p) => {
          const jenis = jenisPos(p);
          const metrik = p.metrik
            ? [angka(p.metrik.suka) && `${angka(p.metrik.suka)} suka`, angka(p.metrik.ulang) && `${angka(p.metrik.ulang)} ulang`].filter(Boolean)
            : [];
          // Unggahan media sosial memakai gambar besar (isinya sering foto warga);
          // berita memakai gambar kecil di samping judul supaya daftarnya tetap padat.
          const sosial = jenis !== 'berita';
          const mini = !sosial && p.gambar
            ? `<a class="kabar-mini" href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow" tabindex="-1" aria-hidden="true">
                 <img src="${aman(p.gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
            : '';
          const besar = sosial && p.gambar
            ? `<a class="kabar-media" href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">
                 <img src="${aman(p.gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer">
                 ${p.adaVideo ? `<span class="main">${ikon('main')}</span>` : ''}</a>`
            : '';
          return `<li data-jenis="${jenis}" data-kanal="${aman(p.kanal)}">
            <div class="kabar-meta">
              <span class="kabar-lencana" data-jenis="${jenis}">${LABEL_JENIS[jenis]}</span>
              <span class="asal">${aman(p.penulis ? `${p.penulis} ${p.sumber}` : p.sumber || p.kanal)}</span>
              <span>·</span><span title="${aman(jamWib(p.waktu))}">${lalu(p.waktu)}</span>
            </div>
            <div class="kabar-baris">
              <div>
                <a href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">${aman(p.judul)}</a>
                ${besar}
                ${metrik.length ? `<div class="kabar-metrik">${metrik.map((m) => `<span>${aman(m)}</span>`).join('')}</div>` : ''}
              </div>
              ${mini}
            </div>
          </li>`;
        }).join('')}</ul>`
      : `<p style="color:var(--ink-3)">Belum ada yang masuk di kanal ini.</p>`);
}

const NAMA_SUMBER = {
  'magma-tingkat-aktivitas': 'PVMBG — tingkat aktivitas gunung api',
  'magma-laporan': 'PVMBG — laporan pengamatan 6 jam',
  'magma-laporan-harian': 'PVMBG — ringkasan harian',
  angin: 'Open-Meteo — angin per ketinggian',
  udara: 'Open-Meteo CAMS — kualitas udara',
  'bmkg-gempa': 'BMKG — gempa bumi',
  berita: 'Google News — Anak Krakatau',
  'berita-abu': 'Google News — abu vulkanik',
  'x-nitter': 'X lewat Nitter — pencarian kata kunci',
  'x-resmi': 'X — linimasa akun resmi',
  'x-fxtwitter': 'X lewat FxTwitter — melengkapi isi posting',
  threads: 'Threads — pencarian kata kunci',
};

function gambarSumber() {
  $('#daftar-sumber').innerHTML = D.kesehatan
    .map((s) => `<li class="${s.ok ? 'ok' : 'gagal'}">${ikon(s.ok ? 'cek' : 'silang')}
      <div><b>${aman(NAMA_SUMBER[s.nama] || s.nama)}</b>
      <small>${s.ok ? `Berhasil diambil ${lalu(s.waktu)}` : aman(s.pesan || 'gagal')}</small></div></li>`)
    .join('');
}

// ── jalankan ──────────────────────────────────────────────────────────────
// Muat pertama bisa jatuh tepat saat server sedang mengumpulkan data (503).
// Tanpa percobaan ulang, halaman menggantung sampai penyegaran lima menit —
// terlalu lama untuk halaman peringatan. Jeda dinaikkan bertahap sampai 30 detik.
let percobaan = 0;
function jadwalUlang() {
  const jeda = Math.min(3000 * 2 ** percobaan++, 30000);
  $('#galat-atas').hidden = false;
  $('#galat-atas').textContent = D
    ? `Penyegaran gagal. Angka di bawah dari pengambilan sebelumnya. Mencoba lagi ${Math.round(jeda / 1000)} detik lagi.`
    : `Data belum bisa dimuat. Mencoba lagi ${Math.round(jeda / 1000)} detik lagi…`;
  setTimeout(() => muat().catch(jadwalUlang), jeda);
}

async function muat() {
  const [r, gp] = await Promise.all([
    fetch('/api/terkini', { cache: 'no-store' }),
    garisPantai ? Promise.resolve(null) : fetch('coastline.json').then((x) => (x.ok ? x.json() : null)).catch(() => null),
  ]);
  if (gp) garisPantai = gp;
  if (!r.ok) throw new Error(`server membalas ${r.status}`);
  D = await r.json();

  percobaan = 0;
  $('#galat-atas').hidden = true;
  gambarSegar();
  gambarPilihKota();
  gambarStrip();
  gambarTampilanAktif();
}

$('#tombol-tema').onclick = () => {
  tema = temaEfektif() === 'gelap' ? 'terang' : 'gelap';
  localStorage.setItem('siaga.tema', tema);
  terapkanTema();
};
// Selama pembaca belum memilih, perubahan tema perangkat diikuti — termasuk
// pergantian otomatis siang/malam.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!tema) terapkanTema();
});
for (const b of $$('.tab-u')) b.onclick = () => pindahTab(b.dataset.ke);
for (const b of $$('.strip-sisi')) b.onclick = () => pindahTab(b.dataset.ke);
addEventListener('hashchange', () => pindahTab(location.hash.slice(1), false));
// Dialog bawaan peramban: sudah punya lapisan gelap, jebakan fokus, dan Esc.
const dlg = $('#bantuan');
$('#tombol-bantuan').onclick = () => dlg.showModal();
$('#tutup-bantuan').onclick = () => dlg.close();
// Klik di luar kotaknya menutup — <dialog> sendiri memenuhi seluruh layar.
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

$('#tombol-lokasi').onclick = pakaiLokasi;
$('#alih-siaga').onclick = () => alihPeta(false);
$('#alih-windy').onclick = () => alihPeta(true);
for (const id of ['tab-semua', 'tab-resmi', 'tab-publik'])
  $(`#${id}`).onclick = (e) => {
    tabKabar = id.replace('tab-', '');
    for (const t of $$('.tab')) t.setAttribute('aria-selected', t === e.currentTarget);
    gambarKabar();
  };
// Grafik di dalam lipatan baru punya ukuran setelah lipatannya dibuka.
$('#angin-wadah').closest('details').addEventListener('toggle', (e) => e.target.open && D && gambarAngin());
$('#udara-wadah').closest('details').addEventListener('toggle', (e) => e.target.open && D && gambarUdara());

terapkanTema();
pindahTab(location.hash.slice(1) || 'situasi', false);

muat().catch((e) => {
  console.error(e);
  jadwalUlang();
});

// Grafik digambar dalam piksel, jadi harus digambar ulang saat lebar berubah.
let jedaUkur;
addEventListener('resize', () => {
  clearTimeout(jedaUkur);
  jedaUkur = setTimeout(() => D && gambarTampilanAktif(true), 180);
});

// perbarui waktu relatif tanpa menarik ulang data
setInterval(() => { if (D) { gambarSegar(); if (tampilan === 'sumber') gambarKabar(); } }, 60_000);
// tarik data baru tiap 5 menit selama tab terlihat
setInterval(() => { if (document.visibilityState === 'visible') muat().catch(jadwalUlang); }, 300_000);
// bingkai kamera diperbarui MAGMA sekitar semenit sekali
setInterval(() => { if (tampilan === 'situasi' && document.visibilityState === 'visible') gambarCctv(); }, 60_000);
