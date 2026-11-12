#!/usr/bin/env bash
# Tell IndexNow (Bing and friends) which pages changed. Run after a production deploy.
# The key is public by design; it sits at https://spookyparticles.com/<key>.txt.
set -euo pipefail
HOST="spookyparticles.com"
KEY="$(tr -d '\n' < "$(dirname "$0")/../apps/web/public/indexnow-key.txt")"
URLS=$(curl -s "https://$HOST/sitemap.xml" | grep -o "<loc>[^<]*</loc>" | sed -e 's/<loc>//g' -e 's#</loc>##g')
LIST=$(printf '%s\n' $URLS | sed 's/.*/"&"/' | paste -sd, -)
BODY=$(printf '{"host":"%s","key":"%s","keyLocation":"https://%s/%s.txt","urlList":[%s]}' "$HOST" "$KEY" "$HOST" "$KEY" "$LIST")
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.indexnow.org/IndexNow" -H "Content-Type: application/json; charset=utf-8" --data-binary "$BODY")
echo "IndexNow: HTTP $code for $(printf '%s\n' $URLS | wc -l | tr -d ' ') urls (200 or 202 is accepted)"
