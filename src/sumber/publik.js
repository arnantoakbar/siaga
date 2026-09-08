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

/** Gambar sampul dari <enclosure>, <media:content>, atau <img> di deskripsi. */
function gambarItem(it) {
  const cari = [
    /<enclosure[^>]+url="([^"]+)"[^>]*type="image/i,
    /<enclosure[^>]+type="image[^"]*"[^>]*url="([^"]+)"/i,
    /<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i,
    /<img[^>]+src="([^"]+)"/i,
  ];
  for (const re of cari) {
    const m = it.match(re);
    if (m?.[1]?.startsWith('http')) return unesc(m[1]);
  }
  return null;
}

function uraiRss(xml, batas = 30) {
  return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, batas)
    .map((m) => {
      const it = m[1];
      const tautan = isi(it, 'link') || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || '';
      const waktu = isi(it, 'pubDate') || isi(it, 'published') || isi(it, 'updated');
      const ms = Date.parse(waktu);
      // Google News menempelkan " - Nama Penerbit" di ujung tiap judul, padahal
      // penerbitnya sudah dikirim terpisah di <source> dan ditampilkan sendiri.
      // Dibuang HANYA kalau ekornya sama persis dengan <source>, jadi judul yang
      // memang berakhiran tanda hubung tidak ikut terpotong.
      const sumber = isi(it, 'source') || isi(it, 'dc:creator') || null;
      let judul = isi(it, 'title');
      if (sumber && judul.endsWith(` - ${sumber}`)) judul = judul.slice(0, -(sumber.length + 3)).trim();

      return {
        judul,
        tautan,
        sumber,
        waktu: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
        ringkas: isi(it, 'description').slice(0, 300),
        gambar: gambarItem(it),
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
 * RSS penerbit langsung. Google News punya jangkauan paling luas tapi tautannya
 * lewat pengalih Google dan tidak pernah membawa gambar. Umpan penerbit membawa
 * URL artikel asli DAN gambar sampulnya, jadi keduanya dipakai bersama.
 * Karena umpan ini berisi semua berita, hasilnya disaring dengan kata kunci.
 */
export async function beritaPenerbit(umpan, kataKunci) {
  const kunci = kataKunci.map((k) => k.toLowerCase());
  const per = await Promise.allSettled(
    umpan.map(async (u) => {
      const item = uraiRss(await ambil(u.url, { timeout: 15000 }), 60);
      return item.map((x) => ({ ...x, kanal: 'berita', sumber: x.sumber || u.nama }));
    })
  );
  const semua = per.filter((p) => p.status === 'fulfilled').flatMap((p) => p.value);
  if (!semua.length) throw new Error(per.map((p) => p.reason?.message).filter(Boolean).join(' | ') || 'kosong');
  return semua.filter((x) => kunci.some((k) => `${x.judul} ${x.ringkas}`.toLowerCase().includes(k)));
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

/**
 * FxTwitter: mengubah SATU tautan X yang sudah diketahui menjadi JSON bersih —
 * teks penuh, penulis, waktu, foto/video, dan metrik. Tanpa kunci, tanpa batas.
 *
 * PENTING soal peran: FxTwitter TIDAK punya endpoint pencarian maupun linimasa.
 * Sudah dicoba /latest, /timeline, /search — semuanya 404. Jadi ia bukan alat
 * PENEMUAN, melainkan alat PENGAYAAN. Penemuan tetap harus datang dari tempat
 * lain (linimasa sematan X, Nitter, atau tautan yang kamu pasang sendiri),
 * lalu setiap tautan yang ditemukan dilewatkan ke sini supaya isinya utuh.
 */
export async function xLengkapi(url) {
  const m = String(url).match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{10,25})/);
  if (!m) throw new Error(`bukan tautan posting X: ${url}`);
  const j = await ambil(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, {
    json: true,
    timeout: 12000,
    headers: { Accept: 'application/json' },
  });
  const t = j?.tweet;
  if (!t) throw new Error(`FxTwitter tidak mengembalikan posting untuk ${m[2]}`);
  const foto = t.media?.photos?.[0]?.url || null;
  const video = t.media?.videos?.[0];
  return {
    judul: (t.text || '').replace(/\s+/g, ' ').slice(0, 400),
    tautan: t.url || `https://x.com/${m[1]}/status/${m[2]}`,
    sumber: t.author?.screen_name ? `@${t.author.screen_name}` : `@${m[1]}`,
    penulis: t.author?.name || null,
    waktu: t.created_at ? new Date(t.created_at).toISOString() : null,
    gambar: foto || video?.thumbnail_url || null,
    adaVideo: !!video,
    metrik: { suka: t.likes ?? null, ulang: t.retweets ?? null, lihat: t.views ?? null },
    kanal: 'x',
  };
}

/**
 * Lengkapi banyak tautan sekaligus, beberapa saja pada satu waktu supaya
 * FxTwitter tidak dibanjiri. Yang gagal dilewati, bukan menggagalkan sisanya.
 */
export async function xLengkapiBanyak(daftarUrl, serentak = 4) {
  const unik = [...new Set(daftarUrl.filter(Boolean))];
  const hasil = [];
  const galat = [];
  for (let i = 0; i < unik.length; i += serentak) {
    const petak = await Promise.allSettled(unik.slice(i, i + serentak).map((u) => xLengkapi(u)));
    for (const [n, p] of petak.entries())
      p.status === 'fulfilled' ? hasil.push(p.value) : galat.push(`${unik[i + n]}: ${p.reason?.message}`);
  }
  return { hasil, galat };
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
