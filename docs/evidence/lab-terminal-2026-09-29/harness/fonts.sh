#!/bin/sh
# A local copy of the site's Google Fonts (Inter, JetBrains Mono), for serve.cjs (FONTS=<dir>) on a machine
# whose browser can't reach Google Fonts itself. Usage: fonts.sh <dir>
set -eu
dir=${1:?usage: fonts.sh <dir>}
mkdir -p "$dir"
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
curl -sS -A "$ua" 'https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=JetBrains+Mono:wght@400;500;600&display=swap' -o "$dir/css.css"
for u in $(grep -o 'https://fonts.gstatic.com[^)]*' "$dir/css.css" | sort -u); do
  curl -sS "$u" -o "$dir/$(echo "$u" | sed 's#https://fonts.gstatic.com/##; s#/#_#g')"
done
