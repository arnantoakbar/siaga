export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

export async function ambil(url, opsi = {}) {
  // Sumber pemerintah kadang membalas 403/5xx sesaat saat sedang ramai.
  // Satu kali coba ulang cukup; lebih dari itu malah menambah beban mereka.
  try {
    return await sekaliAmbil(url, opsi);
  } catch (e) {
    if (!/HTTP (403|429|5\d\d)/.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return sekaliAmbil(url, opsi);
  }
}

async function sekaliAmbil(url, { timeout = 20000, headers = {}, json = false } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8', ...headers },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return json ? await r.json() : await r.text();
  } finally {
    clearTimeout(t);
  }
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', deg: '°',
              copy: '©', reg: '®', hellip: '…', ndash: '–', mdash: '—', rsquo: '\u2019', lsquo: '\u2018' };
export function unesc(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}

/** HTML -> baris teks bersih. */
export function keTeks(html) {
  return unesc(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|td|tr|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;

/** Jarak lingkaran besar, km. */
export function jarakKm(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Azimuth awal dari titik A ke B, derajat 0..360 (0 = utara). */
export function arahDerajat(aLat, aLon, bLat, bLon) {
  const dLon = rad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(rad(bLat));
  const x =
    Math.cos(rad(aLat)) * Math.sin(rad(bLat)) -
    Math.sin(rad(aLat)) * Math.cos(rad(bLat)) * Math.cos(dLon);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Selisih sudut terkecil antara dua azimuth, 0..180. */
export function bedaSudut(a, b) {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

const MATA_ANGIN = ['utara','timur laut','timur','tenggara','selatan','barat daya','barat','barat laut'];
export function mataAngin(deg) {
  return MATA_ANGIN[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
