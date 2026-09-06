// Kanal tidak resmi: berita dan media sosial.
// Semua yang keluar dari berkas ini WAJIB ditandai belum terverifikasi di UI.
// Gunanya cuma satu: memberi tahu bahwa ada yang sedang ramai dibicarakan
// lebih cepat daripada rilis resmi — bukan menggantikan rilis resmi.
import { ambil, unesc } from '../util.js';

const isi = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return unesc(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
};

function uraiRss(xml, batas = 30) {
  return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, batas)
    .map((m) => {
      const it = m[1];
      const tautan = isi(it, 'link') || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
      const waktu = isi(it, 'pubDate') || isi(it, 'published') || isi(it, 'updated');
      const ms = Date.parse(waktu);
      return {
        judul: isi(it, 'title'),
        tautan,
        sumber: isi(it, 'source') || isi(it, 'dc:creator') || null,
        waktu: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
        ringkas: isi(it, 'description').slice(0, 300),
      };
    })
    .filter((x) => x.judul && x.waktu);
}

/** Google News RSS — agregasi puluhan media Indonesia, gratis, tanpa kunci. */
export async function berita(kataKunci) {
  const q = encodeURIComponent(kataKunci);
  const xml = await ambil(`https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`);
  return uraiRss(xml).map((b) => ({ ...b, kanal: 'berita' }));
}

/**
 * X lewat instans Nitter (RSS). Tanpa API berbayar.
 * Instans Nitter sering kena rate limit / mati; instans dicoba berurutan
 * dan kegagalan dilaporkan apa adanya, tidak disembunyikan.
 */
export async function xNitter(instans, kataKunci, akun = []) {
  const galat = [];
  for (const host of instans) {
    try {
      const jalur = kataKunci
        ? `/search/rss?f=tweets&q=${encodeURIComponent(kataKunci)}`
        : `/${akun[0]}/rss`;
      const xml = await ambil(`${host}${jalur}`, { timeout: 12000 });
      if (/not yet whitelisted/i.test(xml)) {
        const id = (xml.match(/ID:\s*([a-f0-9]{32,})/i) || [])[1];
        galat.push(`${host}: pembaca RSS belum di-whitelist${id ? ` (ID ${id.slice(0, 16)}…)` : ''}`);
        continue;
      }
      const item = uraiRss(xml);
      if (item.length) return { host, item: item.map((x) => ({ ...x, kanal: 'x' })), galat };
      galat.push(`${host}: 0 item`);
    } catch (e) {
      galat.push(`${host}: ${e.message}`);
    }
  }
  throw new Error(`Semua instans Nitter gagal — ${galat.join(' | ')}`);
}

/** Linimasa akun tertentu lewat endpoint sematan X. Tanpa kunci, tapi sensitif reputasi IP. */
export async function xSindikasi(akun) {
  const html = await ambil(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${akun}`,
    { timeout: 15000 }
  );
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`X sindikasi ${akun}: payload tidak ditemukan (kemungkinan rate limit)`);
  const entri = JSON.parse(m[1])?.props?.pageProps?.timeline?.entries || [];
  return entri
    .map((e) => e?.content?.tweet)
    .filter(Boolean)
    .map((t) => ({
      judul: (t.full_text || t.text || '').replace(/\s+/g, ' ').slice(0, 280),
      tautan: `https://x.com/${akun}/status/${t.id_str}`,
      sumber: `@${akun}`,
      waktu: t.created_at ? new Date(t.created_at).toISOString() : null,
      kanal: 'x',
      resmi: true,
    }))
    .filter((x) => x.waktu);
}

/** Ambil isi satu posting X lewat FxTwitter. Tanpa kunci — untuk memperkaya tautan yang sudah diketahui. */
export async function xLengkapi(url) {
  const m = url.match(/(?:twitter|x)\.com\/([^/]+)\/status\/(\d+)/);
  if (!m) return null;
  const j = await ambil(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, {
    json: true,
    timeout: 12000,
  });
  const t = j?.tweet;
  if (!t) return null;
  return {
    judul: (t.text || '').replace(/\s+/g, ' ').slice(0, 280),
    tautan: t.url,
    sumber: `@${t.author?.screen_name}`,
    waktu: t.created_at ? new Date(t.created_at).toISOString() : null,
    gambar: t.media?.photos?.[0]?.url || null,
    metrik: { suka: t.likes, ulang: t.retweets, lihat: t.views },
    kanal: 'x',
  };
}

/**
 * Threads (Meta). Butuh token OAuth pengguna di env THREADS_TOKEN.
 * PENTING: tanpa persetujuan App Review untuk izin `threads_keyword_search`,
 * endpoint ini HANYA mengembalikan posting milik pemilik token — bukan posting publik.
 * Jadi tanpa App Review kanal ini tidak berguna untuk memantau perbincangan warga.
 */
export async function threads(kataKunci, token = process.env.THREADS_TOKEN) {
  if (!token) throw new Error('THREADS_TOKEN belum diisi — kanal Threads dilewati');
  const q = new URLSearchParams({
    q: kataKunci,
    search_type: 'TOP',
    fields: 'id,text,permalink,timestamp,username',
    access_token: token,
  });
  const j = await ambil(`https://graph.threads.net/v1.0/keyword_search?${q}`, {
    json: true,
    timeout: 15000,
  });
  return (j.data || []).map((p) => ({
    judul: (p.text || '').replace(/\s+/g, ' ').slice(0, 280),
    tautan: p.permalink,
    sumber: p.username ? `@${p.username}` : null,
    waktu: p.timestamp ? new Date(p.timestamp).toISOString() : null,
    kanal: 'threads',
  }));
}
