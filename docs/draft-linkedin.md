# Draft posting — LinkedIn (English)

> `siaga.flavida.co` sudah tayang dan menyajikan aplikasinya (diperiksa 9 Sep 2026,
> aset `v=32`, potret 3 menit, 13/16 sumber ok).

## Hasil cross-check klaim "dentuman itu Anak Krakatau"

Draf pertama menulis "Last Saturday night" dan menyebut penyebabnya sebagai fakta datar.
Dua-duanya keliru. Yang benar menurut sumbernya:

| Klaim | Kenyataannya |
|---|---|
| Malam Sabtu | **Jumat malam 4 Sep sampai dini hari Sabtu 5 Sep**, laporan berlanjut sampai sekitar 07.00 WIB |
| Penyebabnya Anak Krakatau | Resminya **"kemungkinan besar"**, bukan kepastian |
| Langsung diketahui | Butuh **sekitar dua hari**. Tanggal 5 Sep BMKG masih menyebutnya *skyquake* dan bilang penyebabnya belum terjawab. Baru 7 Sep BMKG dan Badan Geologi menyimpulkan sumbernya |

Yang menguatkan: Kepala Badan Geologi **Lana Saria** menyebut kecocokan waktu antara erupsi
dan sinyal di stasiun pemantau "mendukung kuat" bahwa itu gelombang akustik erupsi.
Kepala Stasiun Geofisika Kelas I Bandung **Suaidi Ahadi** menjelaskan jalur rambatnya.

Detail yang justru jadi pembuka paling kuat: **Jakarta dan Bogor yang jauh lebih dekat
(sekitar 160 km) malah tidak mendengar atau samar saja**, karena berada di *acoustic shadow
zone*. Bandung di 259 km mendengar jelas, sebab gelombang suaranya membelok naik ke lapisan
atmosfer lalu turun lagi lebih jauh. Jarak dihitung dari koordinat kawah di `config.json`.

Jadi cerita aslinya bukan "ada dentuman, ternyata Krakatau". Ceritanya: selama dua hari
tidak ada yang tahu, termasuk lembaganya. Itu persis masalah yang project ini kerjakan.

---

## Posting utama

Friday night last week, something woke up Bandung. A low boom, then another one. It kept
going until about seven in the morning.

Nobody knew what it was. Not the people hearing it, and for the next two days, not the
agencies either. BMKG called it a skyquake and said the cause was still open. It took until
Monday before BMKG and the Geological Agency settled on an answer. Most likely Anak
Krakatau, about 260 km away.

The strange part is that Jakarta and Bogor are much closer, roughly 160 km, and barely heard
anything. BMKG explained it later. The sound bent upward through the atmosphere and came
back down further away, leaving the cities in between inside an acoustic shadow. Bandung got
a noise that the towns nearer the volcano slept through.

Then the ash arrived. Bogor, Jakarta, then further east. Airports closed and reopened. In
the first few days almost three thousand flights were disrupted.

All of this was published somewhere the whole time. PVMBG had the alert level. BMKG had the
aviation warnings. AirNav had the airport notices. It just sat on separate government sites,
written for other agencies, while the fastest thing reaching most people was their timeline,
where a photo from 2018 travels as fast as a report from this morning.

The people in the worst position were the ones with no social media. They only had the
noise.

So on Sunday morning I opened an empty folder.

siaga.flavida.co

It answers three questions. What the volcano is doing right now. Whether it reaches where
you are. What to do about it. Free, no login, no ads, written in plain Indonesian instead of
agency language.

Sixteen sources go in, refreshed every ten minutes. Official volcano reports, seismic
readings, air quality converted into Indonesia's own ISPU standard, upper level winds so the
ash drift follows the wind that actually carries it, six live crater cameras, aviation ash
warnings, airport weather. News and social posts sit alongside all of that, labelled as
unverified so nobody mistakes one for the other.

Every number carries a timestamp and a link back to where it came from. The analysis is
rule based rather than a language model improvising, because someone deciding whether to
move their family needs to be able to check the arithmetic themselves.

It also refuses to answer things it cannot verify. Airport closures travel through NOTAM,
which has no free channel. I tried eight different routes into it and every one of them
failed, so I wrote down all eight failures in the repo. The site never says an airport is
open or closed. It shows the official announcements as they were reported, puts the time in
bold, and tells you to call your airline.

The part I want to be direct about is the cost, because I think it matters more than the
code.

This was three days of work, and it costs nothing to run. Zero npm dependencies, so there is
no supply chain to babysit. It sits on my own homelab hardware and reads only free public
data. No paid APIs, no cloud bill, no sponsor, no plan to monetise it.

Working with AI is what made three days possible instead of three months. Combine that with
hardware already humming in your house and the barrier to shipping something genuinely
useful for the public is basically gone. You do not need funding, a team, or permission.
You need a real problem and a few free evenings.

Indonesia sits on the Ring of Fire. Earthquakes, floods, landslides, tsunamis, eruptions.
The pattern repeats every time. The data exists, and it does not reach the people standing
in it fast enough.

Anak Krakatau is where this starts. The goal is every hazard type in Indonesia, working as
an unofficial early warning layer that sits next to the agencies and helps their work travel
further and faster than it does now.

The code is open. github.com/arnantoakbar/siaga

I would really like help, particularly with:

Data channels from BMKG, BNPB or PVMBG that I have not found yet
Frontend and accessibility, because this has to work on a cheap phone with one bar of signal
Flood, landslide and tsunami data sources, which I know far less about
Anything that reaches people offline. SMS, radio, community WhatsApp groups

And if you are somewhere affected right now, just use it. That is what it is for.

---

## Versi pendek

Friday night last week, Bandung woke up to booms that went on until morning. Nobody knew
what they were, including the agencies. It took two days before BMKG and the Geological
Agency said it was most likely Anak Krakatau, 260 km away. Jakarta and Bogor are much
closer and heard almost nothing, because the sound bent up over them and landed further
out.

Then the ash reached Bogor and Jakarta, airports started closing, and nearly three thousand
flights were disrupted.

The information existed the whole time. PVMBG had it, BMKG had it, AirNav had it. It was
just scattered across government sites while the fastest thing reaching people was their
timeline.

So I built one page that answers three questions. What the volcano is doing, whether it
reaches you, and what to do about it.

siaga.flavida.co, free, no login, no ads.

Sixteen sources every ten minutes. Every number timestamped and linked to its origin.
Rule based analysis, not a language model guessing. It also refuses to state anything it
cannot verify, and says so on the page.

Three days of work with AI, running on my own homelab, on free public data. No paid APIs and
no cloud bill. The barrier to building something useful for the public has basically
disappeared.

Anak Krakatau is the start. The goal is every hazard type in Indonesia, as an unofficial
early warning layer next to the agencies.

Code is open and help is welcome: github.com/arnantoakbar/siaga
