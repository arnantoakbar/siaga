// Siaga — lapisan tampilan. Tanpa kerangka kerja, tanpa langkah build.
// Semua angka datang dari /api/terkini; berkas ini tidak pernah menghitung ulang
// status atau mengarang nilai pengganti saat data kosong — yang kosong ditulis kosong.

const $ = (s, akar = document) => akar.querySelector(s);
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
 *  ukuran teks di dalam SVG sama persis dengan ukuran teks di luar SVG.
 *  Tanpa ini, teks 12 unit pada viewBox 640 menyusut jadi 7 px di layar 375. */
const lebarWadah = (sel, cadangan = 360) => {
  const n = document.querySelector(sel);
  return Math.max(300, Math.min(900, Math.round(n?.clientWidth || cadangan)));
};

const ikon = (nama, kelas) =>
  `<svg viewBox="0 0 24 24" ${kelas ? `class="${kelas}"` : ''} aria-hidden="true"><use href="#i-${String(nama).replace(/^i-/, '')}"/></svg>`;
const aman = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
// PVMBG menulis "Masyarakat/pengunjung/wisatawan/pendaki" sebagai satu kata panjang.
// Peramban tidak memutus baris setelah garis miring, jadi disisipkan titik putus
// tak terlihat — teksnya sendiri tidak diubah, hanya boleh berganti baris di sana.
const bolehPutus = (s) => aman(s).replace(/\//g, '/\u200B');

// ── waktu ─────────────────────────────────────────────────────────────────
const WIB = { timeZone: 'Asia/Jakarta' };
const jamWib = (iso) =>
  new Date(iso).toLocaleString('id-ID', { ...WIB, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' WIB';

function lalu(iso) {
  if (!iso) return 'waktu tidak diketahui';
  const d = (Date.now() - Date.parse(iso)) / 1000;
  if (d < 0) return 'baru saja';
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

// Tema mengikuti pengaturan sistem. ?tema=terang / ?tema=gelap memaksanya —
// dipakai untuk tangkapan layar dan untuk pembaca yang ingin memilih sendiri.
const temaMinta = new URLSearchParams(location.search).get('tema');
if (temaMinta === 'terang' || temaMinta === 'gelap')
  document.documentElement.setAttribute('data-tema', temaMinta);

// ── keadaan ───────────────────────────────────────────────────────────────
let D = null;
let kotaTerpilih = localStorage.getItem('siaga.kota') || null;
let lapisanAktif = new Set();
let tabKabar = 'resmi';
let garisPantai = null;
let lokasiSaya = null;                 // hasil analisa untuk koordinat perangkat
let petaWindy = false;
let windySetuju = localStorage.getItem('siaga.windy') === 'ya';
let windyOverlay = 'wind';
let windyLevel = '700h';

// ── kepala ────────────────────────────────────────────────────────────────
function gambarSegar() {
  const s = $('#segar');
  const umurMenit = (Date.now() - Date.parse(D.dibuat)) / 60000;
  s.dataset.usia = umurMenit < 30 ? 'baru' : umurMenit < 180 ? 'lawas' : 'basi';
  s.title = `Data diambil ${jamWib(D.dibuat)}`;
  $('#segar-teks').textContent = `Diperbarui ${lalu(D.dibuat)}`;
  $('#kaki-waktu').textContent = `Halaman ini menarik data tiap beberapa menit. Pengambilan terakhir ${jamWib(D.dibuat)}.`;
}

// ── vonis utama ───────────────────────────────────────────────────────────
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

  const arti = {
    I: 'Tidak ada gejala tekanan magma yang berarti.',
    II: 'Aktivitas naik di atas normal. Ada potensi erupsi.',
    III: 'Gunung sudah erupsi atau sangat mungkin erupsi. Ada radius yang dilarang dimasuki.',
    IV: 'Erupsi besar sedang berlangsung atau segera terjadi. Ikuti perintah evakuasi.',
  }[r.level];

  v.innerHTML = `
    <div class="vonis-atas">
      ${lencana(r.status, `Level ${r.level} · ${r.levelNama}`)}
      ${r.radiusLaranganKm ? `<span class="lencana st-bahaya">${ikon('perisai')}Dilarang dalam ${r.radiusLaranganKm} km</span>` : ''}
    </div>
    <h1>${aman(lap.gunung)}</h1>
    <p class="vonis-lead">${aman(arti)}</p>
    <p class="cap">${ikon('jam')}<span>Laporan pengamatan PVMBG <b>${aman(lap.tanggal)}</b>, periode ${aman(lap.periodeMulai)}–${aman(lap.periodeSelesai)} WIB.
      Terbit ${lalu(lap.waktuLaporan)}. Pengamat: ${aman(lap.pembuat || '—')}.</span></p>
    ${D.laporanCadangan ? `<p class="cap peringatan-basi">${ikon('awas')}<span><b>Pengambilan laporan terbaru gagal.</b> Yang tampil di atas adalah laporan tersimpan terakhir. Level gunung tetap dari tabel tingkat aktivitas PVMBG yang berhasil diambil ${lalu(D.dibuat)}.</span></p>` : ''}
    <ul class="fakta">
      <li><b>${r.gempaLetusan}</b> gempa letusan periode ini</li>
      <li><b>${r.totalGempa}</b> total gempa terekam</li>
      <li>Tremor menerus: <b>${r.adaTremor ? 'ada' : 'tidak ada'}</b></li>
    </ul>`;
}

// ── kartu kota ────────────────────────────────────────────────────────────
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
  if (kotaTerpilih !== 'lokasi-saya' && !D.kota.some((k) => k.kotaId === kotaTerpilih))
    kotaTerpilih = D.kota[0]?.kotaId;
  sel.value = kotaTerpilih;
  sel.onchange = () => {
    if (sel.value !== 'lokasi-saya' && lokasiSaya) lepasLokasi();
    kotaTerpilih = sel.value;
    localStorage.setItem('siaga.kota', kotaTerpilih);
    gambarKota();
    gambarPeta();
    gambarUdara();
  };
}

const kotaKini = () =>
  (kotaTerpilih === 'lokasi-saya' && lokasiSaya) || D.kota.find((k) => k.kotaId === kotaTerpilih) || D.kota[0];

function gambarKota() {
  const k = kotaKini();
  if (!k) return;
  const i = k.ispu;

  const langkah = k.langkah.length
    ? k.langkah
        .map(
          (t) => `<li>
            <div class="langkah-atas">${ikon('awas')}<p>${bolehPutus(t.teks)}</p></div>
            <details><summary>Kenapa ini muncul</summary><p>${aman(t.dasar)} · Sumber: ${aman(t.sumber)}</p></details>
          </li>`
        )
        .join('')
    : `<li><div class="langkah-atas">${ikon('cek')}<p>Tidak ada tindakan khusus untuk ${aman(k.nama)} saat ini. Tetap ikuti kabar resmi.</p></div></li>`;

  $('#kartu-kota').innerHTML = `
    <div class="kartu-kota">
      <div class="kota-kepala">
        <div><h3>${aman(k.nama)}</h3><p>${k.dariPerangkat ? 'Dari lokasi perangkat kamu' : aman(k.provinsi)}</p></div>
        ${lencana(k.status)}
      </div>
      <dl class="ukur">
        <div><dt>Jarak</dt><dd>${k.jarakKm}<small> km</small></dd></div>
        <div><dt>Arah</dt><dd style="font-size:19px">${aman(k.arahMata)}</dd></div>
        <div><dt>ISPU 24 jam</dt><dd>${i ? i.nilai : '—'}<small> ${i ? aman(i.kategori) : 'data tidak ada'}</small></dd></div>
        <div><dt>Jalur abu</dt><dd style="font-size:19px">${k.diJalurAbu ? 'Ya' : 'Tidak'}</dd></div>
      </dl>
      ${
        k.alasan.length
          ? `<p class="cap" style="margin-top:16px">${ikon('info')}<span>${k.alasan.map((a) => bolehPutus(a.teks)).join(' ')}</span></p>`
          : ''
      }
      <h3 style="font-size:17px;margin-top:24px">Yang perlu kamu lakukan</h3>
      <ol class="langkah">${langkah}</ol>
    </div>`;
}

const kakiPeta = () =>
  D.angin
    ? `Juring menunjukkan sejauh mana abu terbawa dalam 6 jam pada kecepatan angin saat ini, melebar ${D.ambang.sektorToleransiDerajat}° ke kiri dan kanan. Angin diambil ${lalu(D.angin.waktuData)}.`
    : 'Data angin tidak tersedia, jadi arah sebaran tidak bisa digambar.';

// ── lokasi perangkat ──────────────────────────────────────────────────────
// Izin tidak pernah diminta saat halaman dibuka — pengguna yang menekan tombol.
// Koordinat dibulatkan ke 2 desimal (~1,1 km) sebelum dikirim, lewat badan POST,
// dan tidak disimpan di mana pun. Ketelitian itu sudah jauh melebihi kebutuhan:
// sel model kualitas udara lebarnya sekitar 40 km.
function kabarLokasi(teks, nada, aksi) {
  const el = $('#lokasi-kabar');
  el.hidden = !teks;
  el.dataset.nada = nada || '';
  if (!teks) return;
  el.innerHTML = `${ikon(nada === 'galat' ? 'awas' : 'pin')}<span>${aman(teks)}</span>`;
  if (aksi) {
    const b = html('button', { type: 'button' }, aksi.label);
    b.onclick = aksi.fn;
    el.querySelector('span').append(b);
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
    gambarKota();
    gambarPeta();
    gambarUdara();
    kabarLokasi(
      `Memakai lokasi perangkat, dibulatkan ke sekitar 1 km. Koordinat tidak disimpan.`,
      '',
      { label: 'Kembali ke daftar kota', fn: lepasLokasi }
    );
  } catch (e) {
    tombol.dataset.keadaan = '';
    const pesan =
      e.code === 1 ? 'Izin lokasi ditolak. Pilih kota terdekat secara manual.'
      : e.code === 2 ? 'Lokasi tidak bisa ditentukan perangkat. Pilih kota terdekat secara manual.'
      : e.code === 3 ? 'Permintaan lokasi kehabisan waktu. Coba lagi atau pilih kota manual.'
      : `Gagal memakai lokasi: ${e.message}`;
    kabarLokasi(pesan, 'galat');
  }
}

function lepasLokasi() {
  lokasiSaya = null;
  kotaTerpilih = D.kota[0]?.kotaId;
  localStorage.setItem('siaga.kota', kotaTerpilih);
  $('#tombol-lokasi').dataset.keadaan = '';
  kabarLokasi(null);
  gambarPilihKota();
  gambarKota();
  gambarPeta();
  gambarUdara();
}

// ── peta ──────────────────────────────────────────────────────────────────
const PETA = { w: 104.0, s: -7.7, e: 108.6, n: -4.7 };
const KM_PER_DERAJAT = 111.32;
const S = 100; // piksel viewBox per derajat lintang

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
  const rad = (d) => ((d - 90) * Math.PI) / 180; // 0° = utara, searah jarum jam
  const a1 = rad(arahDeg - bukaDeg);
  const a2 = rad(arahDeg + bukaDeg);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  return `M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

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

// Ramp satu rona (keluarga api Flavida) — magnitudo ketinggian, bukan identitas.
const RONA = { 850: '#F6C98A', 700: '#F0A053', 500: '#E4700C', 250: '#B01D14' };
const warnaRona = (hPa) => RONA[hPa] || '#E4700C';

function gambarPeta() {
  if (petaWindy) return;
  const p = proyeksi();
  // Peta wajib memakai satuan geografis, jadi ukuran teks dikoreksi balik
  // dengan rasio viewBox : lebar tampil supaya tetap terbaca ~12 px di layar.
  const sk = p.lebar / lebarWadah('#peta-wadah');
  const fs = (px) => +(px * sk).toFixed(1);
  const g = D.gunung;
  const [gx, gy] = p.xy(g.lon, g.lat);
  const svg = el('svg', {
    class: 'peta',
    viewBox: `0 0 ${p.lebar} ${p.tinggi}`,
    role: 'img',
    'aria-label': `Peta Selat Sunda: posisi ${g.nama}, arah sebaran abu, dan status ${D.kota.length} kota.`,
  });

  svg.append(el('rect', { width: p.lebar, height: p.tinggi, fill: 'var(--laut)' }));

  // daratan
  if (garisPantai) {
    for (const baris of garisPantai.lines) {
      const d = baris.map(([lo, la], i) => `${i ? 'L' : 'M'}${p.xy(lo, la).map((v) => v.toFixed(1)).join(' ')}`).join('');
      svg.append(el('path', { d: d + 'Z', fill: 'var(--darat)', stroke: 'var(--grid)', 'stroke-width': 1 }));
    }
  }

  // Cincin jarak. Label ditaruh di diagonal kiri-bawah — di atas kawah penuh kota.
  for (const km of [50, 100, 200, 300]) {
    const r = p.km(km);
    svg.append(el('circle', { cx: gx, cy: gy, r, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1.2, 'stroke-dasharray': '5 5' }));
    const a = (215 * Math.PI) / 180;
    const lx = gx + r * Math.cos(a), ly = gy + r * Math.sin(a);
    if (lx > 26 && ly < p.tinggi - 8)
      svg.append(
        el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--ink-3)', 'font-size': fs(11), 'font-weight': 600, 'paint-order': 'stroke', stroke: 'var(--laut)', 'stroke-width': fs(3) }, `${km} km`)
      );
  }

  // juring sebaran abu per lapisan — momen gerak yang diniatkan
  const lapisan = (D.angin?.lapisan || []).filter((l) => lapisanAktif.has(l.hPa));
  const gJuring = el('g', { class: 'kerucut', style: `--pusat-x:${gx}px;--pusat-y:${gy}px` });
  for (const [i, l] of lapisan.entries()) {
    const jangkauKm = Math.min(l.kecepatanKmj * 6, D.ambang.jangkauanAbuKm); // sebaran 6 jam
    gJuring.append(
      el('path', {
        d: juring(gx, gy, p.km(jangkauKm), l.arahHembusDerajat, D.ambang.sektorToleransiDerajat),
        fill: warnaRona(l.hPa),
        'fill-opacity': 0.2,
        stroke: warnaRona(l.hPa),
        'stroke-width': 1.4,
        'stroke-opacity': 0.75,
        style: `animation-delay:${i * 90}ms`,
      })
    );
  }
  svg.append(gJuring);

  // Kota. Titiknya selalu digambar; labelnya hanya kalau ada ruang —
  // label bertumpuk di klaster Banten lebih buruk daripada label yang hilang,
  // dan yang hilang tetap terbaca lengkap di tabel di bawah peta.
  const gKota = el('g');
  // Nama gunung dipesan duluan supaya tidak ada label kota yang menimpanya.
  const lwG = g.nama.length * fs(7.2) + fs(8);
  const kotak = [{ x1: gx - lwG / 2, x2: gx + lwG / 2, y1: gy - fs(13), y2: gy + fs(26) }];
  // Titik setiap kota juga dipesan: label boleh hilang, titik tidak boleh tertutup.
  for (const k of D.kota) {
    const [x, y] = p.xy(k.lon, k.lat);
    kotak.push({ x1: x - fs(8), x2: x + fs(8), y1: y - fs(8), y2: y + fs(8) });
  }
  const bentrok = (a) => kotak.some((b) => !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2));
  const urutLabel = [...D.kota].sort((a, b) => {
    if ((a.kotaId === kotaTerpilih) !== (b.kotaId === kotaTerpilih)) return a.kotaId === kotaTerpilih ? -1 : 1;
    const s = ['bahaya', 'siaga', 'waspada', 'aman'];
    return s.indexOf(a.status) - s.indexOf(b.status) || a.jarakKm - b.jarakKm;
  });

  if (lokasiSaya) urutLabel.unshift(lokasiSaya);
  for (const k of urutLabel) {
    const [x, y] = p.xy(k.lon, k.lat);
    const dipilih = k.kotaId === kotaTerpilih;
    const t = el('g', { style: 'cursor:pointer', tabindex: '0', role: 'button', 'aria-label': `${k.nama}, ${k.jarakKm} km, status ${LABEL_STATUS[k.status]}` });
    if (dipilih) t.append(el('circle', { cx: x, cy: y, r: fs(11), fill: 'none', stroke: 'var(--ink)', 'stroke-width': fs(1.5) }));
    t.append(el('circle', { cx: x, cy: y, r: fs(dipilih ? 6.5 : 5), fill: warnaStatus(k.status), stroke: 'var(--surface)', 'stroke-width': fs(1.8) }));

    const lw = k.nama.length * fs(7.3) + fs(10);
    const calon = [
      { dx: fs(10), dy: fs(4), anchor: 'start' },
      { dx: -fs(10), dy: fs(4), anchor: 'end' },
      { dx: 0, dy: -fs(11), anchor: 'middle' },
      { dx: 0, dy: fs(17), anchor: 'middle' },
    ];
    for (const c of calon) {
      const x1 = c.anchor === 'start' ? x + c.dx : c.anchor === 'end' ? x + c.dx - lw : x - lw / 2;
      const kk = { x1, x2: x1 + lw, y1: y + c.dy - fs(13), y2: y + c.dy + fs(6) };
      if (bentrok(kk) && !dipilih) continue;
      kotak.push(kk);
      t.append(
        el('text', { x: x + c.dx, y: y + c.dy, 'text-anchor': c.anchor, fill: 'var(--ink)', 'font-size': fs(12), 'font-weight': dipilih ? 800 : 600, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': fs(3.5) }, k.nama)
      );
      break;
    }

    const pilih = () => {
      kotaTerpilih = k.kotaId;
      localStorage.setItem('siaga.kota', kotaTerpilih);
      $('#pilih-kota').value = kotaTerpilih;
      gambarKota();
      gambarPeta();
      gambarUdara();
    };
    t.onclick = pilih;
    t.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pilih(); } };
    gKota.append(t);
  }
  svg.append(gKota);

  // kawah
  const r = D.ringkas;
  if (r?.radiusLaranganKm)
    svg.append(el('circle', { cx: gx, cy: gy, r: Math.max(p.km(r.radiusLaranganKm), fs(3)), fill: 'var(--h-bahaya)', 'fill-opacity': 0.35, stroke: 'var(--h-bahaya)', 'stroke-width': 1.5 }));
  svg.append(el('path', { d: `M${gx} ${gy - fs(10)} L${gx + fs(9)} ${gy + fs(7)} L${gx - fs(9)} ${gy + fs(7)} Z`, fill: 'var(--ink)', stroke: 'var(--surface)', 'stroke-width': fs(1.5) }));
  svg.append(
    el('text', { x: gx, y: gy + fs(22), 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': fs(12.5), 'font-weight': 800, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': fs(3.5) }, g.nama)
  );

  $('#peta-wadah').replaceChildren(svg);

  $('#peta-keterangan').innerHTML = Object.entries(LABEL_STATUS)
    .map(([s, l]) => `<span><i style="background:${warnaStatus(s)}"></i>${l}</span>`)
    .join('');
  $('#peta-kaki').textContent = kakiPeta();

  // padanan tabel — identitas tidak pernah lewat warna saja
  $('#tabel-kota').innerHTML = `<table class="data"><thead><tr><th>Kota</th><th>Jarak</th><th>Arah</th><th>ISPU</th><th>Status</th></tr></thead><tbody>
    ${D.kota.map((k) => `<tr><td>${aman(k.nama)}</td><td>${k.jarakKm} km</td><td>${aman(k.arahMata)}</td><td>${k.ispu?.nilai ?? '—'}</td><td>${LABEL_STATUS[k.status]}</td></tr>`).join('')}
  </tbody></table>`;
}

// ── peta Windy ────────────────────────────────────────────────────────────
// Lapisan pihak ketiga, sengaja tidak aktif sejak awal: membukanya berarti
// peramban pembaca menghubungi windy.com. Itu diberitahukan lebih dulu dan
// pilihannya diingat. Peta bawaan tetap yang utama karena ringan dan tidak
// memanggil siapa pun.
//
// Kunci overlay di bawah sudah diuji satu per satu pada embed Windy —
// `so2` tidak dipakai karena diam-diam jatuh kembali ke lapisan angin.
const WINDY_OVERLAY = [
  { kunci: 'wind',   nama: 'Angin',        satuan: 'arah & kecepatan udara' },
  { kunci: 'pm2p5',  nama: 'PM2.5',        satuan: 'partikel halus, µg/m³' },
  { kunci: 'aod550', nama: 'Aerosol',      satuan: 'ketebalan optik aerosol — paling dekat dengan abu' },
  { kunci: 'dustsm', nama: 'Debu',         satuan: 'debu permukaan, µg/m³' },
];
const WINDY_LEVEL = [
  { kunci: 'surface', nama: 'Permukaan' },
  { kunci: '850h',    nama: '~1,5 km' },
  { kunci: '700h',    nama: '~3 km' },
  { kunci: '500h',    nama: '~5,5 km' },
  { kunci: '250h',    nama: '~10,5 km' },
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
    wadah.append(
      html('div', { class: 'windy-catatan' },
        `${ikon('awas')}<div><b>Lapisan ini dimuat dari windy.com.</b> Kalau kamu membukanya, peramban kamu
         menghubungi server mereka dan mereka bisa melihat alamat IP kamu. Peta bawaan Siaga tidak memanggil
         siapa pun. Data Windy berasal dari model ECMWF dan CAMS — perkiraan, bukan pengamatan resmi PVMBG.
         <br><button type="button" id="windy-setuju">Muat peta Windy</button></div>`)
    );
    $('#windy-setuju').onclick = () => {
      windySetuju = true;
      localStorage.setItem('siaga.windy', 'ya');
      gambarWindy();
    };
    return;
  }

  // penyaring overlay + ketinggian
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

  const bingkai = html('iframe', {
    src: urlWindy(),
    title: 'Peta Windy',
    loading: 'lazy',
    referrerpolicy: 'no-referrer',
    sandbox: 'allow-scripts allow-same-origin allow-popups',
  });
  wadah.replaceChildren(bingkai);
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
    $('#windy-wadah').innerHTML = ''; // hentikan iframe saat tidak dipakai
    gambarPeta();
  }
  $('#peta-kaki').textContent = keWindy
    ? `Sumber: windy.com (model ECMWF & CAMS). Lapisan ini perkiraan pihak ketiga, bukan prakiraan sebaran abu resmi. Prakiraan resmi ada di VONA PVMBG dan Darwin VAAC.`
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
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img', 'aria-label': 'Arah dan kecepatan angin pada empat ketinggian di atas kawah.' });

  for (const f of [0.34, 0.67, 1])
    svg.append(el('circle', { cx, cy, r: R * f, fill: 'none', stroke: 'var(--grid)', 'stroke-width': 1 }));
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
    // Label didorong menjauh dari pusat searah panahnya, lalu digeser
    // tegak lurus kalau masih menabrak label lain.
    // Label membawa ketinggiannya sendiri, jadi tetap jelas milik panah mana
    // walaupun harus digeser karena dua panah menuju arah yang mirip.
    let lx = cx + (r + 22) * Math.cos(a);
    let ly = cy + (r + 22) * Math.sin(a) + 4;
    for (let n = 0; n < 8 && dipakai.some((q) => Math.hypot(q.x - lx, q.y - ly) < 30); n++) {
      lx += 15 * Math.cos(a + Math.PI / 2);
      ly += 15 * Math.sin(a + Math.PI / 2);
    }
    dipakai.push({ x: lx, y: ly });
    if (Math.hypot(lx - x, ly - y) > 30)
      g.append(el('line', { x1: x, y1: y, x2: lx, y2: ly - 4, stroke: warnaRona(l.hPa), 'stroke-width': 1, 'stroke-opacity': 0.5 }));
    g.append(
      el('text', { x: lx, y: ly, 'text-anchor': 'middle', fill: 'var(--ink)', 'font-size': 12.5, 'font-weight': 700, 'paint-order': 'stroke', stroke: 'var(--surface)', 'stroke-width': 3.5 }, `~${l.kmKira} km · ${Math.round(l.kecepatanKmj)} km/j`)
    );
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
    wadah.innerHTML = '<p style="padding:24px;color:var(--ink-3)">Deret kualitas udara untuk kota ini tidak tersedia.</p>';
    return;
  }
  $('#udara-sub').textContent = `PM2.5 di ${k.nama} selama 24 jam terakhir. Garis putus-putus adalah batas kategori ISPU resmi.`;

  const W = lebarWadah('#udara-wadah'), H = 240, ml = 40, mr = 14, mt = 18, mb = 34;
  const pw = W - ml - mr, ph = H - mt - mb;
  const maksData = Math.max(...d.map((t) => t.pm2_5), 20);
  const maks = Math.max(maksData * 1.15, 20);
  const X = (i) => ml + (i / (d.length - 1)) * pw;
  const Y = (v) => mt + ph - (v / maks) * ph;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img', 'aria-label': `Grafik PM2.5 di ${k.nama}, 24 jam terakhir. Nilai sekarang ${k.udaraKini?.pm2_5 ?? '-'} mikrogram per meter kubik.` });

  for (const b of PATAH_PM25) {
    if (b.nilai > maks) continue;
    svg.append(el('line', { x1: ml, x2: W - mr, y1: Y(b.nilai), y2: Y(b.nilai), stroke: 'var(--grid)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    svg.append(el('text', { x: W - mr, y: Y(b.nilai) - 5, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 11.5, 'font-weight': 600 }, `${b.nama} · ${b.nilai}`));
  }
  for (const v of [0, Math.round(maks / 2), Math.round(maks)])
    svg.append(el('text', { x: ml - 8, y: Y(v) + 4, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 11.5 }, String(v)));

  const titik = d.map((t, i) => [X(i), Y(t.pm2_5)]);
  const garis = titik.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  svg.append(el('path', { d: `${garis}L${X(d.length - 1)} ${mt + ph}L${ml} ${mt + ph}Z`, fill: 'var(--accent)', 'fill-opacity': 0.1 }));
  svg.append(el('path', { d: garis, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  const jamAwal = new Date(d[0].t).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' });
  const jamAkhir = new Date(d.at(-1).t).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' });
  svg.append(el('text', { x: ml, y: H - 10, fill: 'var(--ink-3)', 'font-size': 11.5 }, `${jamAwal} WIB`));
  svg.append(el('text', { x: W - mr, y: H - 10, 'text-anchor': 'end', fill: 'var(--ink-3)', 'font-size': 11.5 }, `${jamAkhir} WIB`));

  // lapisan sorot: garis bidik + keterangan nilai
  const sorot = el('g', { opacity: 0 });
  const bidik = el('line', { y1: mt, y2: mt + ph, stroke: 'var(--ink-3)', 'stroke-width': 1 });
  const bulat = el('circle', { r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 });
  const LT = 146; // lebar keterangan
  const kotakT = el('rect', { rx: 7, fill: 'var(--ink)', height: 38, width: LT });
  const teks1 = el('text', { fill: 'var(--bg)', 'font-size': 13, 'font-weight': 700 });
  const teks2 = el('text', { fill: 'var(--bg)', 'font-size': 11.5, opacity: 0.75 });
  sorot.append(bidik, kotakT, teks1, teks2, bulat);
  svg.append(sorot);

  const tutup = el('rect', { x: ml, y: mt, width: pw, height: ph, fill: 'transparent', style: 'cursor:crosshair' });
  const gerak = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches?.[0]?.clientX ?? ev.clientX) - r.left) * (W / r.width);
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
    teks2.textContent = new Date(d[i].t).toLocaleTimeString('id-ID', { ...WIB, hour: '2-digit', minute: '2-digit' }) + ' WIB';
  };
  tutup.addEventListener('pointermove', gerak);
  tutup.addEventListener('pointerdown', gerak);
  tutup.addEventListener('pointerleave', () => sorot.setAttribute('opacity', 0));
  svg.append(tutup);

  wadah.replaceChildren(svg);
}

// ── grafik kegempaan ──────────────────────────────────────────────────────
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
  const sempit = W < 430;               // di layar sempit label naik ke atas batang
  const ml = sempit ? 14 : 150;
  const mr = 44, tb = sempit ? 20 : 30, jarak = sempit ? 30 : 10, mt = sempit ? 20 : 8;
  const H = mt * 2 + urut.length * (tb + jarak);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, style: 'width:100%;height:auto', role: 'img', 'aria-label': `Jumlah gempa per jenis pada laporan terakhir: ${urut.map((x) => `${x.jenis} ${x.jumlah}`).join(', ')}.` });

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

// ── kabar ─────────────────────────────────────────────────────────────────
const RESMI = /bmkg|bnpb|pvmbg|magma|esdm|badan geologi|basarnas|kemenkes|bpbd/i;

function gambarKabar() {
  const resmi = D.pos.filter((p) => p.resmi || RESMI.test(p.sumber || '') || RESMI.test(p.judul));
  const publik = D.pos.filter((p) => !resmi.includes(p));
  const daftar = tabKabar === 'resmi' ? resmi : publik;

  const peringatan =
    tabKabar === 'publik'
      ? `<div class="awas-verifikasi">${ikon('i-awas')}<span><b>Belum diverifikasi.</b> Ini kumpulan berita dan unggahan yang sedang ramai, bukan pernyataan resmi. Cocokkan dulu dengan laporan PVMBG di atas sebelum meneruskannya.</span></div>`
      : `<div class="awas-verifikasi" style="background:var(--h-aman-bg);color:var(--h-aman)">${ikon('i-perisai')}<span>Berisi kabar yang menyebut badan resmi. Tetap buka tautannya untuk memastikan.</span></div>`;

  $('#isi-kabar').innerHTML =
    peringatan +
    (daftar.length
      ? `<ul class="kabar">${daftar
          .slice(0, 18)
          .map((p) => {
            const angka = (n) => (n == null ? null : n >= 1000 ? `${(n / 1000).toFixed(1)} rb` : String(n));
            const metrik = p.metrik
              ? [angka(p.metrik.suka) && `${angka(p.metrik.suka)} suka`, angka(p.metrik.ulang) && `${angka(p.metrik.ulang)} ulang`]
                  .filter(Boolean)
              : [];
            return `<li>
              <div class="kabar-meta">
                <span class="asal">${aman(p.penulis ? `${p.penulis} ${p.sumber}` : p.sumber || p.kanal)}</span>
                <span>·</span><span title="${aman(jamWib(p.waktu))}">${lalu(p.waktu)}</span>
              </div>
              <a href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">${aman(p.judul)}</a>
              ${
                p.gambar
                  ? `<a class="kabar-media" href="${aman(p.tautan)}" target="_blank" rel="noopener nofollow">
                       <img src="${aman(p.gambar)}" alt="" loading="lazy" referrerpolicy="no-referrer">
                       ${p.adaVideo ? `<span class="main">${ikon('main')}</span>` : ''}
                     </a>`
                  : ''
              }
              ${metrik.length ? `<div class="kabar-metrik">${metrik.map((m) => `<span>${aman(m)}</span>`).join('')}</div>` : ''}
            </li>`;
          })
          .join('')}</ul>`
      : `<p style="color:var(--ink-3)">Belum ada yang masuk di kanal ini.</p>`);
}

// ── kesehatan sumber ──────────────────────────────────────────────────────
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
  'x-fxtwitter': 'X lewat FxTwitter — melengkapi isi posting',
  'x-resmi': 'X — linimasa akun resmi',
  threads: 'Threads — pencarian kata kunci',
};

function gambarSumber() {
  $('#daftar-sumber').innerHTML = D.kesehatan
    .map(
      (s) => `<li class="${s.ok ? 'ok' : 'gagal'}">${ikon(s.ok ? 'i-cek' : 'i-silang')}
        <div><b>${aman(NAMA_SUMBER[s.nama] || s.nama)}</b>
        <small>${s.ok ? `Berhasil diambil ${lalu(s.waktu)}` : aman(s.pesan || 'gagal')}</small></div></li>`
    )
    .join('');
}

// ── jalankan ──────────────────────────────────────────────────────────────
async function muat() {
  const [r, gp] = await Promise.all([
    fetch('/api/terkini', { cache: 'no-store' }),
    garisPantai ? Promise.resolve(null) : fetch('coastline.json').then((x) => (x.ok ? x.json() : null)).catch(() => null),
  ]);
  if (gp) garisPantai = gp;
  if (!r.ok) throw new Error(`server membalas ${r.status}`);
  D = await r.json();

  gambarSegar();
  gambarVonis();
  gambarPilihKota();
  gambarKota();
  gambarSaringLapisan();
  gambarPeta();
  gambarAngin();
  gambarUdara();
  gambarGempa();
  gambarKabar();
  gambarSumber();
}

$('#tombol-lokasi').onclick = pakaiLokasi;
$('#alih-siaga').onclick = () => alihPeta(false);
$('#alih-windy').onclick = () => alihPeta(true);

for (const id of ['tab-resmi', 'tab-publik'])
  $(`#${id}`).onclick = (e) => {
    tabKabar = id === 'tab-resmi' ? 'resmi' : 'publik';
    for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', t === e.currentTarget);
    gambarKabar();
  };

muat().catch((e) => {
  $('#vonis').innerHTML = `<div class="galat"><b>Data tidak bisa dimuat</b>${aman(e.message)}. Coba muat ulang halaman.</div>`;
  console.error(e);
});

// Grafik digambar dalam piksel, jadi harus digambar ulang saat lebar berubah.
let jedaUkur;
addEventListener('resize', () => {
  clearTimeout(jedaUkur);
  jedaUkur = setTimeout(() => { if (D) { gambarPeta(); gambarAngin(); gambarUdara(); gambarGempa(); } }, 180);
});

// segarkan tampilan waktu relatif tanpa menarik ulang data
setInterval(() => { if (D) { gambarSegar(); gambarKabar(); } }, 60_000);
// tarik data baru tiap 5 menit selama tab terlihat
setInterval(() => { if (document.visibilityState === 'visible') muat().catch(() => {}); }, 300_000);
