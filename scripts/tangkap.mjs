// Tangkapan layar untuk README. Alat pengembangan, bukan bagian dari layanan.
//
// Chrome headless dengan --window-size tidak menyetel viewport tata letak dengan tepat,
// jadi ukuran perangkat diatur lewat Chrome DevTools Protocol. Node 25 sudah punya
// klien WebSocket bawaan, jadi ini tetap tanpa dependensi.
//
//   node scripts/tangkap.mjs [urlDasar] [dirKeluar]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const DASAR = process.argv[2] || 'http://localhost:8080';
const KELUAR = process.argv[3] || 'docs';
const SARING = process.env.ADEGAN || '';   // ADEGAN=12 node scripts/tangkap.mjs -> hanya adegan cocok
const CHROME =
  process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;

const ADEGAN = [
  { nama: '01-situasi-mobile', w: 390, h: 940, dsf: 3, tema: 'gelap', tab: 'situasi' },
  { nama: '02-cctv-mobile',    w: 390, h: 900, dsf: 3, tema: 'gelap', tab: 'situasi', gulir: 1150 },
  { nama: '03-lokasi-mobile',  w: 390, h: 940, dsf: 3, tema: 'gelap', tab: 'lokasi', gulir: 430 },
  { nama: '04-dampak-mobile',  w: 390, h: 940, dsf: 3, tema: 'gelap', tab: 'dampak' },
  {
    nama: '05-tindakan-mobile', w: 390, h: 900, dsf: 3, tema: 'gelap', tab: 'dampak', gulir: 700,
    siapkan: `document.querySelectorAll('.petak-sel')[2]?.click();`, jeda: 700,
  },
  { nama: '06-linimasa-mobile', w: 390, h: 980, dsf: 3, tema: 'gelap', tab: 'sumber', gulir: 250 },
  { nama: '07-situasi-terang', w: 390, h: 940, dsf: 3, tema: 'terang', tab: 'situasi' },
  { nama: '08-situasi-desktop',w: 1100, h: 940, dsf: 2, tema: 'terang', tab: 'situasi' },
  { nama: '09-peta-desktop',   w: 1100, h: 940, dsf: 2, tema: 'terang', tab: 'lokasi', gulir: 300 },
  { nama: '10-linimasa-desktop', w: 1100, h: 940, dsf: 2, tema: 'gelap', tab: 'sumber', gulir: 220 },
  {
    nama: '11-bantuan-mobile', w: 390, h: 900, dsf: 3, tema: 'gelap', tab: 'situasi',
    siapkan: `document.querySelector('#tombol-bantuan').click();`, jeda: 900,
  },
  {
    nama: '12-udara-desktop', w: 1100, h: 780, dsf: 2, tema: 'gelap', tab: 'dampak',
    siapkan: `const d = document.querySelector('#udara-wadah').closest('details');
      d.open = true; d.dispatchEvent(new Event('toggle'));`,
    jeda: 1200, gulir: 620,
  },
  {
    nama: '13-lokasi-perangkat', w: 390, h: 900, dsf: 3, tema: 'gelap', tab: 'lokasi',
    // Chrome headless tidak punya lokasi sungguhan; getCurrentPosition diganti
    // koordinat Bandung supaya alurnya bisa dipotret apa adanya.
    siapkan: `navigator.geolocation.getCurrentPosition = (ok) =>
        ok({ coords: { latitude: -6.9175123, longitude: 107.6191456 } });
      document.querySelector('#tombol-lokasi').click();`,
    jeda: 3200,
  },
  {
    nama: '14-windy-desktop', w: 1100, h: 940, dsf: 2, tema: 'gelap', tab: 'lokasi', gulir: 240,
    // Persetujuan harus lewat tombolnya: menulis localStorage saja tidak cukup,
    // karena nilainya sudah dibaca ke memori saat skrip halaman dimuat.
    siapkan: `document.querySelector('#alih-windy').click();
      document.querySelector('#windy-setuju').click();`,
    jeda: 9000,
  },
];

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  #ws; #id = 0; #tunggu = new Map();
  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (e) => {
      const p = JSON.parse(e.data);
      if (p.id && this.#tunggu.has(p.id)) {
        const { ok, gagal } = this.#tunggu.get(p.id);
        this.#tunggu.delete(p.id);
        p.error ? gagal(new Error(p.error.message)) : ok(p.result);
      }
    });
  }
  kirim(method, params = {}) {
    const id = ++this.#id;
    return new Promise((ok, gagal) => {
      this.#tunggu.set(id, { ok, gagal });
      this.#ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => this.#tunggu.has(id) && gagal(new Error(`${method} kehabisan waktu`)), 30000);
    });
  }
}

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/siaga-tangkap', 'about:blank',
]);
chrome.on('error', (e) => { console.error('Chrome gagal dijalankan:', e.message); process.exit(1); });

try {
  // tunggu port debug siap
  let versi = null;
  for (let i = 0; i < 40 && !versi; i++) {
    await tidur(250);
    versi = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
  }
  if (!versi) throw new Error('port debug Chrome tidak pernah siap');
  console.log(versi.Browser);
  mkdirSync(KELUAR, { recursive: true });

  for (const a of ADEGAN.filter((x) => !SARING || x.nama.includes(SARING))) {
    const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    const cdp = new Cdp(ws);

    await cdp.kirim('Page.enable');
    await cdp.kirim('Emulation.setDeviceMetricsOverride', {
      width: a.w, height: a.h, deviceScaleFactor: a.dsf, mobile: a.w < 700,
    });
    await cdp.kirim('Page.navigate', { url: `${DASAR}/?tema=${a.tema}#${a.tab}` });
    await tidur(3600); // muat data + gambar SVG
    if (a.siapkan) {
      await cdp.kirim('Runtime.evaluate', { expression: a.siapkan, awaitPromise: false });
      await tidur(a.jeda ?? 1500);
    }
    if (a.gulir)
      await cdp.kirim('Runtime.evaluate', { expression: `window.scrollTo(0, ${a.gulir})` });
    await tidur(900); // animasi kerucut selesai

    const { data } = await cdp.kirim('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(`${KELUAR}/${a.nama}.png`, Buffer.from(data, 'base64'));
    console.log(`  ${a.nama}.png  ${a.w}x${a.h} @${a.dsf}x  ${a.tema}`);
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  }
} finally {
  chrome.kill();
}
