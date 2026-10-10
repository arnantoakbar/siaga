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

// Kelas `fl-icon` dari kit wajib ikut: ia yang memberi ukuran bawaan (1.25em). SVG tanpa
// width/height diberi 300x150 oleh peramban, dan ikon hiasan berubah jadi balok raksasa;
// itu pernah terjadi pada keterangan kamera.
const ikon = (nama, kelas) =>
  `<svg viewBox="0 0 24 24" class="fl-icon${kelas ? ` ${kelas}` : ''}" aria-hidden="true"><use href="#i-${String(nama).replace(/^i-/, '')}"/></svg>`;
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
// Status dipetakan ke empat tingkat visual kit Flavida (.fl-level): lingkaran, segitiga,
// belah ketupat, segi delapan. Bentuk, angka tingkat, dan kata selalu berjalan bersama,
// jadi status tidak pernah bergantung pada warna saja.
const TINGKAT = { aman: 1, waspada: 2, siaga: 3, bahaya: 4 };
// Berupa var(), bukan nilai terhitung: peramban yang menyelesaikannya, jadi warna ikut
// berganti saat tema berganti tanpa perlu digambar ulang.
const warnaStatus = (s) => `var(--level-${TINGKAT[s] || 1})`;
const lencana = (status, teks) =>
  `<span class="fl-level" data-level="${TINGKAT[status] || 1}">${aman(teks ?? LABEL_STATUS[status])}</span>`;

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
// `tema` bernilai null selama pembaca belum memilih. Selama null, data-theme="auto"
// dan kit yang mengikuti prefers-color-scheme, termasuk saat perangkat berganti
// tema di tengah jalan.
const gelapPerangkat = () => matchMedia('(prefers-color-scheme: dark)').matches;
const temaUrl = new URLSearchParams(location.search).get('tema');
let tema =
  (temaUrl === 'terang' || temaUrl === 'gelap' ? temaUrl : null) ||
  (['terang', 'gelap'].includes(localStorage.getItem('siaga.tema')) ? localStorage.getItem('siaga.tema') : null);

const temaEfektif = () => tema ?? (gelapPerangkat() ? 'gelap' : 'terang');

function terapkanTema() {
  // Nilai kit: light | dark | auto. `auto` mengikuti perangkat, termasuk saat perangkat berganti.
  document.documentElement.setAttribute('data-theme', tema === 'gelap' ? 'dark' : tema === 'terang' ? 'light' : 'auto');

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
  // Bilah atas (tautan) memakai aria-current; tab bawah (ponsel) memakai aria-selected.
  for (const b of $$('[data-tab]')) {
    const kini = b.dataset.tab === ke;
    if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', kini);
    else if (kini) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
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
    gambarBandara();
    gambarUdara();
  } else if (tampilan === 'sumber') {
    gambarKabar();
    gambarSumber();
  }
}

// ── kepala & strip ────────────────────────────────────────────────────────
function gambarSegar() {
  const s = $('#segar');
  const umurMenit = (Date.now() - Date.parse(D.dibuat)) / 60000;
  // Hijau (bawaan kit) di bawah 30 menit, kuning bersegitiga sampai 3 jam, merah sesudahnya.
  if (umurMenit < 30) s.removeAttribute('data-age');
  else s.dataset.age = umurMenit < 180 ? 'stale' : 'old';
  s.title = `Data diambil ${jamWib(D.dibuat)}`;
  $('#segar-teks').textContent = `Diperbarui ${lalu(D.dibuat)}`;
  // Versi pendek untuk layar sempit: umur data terlalu penting untuk disembunyikan,
  // tapi kalimat penuhnya tidak muat sebaris dengan dua status di strip.
  const menit = Math.round(umurMenit);
  $('#segar-pendek').textContent = menit < 1 ? 'baru saja' : menit < 60 ? `${menit} mnt` : `${Math.floor(menit / 60)} jam`;
  $('#kaki-waktu').textContent = `Halaman ini menarik data tiap beberapa menit. Pengambilan terakhir ${jamWib(D.dibuat)}.`;
}

function gambarStrip() {
  const r = D.ringkas;
  const k = kotaKini();
  $('#strip').hidden = false;
  $('#strip-gunung').innerHTML = r
    ? `<small>Gunung</small>${lencana(r.status, `${r.level} · ${r.levelNama}`)}`
    : `<small>Gunung</small><span class="fl-fresh" data-age="old">Status tidak ada</span>`;
  $('#strip-kota').innerHTML = k
    ? `<small>${aman(k.nama)} · ${k.jarakKm} km</small>${lencana(k.status)}`
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
  if (r.adaTremor) bagian.push('Tremor menerus masih terekam: magma masih bergerak di bawah kawah.');

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
    v.innerHTML = `<div class="fl-callout sg-galat-vonis" data-tone="danger"><span class="fl-callout__icon">${ikon('awas')}</span><div>
      <h3>Status resmi tidak bisa diambil</h3>
      <p>Data dari MAGMA/PVMBG gagal dimuat, jadi halaman ini tidak bisa menampilkan status gunung.
      Jangan simpulkan apa pun dari sini. Buka <a class="fl-link" href="https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas" rel="noopener">magma.esdm.go.id</a> langsung.</p>
      <img src="flavida/flav-worried.webp" alt="Flav tampak khawatir" width="88" height="84"></div></div>`;
    return;
  }

  const arti = ARTI_LEVEL[r.level];
  v.innerHTML = `
    <div class="sg-hero">
      <h1 class="fl-display-l">${aman(lap.gunung)} berstatus <mark class="fl-marker">Level ${aman(r.level)}</mark></h1>
      ${r.radiusLaranganKm ? `<div class="sg-hero__tanda"><span class="fl-level" data-level="4">Dilarang dalam ${r.radiusLaranganKm} km</span></div>` : ''}
      <p class="fl-lead">${aman(arti)}</p>
      <ul class="sg-poin">${ringkasSituasi(r, lap).map((b) => `<li>${aman(b)}</li>`).join('')}</ul>
      <div class="sg-fakta">
        <div class="fl-stat"><small>Gempa letusan</small><b>${r.gempaLetusan ?? '—'}</b></div>
        <div class="fl-stat"><small>Total gempa</small><b>${r.totalGempa ?? '—'}</b></div>
        <div class="fl-stat"><small>Tremor menerus</small><b class="teks">${r.adaTremor == null ? '—' : r.adaTremor ? 'Ada' : 'Tidak ada'}</b></div>
      </div>
      <p class="sg-cap">${ikon('jam')}<span>Laporan pengamatan PVMBG <b>${aman(lap.tanggal)}</b>, periode ${aman(lap.periodeMulai)}–${aman(lap.periodeSelesai)} WIB.
        Terbit ${lalu(lap.waktuLaporan)}. Pengamat: ${aman(lap.pembuat || '—')}.</span></p>
      ${D.laporanCadangan ? `<p class="sg-cap sg-cap--awas">${ikon('awas')}<span><b>Pengambilan laporan terbaru gagal.</b> Yang tampil adalah laporan tersimpan terakhir. Level gunung tetap dari tabel tingkat aktivitas PVMBG.</span></p>` : ''}
    </div>`;

  gambarTangga(r);

  $('#visual-lengkap').innerHTML = [
    lap.visual && `<p><b>Pengamatan visual.</b> ${aman(lap.visual)}</p>`,
    lap.keterangan && `<p><b>Keterangan lainnya.</b> ${aman(lap.keterangan)}</p>`,
    lap.klimatologi && `<p><b>Klimatologi.</b> ${aman(lap.klimatologi)}</p>`,
    r.ringkasHarian && `<p><b>Ringkasan harian.</b> ${aman(r.ringkasHarian)}</p>`,
    `<p><a class="fl-link" href="${aman(lap.url)}" target="_blank" rel="noopener">Buka laporan asli di MAGMA Indonesia</a></p>`,
  ].filter(Boolean).join('');
}

// Hanya huruf pertama: toLowerCase() utuh ikut menurunkan awal kalimat kedua ("... erupsi. ada radius").
const awalKecil = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Empat tingkat PVMBG sebagai tangga: makin ke kanan makin berbahaya. */
/** Empat tingkat PVMBG sebagai tangga: makin ke kanan makin berbahaya. */
function gambarTangga(r) {
  const idx = TANGGA.findIndex((t) => t.kode === r.level);
  const naik = TANGGA[idx + 1];
  $('#tangga-level').innerHTML = `
    <div class="sg-tangga">
      <div class="sg-tangga__baris">
        ${TANGGA.map((t, i) => `
          <div class="sg-tangga__sel" data-level="${i + 1}" data-kini="${t.kode === r.level}" ${t.kode === r.level ? 'aria-current="true"' : ''}>
            <small>Level ${t.kode}</small><b>${t.nama}</b>
          </div>`).join('')}
      </div>
      <div class="sg-tangga__arah"><span>lebih aman</span><span>lebih berbahaya →</span></div>
      <p class="sg-tangga__arti"><b>Sekarang di Level ${aman(r.level)} dari IV.</b>
        ${aman(ARTI_LEVEL[r.level])}
        ${naik ? `Kalau naik ke Level ${naik.kode}, artinya ${aman(awalKecil(ARTI_LEVEL[naik.kode]))}` : ''}
      </p>
      <details class="fl-accordion sg-lipat"><summary>Arti keempat tingkat</summary>
        <div>
          <ol>${TANGGA.map((t) => `<li><b>Level ${t.kode}, ${t.nama}.</b> ${aman(ARTI_LEVEL[t.kode])}</li>`).join('')}</ol>
          <p><a class="fl-link sg-sumber" href="https://magma.esdm.go.id/v1/gunung-api/tingkat-aktivitas" target="_blank" rel="noopener">${ikon('tautan')}Tabel tingkat aktivitas PVMBG</a></p>
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
    // Bingkai diperbarui sekitar semenit sekali: lewat 10 menit berarti ada yang macet.
    const menit = (Date.now() - t) / 60000;
    const usia = menit < 10 ? '' : menit < 60 ? ' data-age="stale"' : ' data-age="old"';

    wadah.innerHTML = `
      <div class="sg-cam-grid">
        ${j.kamera.map((k, i) => `
          <button class="fl-cam sg-cam" type="button" data-i="${i}" aria-pressed="false" title="${aman(k.nama)}">
            <img src="/api/cctv/${i}.jpg?t=${t}" alt="Kamera ${aman(k.nama)}"
                 width="${k.lebar || 150}" height="${k.tinggi || 84}">
            <span class="sg-cam__gagal">${ikon('silang')}Bingkai tidak tersedia</span>
            <span class="fl-cam__bar"><span>${aman(k.nama.replace(/^Anak Krakatau\s*-\s*/i, ''))}</span></span>
          </button>`).join('')}
      </div>
      <div id="cctv-besar"></div>
      <p class="sg-cam-kaki"><span class="fl-fresh"${usia}>Diambil ${lalu(j.diambil)}</span>
        Bingkai diperbarui sekitar semenit sekali. Ukuran 150 × 84 piksel, sebagaimana disediakan halaman publik MAGMA.
        Gambar oleh ${aman(j.lisensi)}, disajikan tanpa perubahan.
        <a class="fl-link" href="${aman(j.sumberUrl)}" target="_blank" rel="noopener">Buka di MAGMA</a>.</p>`;

    // Bingkai yang gagal dimuat tidak boleh menyisakan ikon gambar rusak bawaan
    // peramban; diganti keterangan yang menyebutkan apa yang terjadi.
    for (const im of $$('.sg-cam img', wadah)) {
      im.onerror = () => { im.closest('.sg-cam').dataset.gagal = 'true'; };
      if (im.complete && im.naturalWidth === 0) im.onerror();
    }

    for (const b of $$('.sg-cam', wadah))
      b.onclick = () => {
        const i = Number(b.dataset.i);
        cctvBesar = cctvBesar === i ? null : i;
        for (const x of $$('.sg-cam', wadah)) x.setAttribute('aria-pressed', Number(x.dataset.i) === cctvBesar);
        $('#cctv-besar').innerHTML =
          cctvBesar == null
            ? ''
            : `<figure class="sg-cam-besar">
                 <div class="fl-cam"><img src="/api/cctv/${cctvBesar}.jpg?t=${t}" alt="${aman(j.kamera[cctvBesar].nama)}"></div>
                 <figcaption class="sg-cam-kaki">${aman(j.kamera[cctvBesar].nama)} · ${j.kamera[cctvBesar].lebar}×${j.kamera[cctvBesar].tinggi} piksel ·
                   <a class="fl-link" href="${aman(j.sumberUrl)}" target="_blank" rel="noopener">lihat di MAGMA</a></figcaption>
               </figure>`;
      };
  } catch (e) {
    wadah.innerHTML = `<div class="fl-alert fl-alert--warning">${ikon('silang')}<div><strong>Kamera pemantau tidak bisa diambil</strong>
      <p>${aman(e.message)}. Coba langsung di <a class="fl-link" href="https://magma.esdm.go.id/v1/gunung-api/cctv" target="_blank" rel="noopener">MAGMA Indonesia</a>.</p></div></div>`;
  }
}

function gambarGempa() {
  const g = D.laporan?.kegempaan || [];
  const wadah = $('#gempa-wadah');
  if (!g.length) {
    wadah.innerHTML = '<p class="sg-kosong" style="padding:24px">Rincian kegempaan tidak tersedia pada laporan terakhir.</p>';
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
        ? el('text', { x: ml, y: y - 6, fill: sorot ? 'var(--color-ink)' : 'var(--color-mid)', 'font-size': 13, 'font-weight': sorot ? 800 : 600 }, x.jenis)
        : el('text', { x: ml - 12, y: y + tb / 2 + 4, 'text-anchor': 'end', fill: sorot ? 'var(--color-ink)' : 'var(--color-mid)', 'font-size': 13, 'font-weight': sorot ? 800 : 600 }, x.jenis)
    );
    svg.append(el('rect', { x: ml, y, width: w, height: tb, rx: 6, fill: sorot ? 'var(--chart-1)' : 'var(--chart-8)', 'fill-opacity': sorot ? 1 : 0.85 }));
    svg.append(el('text', { x: ml + w + 9, y: y + tb / 2 + 4.5, fill: 'var(--color-ink)', 'font-size': 13, 'font-weight': 800 }, String(x.jumlah)));
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
  gambarUdara();
}

function gambarRingkasLokasi() {
  const k = kotaKini();
  if (!k) return;
  $('#ringkas-lokasi').innerHTML = `
    <div class="sg-ukur">
      <div class="fl-stat"><small>Jarak</small><b>${k.jarakKm}<em>km</em></b></div>
      <div class="fl-stat"><small>Arah</small><b class="teks">${aman(k.arahMata)}</b></div>
      <div class="fl-stat"><small>Jalur abu</small><b class="teks">${k.diJalurAbu ? 'Ya' : 'Tidak'}</b></div>
    </div>`;
}

// ── 3. DAMPAK ─────────────────────────────────────────────────────────────
function gambarDampak() {
  const k = kotaKini();
  if (!k) return;
  const i = k.ispu;
  $('#kartu-dampak').innerHTML = `
    <div class="fl-card sg-kota">
      <div class="sg-kota__kepala">
        <div><h3>${aman(k.nama)}</h3><p>${k.dariPerangkat ? 'Dari lokasi perangkat kamu' : aman(k.provinsi)}</p></div>
        ${lencana(k.status)}
      </div>
      <div class="sg-ukur">
        <div class="fl-stat"><small>Jarak</small><b>${k.jarakKm}<em>km</em></b></div>
        <div class="fl-stat"><small>ISPU 24 jam</small><b>${i ? i.nilai : '—'}</b><span class="sg-kat">${i ? aman(i.kategori) : 'data tidak ada'}</span></div>
        <div class="fl-stat"><small>Jalur abu</small><b class="teks">${k.diJalurAbu ? 'Ya' : 'Tidak'}</b></div>
      </div>
      ${k.alasan.length ? `<ul class="sg-alasan">${k.alasan.map((a) => `<li>${ikon('info')}<div>${bolehPutus(a.teks)}
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
    ? `<a class="fl-link sg-sumber" href="${aman(t.sumberUrl)}" target="_blank" rel="noopener">${ikon('tautan')}Buka sumbernya</a>`
    : '';

function gambarTindakan() {
  const k = kotaKini();
  const wadah = $('#tindakan');
  if (!k?.langkah?.length) {
    wadah.innerHTML = `<div class="fl-callout" data-tone="tip"><span class="fl-callout__icon">${ikon('cek')}</span><div><p>Tidak ada tindakan khusus untuk ${aman(k?.nama ?? 'lokasi ini')} saat ini. Tetap ikuti kabar resmi.</p></div></div>`;
    return;
  }
  const utama = k.langkah.filter((t) => t.prioritas === 1);
  const sisa = k.langkah.filter((t) => t.prioritas !== 1);
  // Nada callout mengikuti status kota; ikon dan kalimatnya tetap membawa maknanya sendiri.
  const nada = { aman: 'tip', waspada: 'warn', siaga: 'warn', bahaya: 'danger' }[k.status];

  wadah.innerHTML =
    utama.map((t) => `<div class="fl-callout" data-tone="${nada}"><span class="fl-callout__icon">${ikon(t.ikon)}</span><div>
        <p>${bolehPutus(t.teks)}</p>
        <small>${aman(t.sumber)} · ${aman(t.dasar)}</small>
        ${tautanSumber(t)}
      </div></div>`).join('') +
    (sisa.length
      ? `<div class="sg-petak">${sisa
          .map((t, n) => `<button class="sg-petak__sel" type="button" data-n="${n}" aria-expanded="false"><span class="fl-card__icon">${ikon(t.ikon)}</span><span>${aman(t.ringkas || 'Tindakan')}</span></button>`)
          .join('')}</div><div id="tindakan-detail"></div>`
      : '');

  if (!sisa.length) return;
  const detail = $('#tindakan-detail');
  const tampilkan = () => {
    for (const x of $$('.sg-petak__sel', wadah)) x.setAttribute('aria-expanded', Number(x.dataset.n) === tindakanTerbuka);
    const t = sisa[tindakanTerbuka];
    detail.innerHTML = t
      ? `<div class="sg-petak-detail"><p>${bolehPutus(t.teks)}</p>
           <small>${aman(t.sumber)} · ${aman(t.dasar)}</small>${tautanSumber(t)}</div>`
      : '';
    // Petaknya bisa tiga baris; tanpa ini detail terbuka di luar layar.
    if (t) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  for (const b of $$('.sg-petak__sel', wadah))
    b.onclick = () => {
      const n = Number(b.dataset.n);
      tindakanTerbuka = tindakanTerbuka === n ? null : n;
      tampilkan();
    };
  if (tindakanTerbuka != null && tindakanTerbuka < sisa.length) tampilkan();
  else tindakanTerbuka = null;
}

// ── bandara & penerbangan ─────────────────────────────────────────────────
// Satu aturan yang memegang seluruh blok ini: JANGAN PERNAH menulis bandara
// "buka" atau "tutup". Keputusan itu diumumkan lewat NOTAM oleh AirNav Indonesia,
// dan layanan ini tidak punya aksesnya (alasan lengkapnya di src/sumber/penerbangan.js).
// Orang membatalkan perjalanan berdasarkan kalimat seperti itu, jadi yang ditulis
// hanya dua hal yang memang diamati: peringatan abu penerbangan dari BMKG, dan
// laporan cuaca yang ditulis bandaranya sendiri.

const KAKI_KE_KM = 0.0003048;
const KNOT_KE_KMJ = 1.852;

// Nama diri yang datang HURUF BESAR SEMUA dari sumbernya (KRAKATAU, JAKARTA).
const kapital = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
// Awal kalimat saja. Jangan pakai kapital() untuk kalimat: "jarak pandang 3 km"
// berubah jadi "Jarak Pandang 3 Km", dan satuan km tidak pernah ditulis besar.
const awalBesar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const angkaId = (n) => Number(n).toLocaleString('id-ID');

/** Jarak pandang METAR (meter) jadi potongan kalimat. */
function pandangTeks(p) {
  if (!p) return null;
  if (p.atauLebih) return 'jarak pandang 10 km atau lebih';
  return p.meter >= 1000 ? `jarak pandang ${angkaId(p.meter / 1000)} km` : `jarak pandang ${p.meter} m`;
}

function kartuSigmet(s) {
  const wilayah = kapital(String(s.firNama || s.fir).replace(/^W\w{3}\s+/, '')) || s.fir;
  const rinci = [];
  if (s.puncakKaki != null)
    rinci.push(
      `abu terpantau dari permukaan sampai ${angkaId(s.puncakKaki)} kaki (sekitar ${angkaId(
        Math.round(s.puncakKaki * KAKI_KE_KM * 10) / 10
      )} km)`
    );
  if (s.arahTeks && s.kecepatanKnot)
    rinci.push(`bergerak ke ${s.arahTeks} sekitar ${Math.round(s.kecepatanKnot * KNOT_KE_KMJ)} km/jam`);

  return `<div class="fl-callout" data-tone="warn"><span class="fl-callout__icon">${ikon('pesawat')}</span><div>
      <p>Ada peringatan abu vulkanik untuk penerbangan${
        s.gunung ? ` dari ${aman(kapital(s.gunung))}` : ''
      } di wilayah udara ${aman(wilayah)}${rinci.length ? `. ${aman(awalBesar(rinci.join(', ')))}` : ''}.</p>
      <small>SIGMET ${aman(s.nomor)} ${aman(s.fir)}, terbitan kantor meteorologi penerbangan${
        s.sampai ? ` · berlaku sampai ${jamWib(s.sampai)}` : ''
      }</small>
      ${s.teksAsli ? `<details class="sg-sigmet-asli"><summary>Teks aslinya</summary><pre>${aman(s.teksAsli)}</pre></details>` : ''}
    </div></div>`;
}

/**
 * Satu judul berita, apa adanya.
 *
 * Judulnya TIDAK diringkas dan TIDAK ditafsirkan jadi lencana buka/tutup. Status
 * bandara berubah beberapa kali sehari — "ditutup sampai pukul 10.00" dan "kembali
 * beroperasi" bisa terbit berjarak dua jam. Karena itu jamnya ditulis mencolok dan
 * pembaca yang menilai sendiri mana yang masih berlaku.
 */
const butirKabar = (k) => `<li data-src="news">
    <div class="fl-feed__meta"><span class="fl-src" data-src="news">Berita</span>
      <span class="asal">${aman(k.sumber || 'sumber tidak tertulis')}</span><span>${jamWib(k.waktu)} · ${lalu(k.waktu)}</span></div>
    <h4><a href="${aman(k.tautan)}" target="_blank" rel="noopener">${aman(k.judul)}</a></h4>
  </li>`;
// Versi ringkas untuk di dalam kartu bandara: satu judul, tanpa lencana.
const butirKabarKecil = (k) => `<div class="sg-kabar-satu">
    <a href="${aman(k.tautan)}" target="_blank" rel="noopener">${aman(k.judul)}</a>
    <small>${aman(k.sumber || 'sumber tidak tertulis')} · ${jamWib(k.waktu)} · ${lalu(k.waktu)}</small>
  </div>`;

function kartuBandara(b) {
  const m = b.metar;
  const rinci = [pandangTeks(m?.pandang), ...(m?.cuaca || [])].filter(Boolean);
  return `<li class="fl-card sg-bandara">
      <div class="sg-bandara__atas"><h4>${aman(b.nama)}</h4><span class="fl-tag fl-tag--outline">${aman(b.iata)}</span></div>
      <p class="sg-bandara__tempat">${aman(b.kota)} · ${b.jarakKm} km dari kawah</p>
      ${b.status ? lencana(b.status, b.label) : `<span class="fl-fresh" data-age="stale">${aman(b.label)}</span>`}
      ${rinci.length ? `<p class="sg-bandara__cuaca">${aman(awalBesar(rinci.join(', ')))}.</p>` : ''}
      <small class="sg-bandara__kaki">${
        m?.waktu ? `Laporan ${jamWib(m.waktu)}` : 'Belum ada laporan terbaru'
      } · <a class="fl-link" href="https://aviationweather.gov/data/metar/?id=${aman(b.icao)}" target="_blank" rel="noopener">METAR ${aman(b.icao)}</a></small>
      ${b.kabar?.length ? butirKabarKecil(b.kabar[0]) : ''}
    </li>`;
}

function gambarBandara() {
  const wadah = $('#bandara');
  const daftar = D.bandara || [];
  const sig = D.sigmet || [];
  const bagian = [];

  // Gagal ambil dan "tidak ada peringatan" adalah dua hal berbeda. Menyamakannya
  // berarti menyajikan kesenyapan sebagai kabar baik, dan itu yang paling berbahaya.
  if (D.sigmetGagal)
    bagian.push(`<div class="fl-callout" data-tone="warn"><span class="fl-callout__icon">${ikon('info')}</span><div>
        <p>Peringatan abu untuk penerbangan gagal diambil pada pembaruan terakhir.</p>
        <small>Kosongnya bagian ini bukan berarti tidak ada peringatan.</small>
      </div></div>`);
  else if (!sig.length)
    bagian.push(`<div class="fl-callout" data-tone="tip"><span class="fl-callout__icon">${ikon('cek')}</span><div>
        <p>Tidak ada peringatan abu vulkanik yang sedang berlaku untuk wilayah udara Jakarta.</p>
        <small>Diperiksa ${lalu(D.dibuat)}</small>
      </div></div>`);
  else bagian.push(...sig.map(kartuSigmet));

  const kabar = D.kabarBandara || [];
  if (D.kabarBandaraGagal)
    bagian.push(`<div class="fl-callout" data-tone="warn"><span class="fl-callout__icon">${ikon('info')}</span><div>
        <p>Kabar penutupan dan pembukaan bandara gagal diambil pada pembaruan terakhir.</p>
        <small>Kosongnya bagian ini bukan berarti semua bandara beroperasi normal.</small>
      </div></div>`);
  else if (!kabar.length)
    bagian.push(`<div class="fl-callout" data-tone="note"><span class="fl-callout__icon">${ikon('info')}</span><div>
        <p>Tidak ada pemberitaan penutupan atau pembukaan bandara akibat abu dalam 3 hari terakhir di sumber yang dipantau.</p>
        <small>Itu bukan jaminan semua bandara beroperasi normal. Untuk jadwal penerbanganmu, tanya maskapai.</small>
      </div></div>`);
  else
    bagian.push(`<div class="sg-kabar-bandara">
        <h4>Kabar penutupan &amp; pembukaan</h4>
        <p>Pengumuman resmi AirNav Indonesia dan Kemenhub seperti diberitakan media.
          <b>Perhatikan jamnya</b>, karena status bandara bisa berubah beberapa kali dalam sehari.</p>
        <ul class="fl-feed sg-feed">${kabar.map(butirKabar).join('')}</ul>
      </div>`);

  if (daftar.length) bagian.push(`<ul class="sg-bandara-grid">${daftar.map(kartuBandara).join('')}</ul>`);

  bagian.push(`<div class="fl-callout sg-bandara-catatan" data-tone="note"><span class="fl-callout__icon">${ikon('info')}</span><div>
      <h3>Lencana hijau bukan berarti bandaranya buka</h3>
      <p>Ia cuma bilang tidak ada abu di laporan cuaca bandara itu. Keputusan buka atau tutup
      diumumkan lewat NOTAM oleh AirNav Indonesia; salurannya tidak terbuka gratis, jadi
      halaman ini membacanya lewat pemberitaan, bukan langsung dari sumbernya, dan bisa
      tertinggal. Untuk jadwal penerbanganmu, tanya maskapai.</p>
      <p><a class="fl-link sg-sumber" href="https://www.airnavindonesia.co.id/" target="_blank" rel="noopener">${ikon('tautan')}AirNav Indonesia</a>
         <a class="fl-link sg-sumber" href="https://injourneyairports.id/" target="_blank" rel="noopener">${ikon('tautan')}InJourney Airports</a></p>
    </div></div>`);

  wadah.innerHTML = bagian.join('');
}

// ── lokasi perangkat ──────────────────────────────────────────────────────
// Izin tidak pernah diminta saat halaman dibuka — pengguna yang menekan tombol.
// Koordinat dibulatkan ke 2 desimal (~1,1 km) sebelum dikirim, lewat badan POST,
// dan tidak disimpan di mana pun.
function kabarLokasi(teks, nada, aksi) {
  const e = $('#lokasi-kabar');
  e.hidden = !teks;
  e.classList.toggle('fl-alert--error', nada === 'galat');
  if (!teks) return;
  e.innerHTML = `${ikon(nada === 'galat' ? 'awas' : 'pin')}<div><p>${aman(teks)}</p></div>`;
  if (aksi) {
    const b = html('button', { type: 'button' }, aksi.label);
    b.onclick = aksi.fn;
    e.querySelector('p').append(b);
  }
}

/** Tombol lokasi: '' (diam), 'memuat' (titik melompat milik kit), 'aktif' (menyala). */
function keadaanTombolLokasi(keadaan) {
  const b = $('#tombol-lokasi');
  b.classList.toggle('is-loading', keadaan === 'memuat');
  b.setAttribute('aria-pressed', keadaan === 'aktif');
}

async function pakaiLokasi() {
  if (!navigator.geolocation)
    return kabarLokasi('Peramban ini tidak mendukung deteksi lokasi. Pilih kota terdekat secara manual.', 'galat');

  keadaanTombolLokasi('memuat');
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
    keadaanTombolLokasi('aktif');
    gambarPilihKota();
    gantiKota();
    kabarLokasi('Memakai lokasi perangkat, dibulatkan ke sekitar 1 km. Koordinat tidak disimpan.', '', {
      label: 'Kembali ke daftar kota',
      fn: lepasLokasi,
    });
  } catch (e) {
    keadaanTombolLokasi('');
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
  keadaanTombolLokasi('');
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

// Empat lapisan angin memakai seri kategorikal kit (--chart-n): rona yang berbeda untuk
// tiap ketinggian, jadi kerucut yang bertumpuk tetap terbaca, dan label menyebut
// ketinggiannya. Berupa var() supaya ikut berganti dengan tema.
const RONA = { 850: 'var(--chart-2)', 700: 'var(--chart-3)', 500: 'var(--chart-1)', 250: 'var(--chart-5)' };
const warnaRona = (hPa) => RONA[hPa] || 'var(--chart-1)';

/** Penanda kota: bentuknya mengikuti tingkat (bulat, segitiga, belah ketupat, segi delapan), sama dengan chip status. */
function penanda(status, x, y, r, atr) {
  const t = TINGKAT[status] || 1;
  if (t === 1) return el('circle', { cx: x, cy: y, r, ...atr });
  const titik = {
    2: [[0, -1.15], [1.05, 0.85], [-1.05, 0.85]],
    3: [[0, -1.3], [1.3, 0], [0, 1.3], [-1.3, 0]],
    4: Array.from({ length: 8 }, (_, i) => [1.12 * Math.cos(((22.5 + i * 45) * Math.PI) / 180), 1.12 * Math.sin(((22.5 + i * 45) * Math.PI) / 180)]),
  }[t];
  return el('polygon', { points: titik.map(([a, b]) => `${(x + a * r).toFixed(1)},${(y + b * r).toFixed(1)}`).join(' '), 'stroke-linejoin': 'round', ...atr });
}

function gambarSaringLapisan() {
  const wadah = $('#saring-lapisan');
  wadah.innerHTML = '';
  const lap = D.angin?.lapisan || [];
  if (!lap.length) return;
  if (!lapisanAktif.size) lap.forEach((l) => lapisanAktif.add(l.hPa));

  for (const l of lap) {
    const b = html('button', { class: 'sg-chip', type: 'button', 'aria-pressed': lapisanAktif.has(l.hPa) });
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
  const svg = el('svg', { class: 'sg-peta', viewBox: `0 0 ${p.lebar} ${p.tinggi}`, role: 'img',
    'aria-label': `Peta Selat Sunda: posisi ${g.nama}, arah sebaran abu, dan status ${D.kota.length} kota.` });

  svg.append(el('rect', { width: p.lebar, height: p.tinggi, fill: 'var(--sg-laut)' }));

  if (garisPantai)
    for (const baris of garisPantai.lines) {
      const d = baris.map(([lo, la], i) => `${i ? 'L' : 'M'}${p.xy(lo, la).map((v) => v.toFixed(1)).join(' ')}`).join('');
      svg.append(el('path', { d: d + 'Z', fill: 'var(--sg-darat)', stroke: 'var(--color-border-hover)', 'stroke-width': 1 }));
    }

  for (const km of [50, 100, 200, 300]) {
    const r = p.km(km);
    svg.append(el('circle', { cx: gx, cy: gy, r, fill: 'none', stroke: 'var(--color-border-hover)', 'stroke-width': 1.2, 'stroke-dasharray': '5 5' }));
    const a = (215 * Math.PI) / 180;
    const lx = gx + r * Math.cos(a), ly = gy + r * Math.sin(a);
    if (lx > 26 && ly < p.tinggi - 8)
      svg.append(el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--color-light)', 'font-size': fs(11), 'font-weight': 700, 'paint-order': 'stroke', stroke: 'var(--sg-laut)', 'stroke-width': fs(3) }, `${km} km`));
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
    if (dipilih) t.append(el('circle', { cx: x, cy: y, r: fs(12), fill: 'none', stroke: 'var(--color-ink)', 'stroke-width': fs(1.5) }));
    t.append(penanda(k.status, x, y, fs(dipilih ? 7 : 5.6), { fill: warnaStatus(k.status), stroke: 'var(--surface)', 'stroke-width': fs(1.8) }));

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
      t.append(el('text', { x: x + c.dx, y: y + c.dy, 'text-anchor': c.anchor, fill: 'var(--color-ink)',
        'font-size': fs(12), 'font-weight': dipilih ? 800 : 700, 'paint-order': 'stroke',
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
    svg.append(el('circle', { cx: gx, cy: gy, r: Math.max(p.km(r.radiusLaranganKm), fs(3)), fill: 'var(--level-4)', 'fill-opacity': 0.35, stroke: 'var(--level-4)', 'stroke-width': 1.5 }));
  svg.append(el('path', { d: `M${gx} ${gy - fs(10)} L${gx + fs(9)} ${gy + fs(7)} L${gx - fs(9)} ${gy + fs(7)} Z`, fill: 'var(--color-ink)', stroke: 'var(--surface)', 'stroke-width': fs(1.5) }));
  svg.append(el('text', { x: gx, y: gy + fs(22), 'text-anchor': 'middle', fill: 'var(--color-ink)', 'font-size': fs(12.5), 'font-weight': 800, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': fs(3.5) }, g.nama));

  $('#peta-wadah').replaceChildren(svg);
  $('#peta-keterangan').innerHTML = Object.keys(LABEL_STATUS).map((s) => lencana(s)).join('');
  $('#peta-kaki').textContent = kakiPeta();

  gambarTabelKota();
}

/** Padanan tabel untuk peta: identitas tidak pernah lewat warna saja. */
/** Padanan tabel untuk peta: identitas tidak pernah lewat warna saja. */
function gambarTabelKota() {
  const tabel = $('#tabel-kota');
  tabel.innerHTML = `<div class="fl-tablewrap"><table class="fl-dt fl-dt--stack">
    <thead><tr><th>Kota</th><th class="num">Jarak</th><th>Arah</th><th class="num">ISPU</th><th>Status</th></tr></thead>
    <tbody>${D.kota.map((k) => `
      <tr data-kota="${aman(k.kotaId)}" data-pilih="${k.kotaId === kotaTerpilih}" ${k.kotaId === kotaTerpilih ? 'aria-current="true"' : ''} tabindex="0" role="button"
          aria-label="Pilih ${aman(k.nama)}">
        <td data-label="Kota">${aman(k.nama)}</td>
        <td class="num" data-label="Jarak">${k.jarakKm} km</td>
        <td data-label="Arah">${aman(k.arahMata)}</td>
        <td class="num" data-label="ISPU">${k.ispu?.nilai ?? '—'}</td>
        <td data-label="Status">${lencana(k.status)}</td>
      </tr>`).join('')}
    </tbody></table></div>`;

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
    wadah.append(html('div', { class: 'fl-alert fl-alert--warning sg-windy-catatan' },
      `${ikon('awas')}<div><strong>Lapisan ini dimuat dari windy.com</strong>
       <p>Kalau kamu membukanya, peramban kamu menghubungi server mereka dan mereka bisa melihat alamat IP kamu.
       Peta bawaan Siaga tidak memanggil siapa pun. Data Windy berasal dari model ECMWF dan CAMS: perkiraan,
       bukan pengamatan resmi PVMBG.</p>
       <button class="fl-btn fl-btn--sm" type="button" id="windy-setuju">Muat peta Windy</button></div>`));
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
    const b = html('button', { class: 'sg-chip', type: 'button', 'aria-pressed': windyOverlay === o.kunci, title: o.satuan });
    b.textContent = o.nama;
    b.onclick = () => { windyOverlay = o.kunci; gambarWindy(); };
    saring.append(b);
  }
  if (windyOverlay === 'wind')
    for (const l of WINDY_LEVEL) {
      const b = html('button', { class: 'sg-chip', type: 'button', 'aria-pressed': windyLevel === l.kunci });
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
  $('#alih-siaga').checked = !keWindy;
  $('#alih-windy').checked = keWindy;
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
    wadah.innerHTML = '<p class="sg-kosong" style="padding:24px">Data angin tidak tersedia saat ini.</p>';
    return;
  }
  const W = lebarWadah('#angin-wadah');
  const H = Math.round(Math.min(320, Math.max(240, W * 0.72)));
  const cx = W / 2, cy = H / 2 + 4, R = Math.min(W, H) / 2 - 58;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img',
    'aria-label': 'Arah dan kecepatan angin pada empat ketinggian di atas kawah.' });

  for (const f of [0.34, 0.67, 1]) svg.append(el('circle', { cx, cy, r: R * f, fill: 'none', stroke: 'var(--color-border-hover)', 'stroke-width': 1 }));
  for (const [i, m] of ['U', 'T', 'S', 'B'].entries()) {
    const a = ((i * 90 - 90) * Math.PI) / 180;
    svg.append(el('text', { x: cx + (R + 18) * Math.cos(a), y: cy + (R + 18) * Math.sin(a) + 5, 'text-anchor': 'middle', fill: 'var(--color-light)', 'font-size': 13, 'font-weight': 800 }, m));
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
    g.append(el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--color-ink)', 'font-size': 12.5, 'font-weight': 800, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': 3.5 }, `~${l.kmKira} km · ${Math.round(l.kecepatanKmj)} km/j`));
    svg.append(g);
  }
  svg.append(el('circle', { cx, cy, r: 5, fill: 'var(--color-ink)' }));
  svg.append(el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', fill: 'var(--color-light)', 'font-size': 11.5, 'font-weight': 700 }, 'titik tengah = kawah'));
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
    wadah.innerHTML = '<p class="sg-kosong" style="padding:24px">Deret kualitas udara untuk lokasi ini tidak tersedia.</p>';
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
    svg.append(el('line', { x1: ml, x2: W - mr, y1: y, y2: y, stroke: 'var(--color-border-hover)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    // Kalau garisnya dekat tepi atas, keterangannya ditaruh di bawah garis —
    // di atas garis ia terpotong bingkai.
    const yTeks = y - 5 < mt + 10 ? y + 13 : y - 5;
    svg.append(el('text', { x: W - mr, y: yTeks, 'text-anchor': 'end', fill: 'var(--color-mid)', 'font-size': 11.5, 'font-weight': 700, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': 4, 'stroke-linejoin': 'round' }, `${b.nama} · ${b.nilai}`));
  }
  for (const v of [0, Math.round(maks / 2), Math.round(maks)])
    svg.append(el('text', { x: ml - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--color-light)', 'font-size': 11.5 }, String(v)));

  const titik = d.map((t, i) => [X(i), Y(t.pm2_5)]);
  const garis = titik.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  svg.append(el('path', { d: `${garis}L${X(d.length - 1)} ${mt + ph}L${ml} ${mt + ph}Z`, fill: 'var(--chart-1)', 'fill-opacity': 0.14 }));
  svg.append(el('path', { d: garis, fill: 'none', stroke: 'var(--chart-1)', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

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
    svg.append(el('line', { x1: X(i), x2: X(i), y1: mt + ph, y2: mt + ph + 4, stroke: 'var(--color-border-hover)', 'stroke-width': 1 }));
    svg.append(el('text', { x: X(i), y: H - 16, 'text-anchor': anchor, fill: 'var(--color-light)', 'font-size': 11 }, labelWaktu(d[i].t)));
  }
  svg.append(el('text', { x: ml, y: H - 3, fill: 'var(--color-light)', 'font-size': 10.5, 'font-weight': 700 }, 'lebih lama'));
  svg.append(el('text', { x: W - mr, y: H - 3, 'text-anchor': 'end', fill: 'var(--color-light)', 'font-size': 10.5, 'font-weight': 700 }, 'sekarang →'));

  const sorot = el('g', { opacity: 0 });
  const bidik = el('line', { y1: mt, y2: mt + ph, stroke: 'var(--color-light)', 'stroke-width': 1 });
  const bulat = el('circle', { r: 5.5, fill: 'var(--chart-1)', stroke: 'var(--surface)', 'stroke-width': 2 });
  const LT = 146;
  const kotakT = el('rect', { rx: 10, fill: 'var(--color-charcoal)', height: 38, width: LT });
  const teks1 = el('text', { fill: 'var(--color-cream-fixed)', 'font-size': 13, 'font-weight': 800 });
  const teks2 = el('text', { fill: 'var(--color-cream-fixed)', 'font-size': 11.5, opacity: 0.78 });
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
const SRC = { resmi: 'official', berita: 'news', sosial: 'social' }; // nama jenis di .fl-src kit

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
      ? `<div class="fl-alert fl-alert--success sg-catatan-kabar">${ikon('perisai')}<div><p>Unggahan dari akun lembaga resmi. Tetap buka tautannya untuk memastikan.</p></div></div>`
      : `<div class="fl-alert fl-alert--warning sg-catatan-kabar">${ikon('awas')}<div><strong>Belum diverifikasi</strong><p>Butir bertanda <b>Berita</b> adalah liputan media: menyebut sebuah lembaga bukan berarti pernyataan resmi lembaga itu. Butir <b>Perbincangan</b> adalah unggahan yang sedang ramai. Cocokkan dulu dengan laporan PVMBG sebelum meneruskannya.</p></div></div>`;

  const angka = (n) => (n == null ? null : n >= 1000 ? `${(n / 1000).toFixed(1)} rb` : String(n));

  $('#isi-kabar').innerHTML =
    peringatan +
    (daftar.length
      ? `<ul class="fl-feed sg-feed">${daftar.slice(0, 30).map((p) => {
          const jenis = jenisPos(p);
          const metrik = p.metrik
            ? [angka(p.metrik.suka) && `${angka(p.metrik.suka)} suka`, angka(p.metrik.ulang) && `${angka(p.metrik.ulang)} ulang`].filter(Boolean)
            : [];
          // Unggahan media sosial memakai gambar besar (isinya sering foto warga);
          // berita memakai gambar kecil di samping judul supaya daftarnya tetap padat.
          const sosial = jenis !== 'berita';
          const mini = !sosial && p.gambar
            ? `<a class="sg-feed__mini" href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow" tabindex="-1" aria-hidden="true">
                 <img src="${aman(p.gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>`
            : '';
          const besar = sosial && p.gambar
            ? `<a class="sg-feed__media" href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">
                 <img src="${aman(p.gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer">
                 ${p.adaVideo ? `<span class="sg-feed__main">${ikon('main')}</span>` : ''}</a>`
            : '';
          return `<li data-src="${SRC[jenis]}">
            <div class="fl-feed__meta">
              <span class="fl-src" data-src="${SRC[jenis]}">${LABEL_JENIS[jenis]}</span>
              <span class="asal">${aman(p.penulis ? `${p.penulis} ${p.sumber}` : p.sumber || p.kanal)}</span>
              <span title="${aman(jamWib(p.waktu))}">${lalu(p.waktu)}</span>
            </div>
            <div class="sg-feed__baris">
              <div>
                <a href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">${aman(p.judul)}</a>
                ${besar}
                ${metrik.length ? `<div class="sg-feed__metrik">${metrik.map((m) => `<span>${aman(m)}</span>`).join('')}</div>` : ''}
                ${jenis === 'sosial' ? `<span class="sg-feed__belum">Belum diverifikasi</span>` : ''}
              </div>
              ${mini}
            </div>
          </li>`;
        }).join('')}</ul>`
      : `<p class="sg-kosong">Belum ada yang masuk di kanal ini.</p>`);
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
  'berita-penerbit': 'RSS ANTARA, CNN Indonesia, Tempo',
  'berita-penerbangan': 'Google News — penutupan bandara',
  'sigmet-abu': 'NOAA AWC — SIGMET abu vulkanik',
  'metar-bandara': 'NOAA AWC — METAR bandara',
  'x-nitter': 'X lewat Nitter — pencarian kata kunci',
  'x-resmi': 'X — linimasa akun resmi',
  'x-fxtwitter': 'X lewat FxTwitter — melengkapi isi posting',
  threads: 'Threads — pencarian kata kunci',
};

function gambarSumber() {
  $('#daftar-sumber').innerHTML = D.kesehatan
    .map((s) => {
      // Chip umur mengikuti kit: hijau segar, kuning bersegitiga basi, merah gagal atau sangat lama.
      const umur = (Date.now() - Date.parse(s.waktu)) / 60000;
      const usia = !s.ok || umur >= 180 ? 'old' : umur >= 30 ? 'stale' : '';
      return `<li><b>${aman(NAMA_SUMBER[s.nama] || s.nama)}</b>
        <span class="fl-fresh"${usia ? ` data-age="${usia}"` : ''}>${s.ok ? lalu(s.waktu) : 'Gagal'}</span>
        <small>${s.ok ? `Berhasil diambil ${jamWib(s.waktu)}` : aman(s.pesan || 'gagal')}</small></li>`;
    })
    .join('');
}

// ── jalankan ──────────────────────────────────────────────────────────────
// Muat pertama bisa jatuh tepat saat server sedang mengumpulkan data (503).
// Tanpa percobaan ulang, halaman menggantung sampai penyegaran lima menit —
// terlalu lama untuk halaman peringatan. Jeda dinaikkan bertahap sampai 30 detik.
let percobaan = 0;
function tampilGalat(teks) {
  $('#galat-wadah').hidden = !teks;
  if (teks) $('#galat-atas').textContent = teks;
}
function jadwalUlang() {
  const jeda = Math.min(3000 * 2 ** percobaan++, 30000);
  tampilGalat(D
    ? `Penyegaran gagal. Angka di bawah dari pengambilan sebelumnya. Mencoba lagi ${Math.round(jeda / 1000)} detik lagi.`
    : `Data belum bisa dimuat. Mencoba lagi ${Math.round(jeda / 1000)} detik lagi…`);
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
  tampilGalat(null);
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
for (const b of $$('[data-tab]')) b.onclick = (e) => { e.preventDefault(); pindahTab(b.dataset.tab); };
for (const b of $$('.sg-strip__sel')) b.onclick = () => pindahTab(b.dataset.ke);
addEventListener('hashchange', () => pindahTab(location.hash.slice(1), false));
// Dialog bawaan peramban: sudah punya lapisan gelap, jebakan fokus, dan Esc.
const dlg = $('#bantuan');
$('#tombol-bantuan').onclick = () => dlg.showModal();
$('#tutup-bantuan').onclick = () => dlg.close();
$('#tutup-bantuan-2').onclick = () => dlg.close();
// Klik di luar kotaknya menutup — <dialog> sendiri memenuhi seluruh layar.
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

$('#tombol-lokasi').onclick = pakaiLokasi;
$('#alih-siaga').onchange = () => alihPeta(false);
$('#alih-windy').onchange = () => alihPeta(true);
for (const id of ['tab-semua', 'tab-resmi', 'tab-publik'])
  $(`#${id}`).onchange = () => {
    tabKabar = id.replace('tab-', '');
    gambarKabar();
  };
// Grafik di dalam lipatan baru punya ukuran setelah lipatannya dibuka.
$('#angin-wadah').closest('details').addEventListener('toggle', (e) => e.target.open && D && gambarAngin());

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
