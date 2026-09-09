# Draft posting — LinkedIn (English)

> `siaga.flavida.co` sudah tayang dan menyajikan aplikasinya (diperiksa 9 Sep 2026,
> aset `v=32`, potret 3 menit, 13/16 sumber ok). Tautannya aman dipakai.
>
> Dua hal untuk dicek sendiri sebelum posting:
> - Kalimat "Saturday night" soal dentuman di Bandung — sesuaikan kalau malamnya beda.
> - Kalimat soal homelab — ganti kalau kuro men-deploy-nya bukan di homelab kamu.

---

## Posting utama

Last Saturday night, people in Bandung heard booms. Nobody knew what they were.

It was Anak Krakatau, across the strait. Over the next two days the ash reached Bogor,
Jakarta and further. Airports closed and reopened. Nearly three thousand flights were
disrupted.

The information existed the whole time. PVMBG published the alert level. BMKG published
the aviation warnings. But it was scattered across agency websites, and the fastest thing
reaching most people was their timeline — where a photo from 2018 travels as fast as a
report from this morning.

The people worst off were the ones with no social media at all. They knew nothing.

So on Sunday morning I started building one place that answers three questions:

What is the volcano doing right now.
Does it reach where I am.
What do I do about it.

It is live at siaga.flavida.co, free, no login, no ads.

Under it are 16 data sources pulled every 10 minutes — official volcano reports, seismic
data, air quality converted to Indonesia's own ISPU standard, upper-level winds to model
where ash actually drifts, six live crater cameras, aviation ash warnings, and airport
weather. Social media and news sit alongside the official data, clearly labelled as
unverified so nobody confuses the two.

Every number carries a timestamp and a link to its source. The analysis is rule-based,
not a language model improvising — because when someone decides whether to evacuate, they
need to be able to check the arithmetic themselves.

It also refuses to answer things it cannot verify. Airport closures run through NOTAM,
which has no free channel. I tried eight routes and documented every failure in the repo.
So the site never claims an airport is open or closed. It shows the official announcements
as reported, with the time in bold, and tells you to ask your airline.

Here is the part I want to make explicit, because I think it matters more than the code:

This cost nothing to build and costs nothing to run. Working with AI, I went from an empty
folder to a live public service in three days. It has zero npm dependencies, so there is no
supply chain to maintain. It runs on my own homelab hardware, on data sources that are all
free and public. No paid APIs. No cloud bill. No sponsor.

That combination — AI-assisted engineering plus hardware already sitting in your house —
means the barrier to building something genuinely useful for the public has collapsed.
You do not need funding or a team. You need a real problem and a few days.

Indonesia sits on the Ring of Fire. We get earthquakes, floods, landslides, tsunamis and
eruptions, and the pattern is always the same: the data exists, but it does not reach the
people standing in it in time.

Anak Krakatau is where this starts, not where it ends. The goal is to cover every hazard
type in Indonesia and become a genuinely useful unofficial early warning layer — one that
sits next to the official agencies and makes their work reach further, faster.

The code is open. github.com/arnantoakbar/siaga

I would genuinely welcome help, especially:
- Anyone with access to BMKG, BNPB or PVMBG data channels I have not found
- Frontend and accessibility work — this has to be readable on a cheap phone with bad signal
- People who know flood, landslide or tsunami data sources
- Anyone who can help this reach people offline: SMS, radio, community groups

And if you are in an affected area right now, just use it. That is what it is for.

---

## Versi pendek

Last Saturday night, people in Bandung heard booms and nobody knew what they were.

It was Anak Krakatau. The official data existed the whole time — PVMBG, BMKG, all of it.
It was just scattered, and the fastest thing reaching most people was their timeline.

So I built one place that answers three questions: what the volcano is doing, whether it
reaches you, and what to do about it.

siaga.flavida.co — free, no login, no ads.

16 sources pulled every 10 minutes. Every number timestamped and linked to its origin.
Rule-based analysis, not a language model improvising. It also refuses to state things it
cannot verify, and says so plainly.

Built in three days with AI, running on my own homelab, on free public data. No paid APIs,
no cloud bill. The barrier to building something useful for the public has collapsed — you
need a real problem and a few days, not funding.

Anak Krakatau is the start. The goal is every hazard type in Indonesia, as an unofficial
early warning layer next to the official agencies.

Code is open, help is welcome: github.com/arnantoakbar/siaga
