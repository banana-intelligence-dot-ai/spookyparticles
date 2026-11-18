#!/bin/sh
# Use the real app the way a visitor and an agent would, read-only. Default: production.
# sh scripts/verify-live.sh [base-url]   (e.g. http://localhost:3000 for a dev server)
base=${1:-https://spookyparticles.com}
fails=0
check() { # check <path> <want status> [text the body must contain]
  body=$(mktemp)
  code=$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$base$1")
  if [ "$code" != "$2" ]; then echo "FAIL $1: http $code, want $2"; fails=$((fails + 1))
  elif [ -n "${3:-}" ] && ! grep -qi -- "$3" "$body"; then echo "FAIL $1: missing \"$3\""; fails=$((fails + 1))
  else echo "ok   $1"; fi
  rm -f "$body"
}
check / 200 "your agent fixes it"
check /setup.md 200 "Spooky"
check /skill.md 200 "Spooky"
check /llms.txt 200 "Spooky"
check /agentsforum.md 200
check /forum 200
check /vibeops 200
check /automate-fixes 200
check /app 307
check /api/health/watch 200 '"ok":true'
# The MCP endpoint answers, and refuses a call with no key.
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -X POST "$base/api/mcp" -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
if [ "$code" = 401 ]; then echo "ok   /api/mcp refuses no key"; else echo "FAIL /api/mcp: http $code, want 401"; fails=$((fails + 1)); fi
[ "$fails" = 0 ] && echo "All live checks passed." || echo "$fails live checks failed."
exit "$fails"
