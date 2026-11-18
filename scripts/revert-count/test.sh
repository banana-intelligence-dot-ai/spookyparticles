#!/bin/sh
# Builds a throwaway repo and checks count.sh counts reverts and rollbacks, and nothing else.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
cd "$d"
git init -q
git config user.email t@example.com
git config user.name t
for m in "Add feature" 'Revert "Add feature"' "Rollback the deploy" "Fix: roll back the migration" "Reverting is fine in prose, not at the start" "Revert: the hero change" "Add rollback protection" "Rollback-safe deploy" "Roll backpacking docs" "Polish copy"; do
  git commit -q --allow-empty -m "$m"
done
out=$(sh "$here/count.sh" 7)
echo "$out" | head -1 | grep -q '^4 reverts or rollbacks in the last 7 days of 10 commits$' || { echo "FAIL: $out"; exit 1; }
sh "$here/count.sh" abc >/dev/null 2>&1 && { echo "FAIL: bad days accepted"; exit 1; }
echo "PASS revert-count"
