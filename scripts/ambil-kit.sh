#!/bin/sh
# Salin bagian kit Flavida yang dipakai Siaga ke public/flavida/.
#   scripts/ambil-kit.sh [lokasi-flavida-design-system]
# Hanya CSS, dua font, tanda logo, dan dua stiker. Tanpa Motion, flavida.js, atau
# sprite ikon: halaman ini gerak lewat CSS saja, dan ikonnya digambar di index.html.
set -e
R="${1:-../flavida-design-system}"
T="$(cd "$(dirname "$0")/.." && pwd)/public/flavida"
mkdir -p "$T/fonts"
cp "$R"/colors_and_type.css "$R"/flavida.css "$R"/flavida-extra.css "$R"/flavida-app.css "$T"/
cp "$R"/fonts/gabarito-latin-wght.woff2 "$R"/fonts/figtree-latin-wght.woff2 "$R"/fonts/OFL-gabarito.txt "$R"/fonts/OFL-figtree.txt "$T"/fonts/
cp "$R"/assets/v4/mark-color.svg "$R"/assets/v4/mark-simple.svg "$T"/
cp "$R"/assets/flav/sticker/flav-reading.webp "$R"/assets/flav/sticker/flav-worried.webp "$T"/
(cd "$R" && printf 'Flavida design system %s\n' "$(git log -1 --format='%h %s' 2>/dev/null)") > "$T/VERSI.txt"
echo "Kit Flavida disalin ke $T"
