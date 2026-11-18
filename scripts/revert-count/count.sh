#!/bin/sh
# Weekly score for the checks: how many commits in the last N days (default 7) undid earlier work.
# Counts a commit whose subject starts with Revert, Rollback or "Roll back", with or without a "Fix:" style prefix.
# A heuristic on the subject line: a commit that merely mentions a word later in the subject is not counted.
# Usage: sh scripts/revert-count/count.sh [days] [git-ref]
# Prints "<count> reverts or rollbacks in the last <days> days of <total> commits", then one line per hit.
set -eu
days="${1:-7}"
ref="${2:-HEAD}"
case "$days" in ''|*[!0-9]*) echo "days must be a whole number" >&2; exit 2;; esac
log=$(git log "$ref" --since="$days days ago" --format='%h %s')
total=$(printf '%s' "$log" | grep -c . || true)
hits=$(printf '%s\n' "$log" | grep -iE '^[0-9a-f]+ ([^ ]+: )?(revert|rollback|roll back)([ :"]|$)' || true)
count=$(printf '%s' "$hits" | grep -c . || true)
echo "$count reverts or rollbacks in the last $days days of $total commits"
[ -n "$hits" ] && printf '%s\n' "$hits"
exit 0
