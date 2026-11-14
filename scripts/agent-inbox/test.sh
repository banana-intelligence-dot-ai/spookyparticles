#!/bin/sh
# Runs the installer against a throwaway HOME only. Never touches the real home directory.
set -eu
here=$(CDPATH='' cd "$(dirname "$0")" && pwd)
real_home=$HOME
HOME=$(mktemp -d)
export HOME
[ "$HOME" != "$real_home" ] || { echo "refusing to run"; exit 1; }
trap 'rm -rf "$HOME"' 0
mkdir -p "$HOME/.claude" "$HOME/.cursor" "$HOME/.codex"
echo '{"model":"x"}' > "$HOME/.claude/settings.json"
echo '{"mcpServers":{"other":{"url":"https://o.example/mcp"}}}' > "$HOME/.cursor/mcp.json"
printf 'model = "m"\n' > "$HOME/.codex/config.toml"
printf 'Be nice.\n' > "$HOME/.codex/AGENTS.md"

sh "$here/install.sh" --agent all >/dev/null
files=".claude/settings.json .cursor/mcp.json .cursor/hooks.json .codex/config.toml .codex/AGENTS.md"
for f in $files; do cp "$HOME/$f" "$HOME/$(echo "$f" | tr / _).first"; done
sh "$here/install.sh" --agent all >/dev/null
for f in $files; do
  cmp "$HOME/$f" "$HOME/$(echo "$f" | tr / _).first" || { echo "not idempotent: $f"; exit 1; }
  [ -e "$HOME/$f.bak-spooky" ] || [ "$f" = .cursor/hooks.json ] || { echo "no backup: $f"; exit 1; }
done
grep -q 'Be nice.' "$HOME/.codex/AGENTS.md"
grep -q '"other"' "$HOME/.cursor/mcp.json"
grep -q 'model = "m"' "$HOME/.codex/config.toml"
[ "$(grep -c 'mcp_servers.spooky' "$HOME/.codex/config.toml")" = 1 ]

# --- Fixer: fake curl, claude and codex on PATH; nothing leaves this machine ---------------

fail() { echo "fixer: $1"; exit 1; }
# Keep every path inside the throwaway HOME, whatever this shell has set.
unset XDG_STATE_HOME XDG_CACHE_HOME SPOOKY_URL SPOOKY_FIXER_CONFIG SPOOKY_FIXER_MODEL
FAKE="$HOME/fake"
export FAKE
unset SPOOKY_FIXER_DIR
mkdir -p "$FAKE" "$HOME/bin" "$HOME/code/app1" "$HOME/code/app2"
git -C "$HOME/code/app1" init -q
git -C "$HOME/code/app2" init -q
REAL_GIT=$(command -v git)
export REAL_GIT
PATH="$HOME/bin:$PATH"
export PATH

cat > "$HOME/bin/curl" <<'EOF'
#!/bin/sh
# Records each call and answers from $FAKE. Fails like curl -f when the header is wrong.
all="$*"
input=$(cat)
[ -n "${SPOOKY_API_KEY:-}" ] && case "$all" in *"$SPOOKY_API_KEY"*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
case "$all" in *sp_DEVICEkey*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
method=GET url= project= push=false
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method=$2; shift ;;
    --data-urlencode) case "$2" in project=*) project=${2#project=} ;; esac; shift ;;
    -K) push=true; shift ;;
    -H|-d|-m|-o) shift ;;
    http*) url=$1 ;;
  esac
  shift
done
if [ "$push" = true ]; then echo "push" >> "$FAKE/calls"; exit 0; fi
# Agent sign-in: no key; the device code travels on stdin only.
case "$all" in *dc-SECRET-1*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
case "$url" in
  */api/v1/device/start)
    echo "device start" >> "$FAKE/calls"
    [ -e "$FAKE/no-device" ] && exit 22
    echo '{"deviceCode":"dc-SECRET-1","userCode":"ABCD-EFGH","verificationUri":"https://x.example/link","verificationUriComplete":"https://x.example/link?code=ABCD-EFGH","expiresIn":600,"interval":0}'
    exit 0 ;;
  */api/v1/device/token)
    case "$input" in *dc-SECRET-1*) ;; *) echo "bad device code" >> "$FAKE/calls" ;; esac
    n=$(( $(cat "$FAKE/polls" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE/polls"
    if [ -e "$FAKE/device-deny" ]; then echo '{"error":"access_denied","message":"Denied."}'
    elif [ "$n" -lt 2 ]; then echo '{"error":"authorization_pending","message":"Waiting."}'
    else echo '{"key":"sp_DEVICEkey-SECRET-777","name":"Claude Code on test","prefix":"sp_DEVI","scopes":["read"]}'; fi
    exit 0 ;;
esac
[ "$input" = "Authorization: Bearer $SPOOKY_API_KEY" ] || [ "$input" = "Authorization: Bearer sp_DEVICEkey-SECRET-777" ] \
  || { echo "bad auth" >> "$FAKE/calls"; exit 22; }
file=$(printf '%s' "$project" | tr / _)
case "$method $url" in
  "GET "*/api/v1/me) [ -e "$FAKE/reject-key" ] && exit 22; echo '{}' ;;
  "GET "*/api/v1/projects) echo "projects" >> "$FAKE/calls"; cat "$FAKE/projects.json" ;;
  "GET "*/api/v1/incidents) cat "$FAKE/incidents-$file.txt" 2>/dev/null ;;
  "POST "*/api/v1/incidents/claim) echo "claim $project" >> "$FAKE/calls"; cat "$FAKE/claim.txt" ;;
  "POST "*/api/v1/incidents/confirm) echo "confirm $project" >> "$FAKE/calls"; cat "$FAKE/confirm.txt" ;;
  *) exit 22 ;;
esac
EOF
cat > "$HOME/bin/claude" <<'EOF'
#!/bin/sh
echo "agent claude $PWD" >> "$FAKE/calls"
printf '%s\n' "$@" > "$FAKE/claude-args"
echo "leak $SPOOKY_API_KEY sp_abcdefgh123 https://x.example/api/ping/tok123"
echo "what broke"; echo "no change"; echo "fixed"; echo "Lesson: nightly fails when the feed is empty"
EOF
cat > "$HOME/bin/codex" <<'EOF'
#!/bin/sh
echo "agent codex $PWD" >> "$FAKE/calls"
printf '%s\n' "$@" > "$FAKE/codex-args"
EOF
cat > "$HOME/bin/gh" <<'EOF'
#!/bin/sh
# Signed in only when $FAKE/gh-signed-in exists. A clone makes a real repo with its origin set.
[ -n "${SPOOKY_API_KEY:-}" ] && case "$*" in *"$SPOOKY_API_KEY"*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
case "$1 $2" in
  "auth status") [ -e "$FAKE/gh-signed-in" ]; exit ;;
  "repo clone")
    echo "gh clone $3 $4 $*" >> "$FAKE/calls"
    "$REAL_GIT" init -q "$4" && "$REAL_GIT" -C "$4" remote add origin "https://github.com/$3.git"; exit ;;
esac
exit 1
EOF
cat > "$HOME/bin/git" <<'EOF'
#!/bin/sh
# Real git, except clone: records it, fails for repos named private-*, else makes a local repo.
[ -n "${SPOOKY_API_KEY:-}" ] && case "$*" in *"$SPOOKY_API_KEY"*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
if [ "$1" = clone ]; then
  url= dir=
  for a in "$@"; do url=$dir; dir=$a; done
  echo "git clone $url $dir" >> "$FAKE/calls"
  case "$url" in */private-*) exit 128 ;; esac
  "$REAL_GIT" init -q "$dir" && "$REAL_GIT" -C "$dir" remote add origin "$url.git"; exit
fi
exec "$REAL_GIT" "$@"
EOF
cat > "$HOME/bin/pbpaste" <<'EOF'
#!/bin/sh
cat "$FAKE/clipboard"
EOF
# A fake Keychain, so the tests never touch the real one. A key on the command line is a leak.
cat > "$HOME/bin/security" <<'EOF'
#!/bin/sh
case "$*" in *sp_*) echo "KEY IN ARGV" >> "$FAKE/calls" ;; esac
case "$1" in
  -i) cmd=$(cat); echo "keychain add" >> "$FAKE/calls"; printf '%s\n' "$cmd" | sed -n 's/.* -w \(.*\)$/\1/p' > "$FAKE/keychain" ;;
  find-generic-password) [ -s "$FAKE/keychain" ] || exit 44; cat "$FAKE/keychain" ;;
  delete-generic-password) echo "keychain delete" >> "$FAKE/calls"; rm -f "$FAKE/keychain" ;;
  *) exit 1 ;;
esac
EOF
cat > "$HOME/bin/open" <<'EOF'
#!/bin/sh
echo "open $*" >> "$FAKE/calls"
EOF
chmod +x "$HOME/bin/curl" "$HOME/bin/claude" "$HOME/bin/codex" "$HOME/bin/gh" "$HOME/bin/git" "$HOME/bin/pbpaste" "$HOME/bin/security" "$HOME/bin/open"

deploy_block() {
  cat <<EOF
Spooky Particles: 1 open problem for $1

Deploy failed: $1 (production on Vercel)
When: $2
Change: abc1234 Fix the thing (main). Start there: this commit is the one that failed.
Build log: Type error in page.tsx
Link: https://vercel.com/x/y/z
$3

Fix the cause and deploy. Then ask Spooky to check production; it answers fixed, still broken, or checking:
printf 'Authorization: Bearer %s\n' "\$SPOOKY_API_KEY" | curl -fsS -X POST -H @- "https://spookyparticles.com/api/v1/incidents/confirm?project=$1&format=text"
EOF
}
count() { grep -c "^$1\$" "$FAKE/calls" 2>/dev/null || true; }
fixer() { sh "$here/spooky-fixer.sh" --once "$@" >> "$FAKE/out" 2>&1; }

SPOOKY_API_KEY="sp_k3y-SECRET-value-98765"
SPOOKY_NTFY_TOPIC="topic-SECRET-4242"
export SPOOKY_API_KEY SPOOKY_NTFY_TOPIC
mkdir -p "$HOME/.config/spooky"
printf 'owner/app1=%s\nowner/app2=%s  # second\n' "$HOME/code/app1" "$HOME/code/app2" > "$HOME/.config/spooky/fixer.conf"
echo "Claimed owner/x until 2026-11-12T10:30:00Z. Other sessions will see it is yours." > "$FAKE/claim.txt"
printf 'Spooky fix check for owner/app1: fixed\nProduction is healthy.\n' > "$FAKE/confirm.txt"
deploy_block owner/app1 2026-11-12T09:00:00Z "" > "$FAKE/incidents-owner_app1.txt"
deploy_block owner/app2 2026-11-12T09:05:00Z "Claimed: by other-agent at 2026-11-12T09:06:00Z, until 2026-11-12T09:36:00Z. Leave it to them unless your human says otherwise." > "$FAKE/incidents-owner_app2.txt"

# A new unclaimed problem: one claim, one agent run in its repo, one fix check. Claimed by another: skipped.
fixer --budget 2
[ "$(count 'claim owner/app1')" = 1 ] || fail "expected one claim"
[ "$(count "agent claude $HOME/code/app1")" = 1 ] || fail "expected one agent run in the repo"
[ "$(count 'confirm owner/app1')" = 1 ] || fail "expected one fix check"
[ "$(count 'claim owner/app2')" = 0 ] || fail "claimed a problem another session holds"
grep -q 'owner/app1: fixed' "$FAKE/out" || fail "verdict not logged"
grep -q 'claimed by another session' "$FAKE/out" || fail "held claim not reported"
grep -qx -- '--permission-mode' "$FAKE/claude-args" || fail "claude run without permission mode"
grep -qx -- '--allowedTools' "$FAKE/claude-args" || fail "claude run without an allowlist"
grep -q 'Bash(python3 -m pytest:\*)' "$FAKE/claude-args" || fail "python repos cannot run their tests"
grep -q 'Do not run the claim or confirm commands' "$FAKE/claude-args" || fail "agent told to call Spooky itself"
[ "$(count push)" -ge 1 ] || fail "push not sent when a topic is set"

# The same problem is never run twice.
fixer --budget 2
[ "$(count 'claim owner/app1')" = 1 ] || fail "reran the same problem"
[ "$(grep -c '^agent ' "$FAKE/calls")" = 1 ] || fail "reran an agent"

# Budget: a new problem after today's runs are used gets no run.
deploy_block owner/app1 2026-11-12T11:00:00Z "" > "$FAKE/incidents-owner_app1.txt"
fixer --budget 1
[ "$(count 'claim owner/app1')" = 1 ] || fail "claimed past the budget"
grep -q 'budget of 1 fix runs is used' "$FAKE/out" || fail "budget stop not logged"

# Another session claims first: no run, and the problem is tried again on the next pass.
deploy_block owner/app2 2026-11-12T12:00:00Z "" > "$FAKE/incidents-owner_app2.txt"
echo "other-agent claimed owner/app2 at 2026-11-12T12:00:01Z, until 2026-11-12T12:30:01Z. Leave it to them unless your human says otherwise." > "$FAKE/claim.txt"
fixer --budget 9
[ "$(count 'claim owner/app2')" = 1 ] || fail "did not try to claim"
[ "$(grep -c '^agent ' "$FAKE/calls")" = 1 ] || fail "ran an agent without the claim"

# Codex: runs inside its own sandbox with the model given, never with a bypass flag.
echo "Claimed owner/app2 until 2026-11-12T12:40:00Z." > "$FAKE/claim.txt"
fixer --budget 9 --agent codex --model test-model
[ "$(count "agent codex $HOME/code/app2")" = 1 ] || fail "codex did not run in the repo"
grep -qx 'workspace-write' "$FAKE/codex-args" || fail "codex run without its sandbox"
grep -qx 'test-model' "$FAKE/codex-args" || fail "codex model not passed"
if grep -Eq -- '--full-auto|--dangerously' "$FAKE/codex-args"; then fail "codex bypass flag"; fi

# Claude cannot sign in: the run is undone, so the problem is not done, the day count is
# unchanged, and the fixer exits 3. Claude runs without ANTHROPIC_API_KEY in its environment.
state="$HOME/.local/state/spooky/fixer.state"
day_before=$(grep '^day ' "$state")
cp "$HOME/bin/claude" "$FAKE/claude.good"
cat > "$HOME/bin/claude" <<'EOF'
#!/bin/sh
echo "signin-fail ${ANTHROPIC_API_KEY:-unset}" >> "$FAKE/calls"
echo "Invalid API key. Please run /login"
exit 1
EOF
deploy_block owner/app2 2026-11-12T12:30:00Z "" > "$FAKE/incidents-owner_app2.txt"
code=0
ANTHROPIC_API_KEY=stray-key sh "$here/spooky-fixer.sh" --once --budget 9 >> "$FAKE/out" 2>&1 || code=$?
[ "$code" = 3 ] || fail "sign-in failure exited $code, not 3"
[ "$(count 'signin-fail unset')" = 1 ] || fail "claude ran with ANTHROPIC_API_KEY set"
[ "$(grep '^day ' "$state")" = "$day_before" ] || fail "sign-in failure counted against the day"
grep -q 'could not sign in' "$FAKE/out" || fail "sign-in failure not logged"
cp "$FAKE/claude.good" "$HOME/bin/claude"
fixer --budget 9
[ "$(count "agent claude $HOME/code/app2")" = 1 ] || fail "problem marked done after a sign-in failure"

# A repo with uncommitted work is left alone.
touch "$HOME/code/app1/wip.txt"
deploy_block owner/app1 2026-11-12T13:00:00Z "" > "$FAKE/incidents-owner_app1.txt"
fixer --budget 9
[ "$(count 'claim owner/app1')" = 1 ] || fail "claimed in a dirty repo"
grep -q 'uncommitted changes' "$FAKE/out" || fail "dirty repo not reported"

# A clone behind origin is brought up to date, onto the default branch, before the agent runs.
rm -f "$HOME/code/app1/wip.txt"
g() { "$REAL_GIT" -c user.email=t@t -c user.name=t "$@"; }
g init -q --bare "$FAKE/origin1.git"
g init -q -b main "$FAKE/seed1"
g -C "$FAKE/seed1" commit -q --allow-empty -m one
g -C "$FAKE/seed1" push -q "$FAKE/origin1.git" main
"$REAL_GIT" -C "$FAKE/origin1.git" symbolic-ref HEAD refs/heads/main
rm -rf "$HOME/code/app1"; "$REAL_GIT" clone -q "$FAKE/origin1.git" "$HOME/code/app1"
g -C "$HOME/code/app1" checkout -q -b old-fix
g -C "$FAKE/seed1" commit -q --allow-empty -m two
g -C "$FAKE/seed1" push -q "$FAKE/origin1.git" main
deploy_block owner/app1 2026-11-12T14:00:00Z "" > "$FAKE/incidents-owner_app1.txt"
runs_before=$(count "agent claude $HOME/code/app1")
fixer --budget 99
[ "$("$REAL_GIT" -C "$HOME/code/app1" rev-parse --abbrev-ref HEAD)" = main ] || fail "agent not run on the default branch"
[ "$("$REAL_GIT" -C "$HOME/code/app1" log -1 --format=%s)" = two ] || fail "repo not updated before the run"
[ "$(count "agent claude $HOME/code/app1")" = $((runs_before + 1)) ] || fail "no run after the update"

# Local commits that are not on origin: skipped, never merged or discarded.
g -C "$HOME/code/app1" commit -q --allow-empty -m mine
g -C "$FAKE/seed1" commit -q --allow-empty -m three
g -C "$FAKE/seed1" push -q "$FAKE/origin1.git" main
deploy_block owner/app1 2026-11-12T15:00:00Z "" > "$FAKE/incidents-owner_app1.txt"
fixer --budget 99
[ "$(count "agent claude $HOME/code/app1")" = $((runs_before + 1)) ] || fail "ran on a diverged repo"
[ "$("$REAL_GIT" -C "$HOME/code/app1" log -1 --format=%s)" = mine ] || fail "local commit lost"
grep -q 'could not bring' "$FAKE/out" || fail "diverged repo not reported"

# A job that keeps failing is one problem: a new failed run moves its When line but starts no new
# fix. Once it recovers (gone from the inbox) and fails again, that is a new problem.
job_block() {
  printf 'Spooky Particles: 1 open problem for %s\n\nJob failed: Nightly (%s)\nWhen: last check-in %s; next due 2026-11-13T07:30:00Z\nLast note: exit 1\nLink: https://spookyparticles.com/app/jobs\n\n' "$1" "$1" "$2"
}
: > "$FAKE/incidents-owner_app1.txt"
job_block owner/app2 2026-11-12T07:33:00Z > "$FAKE/incidents-owner_app2.txt"
runs_before=$(count "agent claude $HOME/code/app2")
fixer --budget 99
[ "$(count "agent claude $HOME/code/app2")" = $((runs_before + 1)) ] || fail "failed job not run"
job_block owner/app2 2026-11-12T08:33:00Z > "$FAKE/incidents-owner_app2.txt"
fixer --budget 99
[ "$(count "agent claude $HOME/code/app2")" = $((runs_before + 1)) ] || fail "a job's next failed run counted as a new problem"
: > "$FAKE/incidents-owner_app2.txt"
fixer --budget 99
job_block owner/app2 2026-11-13T07:33:00Z > "$FAKE/incidents-owner_app2.txt"
fixer --budget 99
[ "$(count "agent claude $HOME/code/app2")" = $((runs_before + 2)) ] || fail "a job that recovered and failed again got no run"

# Lessons: a run's "Lesson:" line is kept on this computer, and the next run's brief carries it
# plus the repo's own .spooky/lessons.md.
lessons="${XDG_STATE_HOME:-$HOME/.local/state}/spooky/lessons/owner_app2.md"
grep -q 'nightly fails when the feed is empty' "$lessons" 2>/dev/null || fail "lesson not saved"
grep -q 'Lessons from earlier fixes' "$FAKE/claude-args" || fail "brief has no lessons block"
grep -q 'nightly fails when the feed is empty' "$FAKE/claude-args" || fail "saved lesson not in the next brief"
grep -q '.spooky/lessons.md' "$FAKE/claude-args" || fail "brief does not ask for a lesson"

# Sign-in (needs a terminal; script(1) gives one): no key anywhere, so the fixer shows a code,
# opens the link, waits for approval, saves its own key in the Keychain and runs.
if script -q /dev/null true < /dev/null >/dev/null 2>&1; then
  in_tty() { (unset SPOOKY_API_KEY; script -q /dev/null sh "$here/spooky-fixer.sh" "$@" < /dev/null >> "$FAKE/signin-out" 2>&1); }
  rm -f "$FAKE/keychain" "$FAKE/polls"
  in_tty --once --budget 0 || fail "first sign-in run failed"
  grep -q 'ABCD-EFGH' "$FAKE/signin-out" || fail "sign-in code not shown"
  [ "$(count 'open https://x.example/link?code=ABCD-EFGH')" = 1 ] || fail "sign-in link not opened"
  grep -qx 'sp_DEVICEkey-SECRET-777' "$FAKE/keychain" || fail "key not saved in the Keychain"
  grep -q 'Signed in' "$FAKE/signin-out" || fail "sign-in not confirmed"
  [ "$(count 'bad device code')" = 0 ] || fail "device code not sent"
  # Next start uses the saved key: no second sign-in.
  in_tty --once --budget 0 || fail "run with a saved key failed"
  [ "$(count 'device start')" = 1 ] || fail "signed in again with a saved key"
  # A saved key Spooky rejects is removed, and sign-in runs again.
  touch "$FAKE/reject-key"
  in_tty --once --budget 0 || true
  [ "$(count 'keychain delete')" -ge 1 ] || fail "rejected saved key kept"
  grep -q 'revoked or expired' "$FAKE/signin-out" || fail "rejected key not explained"
  [ "$(count 'device start')" = 2 ] || fail "no new sign-in after a rejected key"
  rm -f "$FAKE/reject-key"
  # Denied in the browser: nothing saved, a plain message, a failing exit.
  rm -f "$FAKE/keychain" "$FAKE/polls"; touch "$FAKE/device-deny"
  if in_tty --once --budget 0; then fail "ran after a denied sign-in"; fi
  grep -q 'denied in the browser' "$FAKE/signin-out" || fail "denial not explained"
  [ ! -s "$FAKE/keychain" ] || fail "key saved after a denial"
  rm -f "$FAKE/device-deny"
  # A Spooky without sign-in: ask for a key instead.
  touch "$FAKE/no-device"
  in_tty --once --budget 0 || true
  grep -q 'Paste your Spooky key' "$FAKE/signin-out" || fail "no key prompt without sign-in"
  rm -f "$FAKE/no-device"
  # Sign out removes the saved key.
  printf 'sp_DEVICEkey-SECRET-777\n' > "$FAKE/keychain"
  sh "$here/spooky-fixer.sh" --sign-out > /dev/null || fail "sign-out failed"
  [ ! -s "$FAKE/keychain" ] || fail "sign-out kept the key"
  # --sign-in, with no terminal (an agent runs it for its human): shows the code, saves the
  # key, prints no key, ignores a key in the environment, and does nothing when already signed in.
  rm -f "$FAKE/polls"; starts=$(count 'device start')
  SPOOKY_API_KEY=sp_ENVkey123 sh "$here/spooky-fixer.sh" --sign-in < /dev/null >> "$FAKE/signin-out" 2>&1 || fail "--sign-in failed"
  grep -qx 'sp_DEVICEkey-SECRET-777' "$FAKE/keychain" || fail "--sign-in did not save the key"
  [ "$(count 'device start')" = $((starts + 1)) ] || fail "--sign-in did not start a sign-in"
  sh "$here/spooky-fixer.sh" --sign-in < /dev/null > "$FAKE/si2" 2>&1 || fail "second --sign-in failed"
  grep -q 'Already signed in' "$FAKE/si2" || fail "--sign-in signed in twice"
  [ "$(count 'device start')" = $((starts + 1)) ] || fail "--sign-in started a second sign-in"
  rm -f "$FAKE/si2"
  [ "$(count 'KEY IN ARGV')" = 0 ] || fail "a key or device code in a process argument"
  if grep -rlE "sp_DEVICEkey|dc-SECRET" "$FAKE/signin-out" "$FAKE/out" "$HOME/.local/state"; then fail "sign-in secret written"; fi
else
  echo "skipped sign-in tests: no script(1)"
fi

# No key, push topic, ping link or sp_ key in any output, log, run log or state file.
[ "$(count 'bad auth')" = 0 ] || fail "key not sent on stdin"
[ "$(count 'KEY IN ARGV')" = 0 ] || fail "key in a process argument"
if grep -rlE "k3y-SECRET|topic-SECRET|sp_abcdefgh|/api/ping/tok123" "$FAKE/out" "$HOME/.local/state" "$FAKE/calls"; then fail "a secret was written"; fi
grep -rq '\[redacted\]' "$HOME/.local/state/spooky/fixer-runs" || fail "run log not redacted"

# --- Setup: list repos from Spooky, clone into the fixer folder, write fixer.conf ---------

SF="$HOME/spooky-fixer"
setup() { sh "$here/spooky-fixer.sh" --setup "$@" >> "$FAKE/setup-out" 2>&1; }
cat > "$FAKE/projects.json" <<'EOF'
{"projects":[
 {"name":"owner/app3","kind":"repo","host":null,"status":"active","private":false},
 {"name":"owner/private-app4","kind":"repo","host":null,"status":"live","private":true},
 {"name":"owner/old","kind":"repo","host":null,"status":"archived","private":false},
 {"name":"team/site","kind":"host","host":"Vercel","status":"live","private":null},
 {"name":"owner/kept","kind":"repo","host":null,"status":"active","private":false},
 {"name":"owner/../../escape","kind":"repo","host":null,"status":"active","private":false},
 {"name":"../escape2","kind":"repo","host":null,"status":"active","private":false},
 {"name":"other/app3","kind":"repo","host":null,"status":"active","private":false}
],"totals":{"projects":8}}
EOF
mkdir -p "$SF/unrelated"
echo "mine" > "$SF/unrelated/note.txt"
git init -q "$SF/kept"
git -C "$SF/kept" remote add origin https://github.com/owner/kept.git
echo "my work" > "$SF/kept/mine.txt"
printf '# my notes\nmine/x=/somewhere\n' > "$SF/fixer.conf"
touch "$FAKE/gh-signed-in"
: > "$FAKE/calls"

# With gh signed in and --yes: clones every repo that is not archived, with gh and a blobless
# clone, only into the fixer folder. A folder already holding the repo is kept as it is.
setup --yes || fail "setup failed: $(tail -n 3 "$FAKE/setup-out")"
[ "$(count projects)" = 1 ] || fail "setup did not read the project list"
grep -q "^gh clone owner/app3 $SF/app3 .*--filter=blob:none" "$FAKE/calls" || fail "app3 not cloned with gh"
grep -q "^gh clone owner/private-app4 $SF/private-app4 " "$FAKE/calls" || fail "private repo not cloned with gh"
grep -q "^gh clone other/app3 $SF/other-app3 " "$FAKE/calls" || fail "same repo name not given its own folder"
[ "$(grep -c '^gh clone' "$FAKE/calls")" = 3 ] || fail "expected three clones"
if grep -Eq 'owner/old|team/site|escape|clone owner/kept' "$FAKE/calls"; then fail "cloned an archived, host-only, unsafe or existing repo"; fi
[ "$(cat "$SF/kept/mine.txt")" = "my work" ] || fail "an existing clone was changed"
[ "$(cat "$SF/unrelated/note.txt")" = "mine" ] || fail "another folder was changed"
entries=$(find "$SF" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' ')
[ "$entries" = "app3 fixer.conf kept other-app3 private-app4 spooky-fixer.sh unrelated " ] || fail "setup wrote outside its folders: $entries"
[ ! -e "$HOME/escape" ] && [ ! -e "$HOME/escape2" ] || fail "a clone escaped the fixer folder"
grep -qx '# my notes' "$SF/fixer.conf" || fail "conf lost a comment"
grep -qx 'mine/x=/somewhere' "$SF/fixer.conf" || fail "conf lost a line the user added"
for line in "owner/app3=$SF/app3" "owner/private-app4=$SF/private-app4" "owner/kept=$SF/kept" "other/app3=$SF/other-app3"; do
  grep -qxF "$line" "$SF/fixer.conf" || fail "conf missing $line"
done
if grep -q 'owner/old' "$SF/fixer.conf"; then fail "archived repo in conf"; fi
[ -x "$SF/spooky-fixer.sh" ] || fail "fixer not copied next to the clones"
grep -qF -- "sh '$SF/spooky-fixer.sh' --agent claude --config '$SF/fixer.conf'" "$FAKE/setup-out" || fail "start line not printed"

# A second run changes nothing, and reads the list with python3 when jq is missing or broken.
cp "$SF/fixer.conf" "$FAKE/conf.first"
printf '#!/bin/sh\nexit 3\n' > "$HOME/bin/jq"
chmod +x "$HOME/bin/jq"
(ANTHROPIC_API_KEY=stray-key; export ANTHROPIC_API_KEY; setup --yes) || fail "second setup failed"
grep -q 'ANTHROPIC_API_KEY is set in this shell' "$FAKE/setup-out" || fail "no warning for ANTHROPIC_API_KEY"
rm -f "$HOME/bin/jq"
cmp "$SF/fixer.conf" "$FAKE/conf.first" || fail "second setup changed the conf"
[ "$(grep -c '^gh clone' "$FAKE/calls")" = 3 ] || fail "second setup cloned again"

# Without gh: plain git clone over https. Numbers typed at the prompt are left out. A private
# repo that git cannot reach is skipped with a plain hint, and left out of the conf.
rm -f "$FAKE/gh-signed-in"
printf '1\n' | setup --dir "$HOME/sf2" || fail "setup with deselect failed"
grep -q "^git clone https://github.com/owner/kept $HOME/sf2/kept$" "$FAKE/calls" || fail "git clone not used without gh"
if grep -q "clone https://github.com/owner/app3 " "$FAKE/calls"; then fail "cloned a repo the user left out"; fi
grep -q 'gh auth login' "$FAKE/setup-out" || fail "no hint for a private repo without gh"
if grep -q 'private-app4' "$HOME/sf2/fixer.conf"; then fail "failed clone written to conf"; fi
if grep -q '^owner/app3=' "$HOME/sf2/fixer.conf"; then fail "left-out repo written to conf"; fi
grep -qxF "other/app3=$HOME/sf2/app3" "$HOME/sf2/fixer.conf" || fail "kept repo missing from conf"

# Agent: codex when claude is missing; a plain stop, with nothing cloned, when neither is there.
mkdir -p "$HOME/bin-codex" "$HOME/bin-none"
for t in curl gh git pbpaste security open codex; do ln -s "$HOME/bin/$t" "$HOME/bin-codex/$t"; done
for t in curl gh git pbpaste security open; do ln -s "$HOME/bin/$t" "$HOME/bin-none/$t"; done
(PATH="$HOME/bin-codex:/usr/bin:/bin"; setup --yes --dir "$HOME/sf3") || fail "setup with codex failed"
grep -qF -- "--agent codex --config '$HOME/sf3/fixer.conf'" "$FAKE/setup-out" || fail "codex not detected"
if (PATH="$HOME/bin-none:/usr/bin:/bin"; setup --yes --dir "$HOME/sf4"); then fail "setup ran with no agent"; fi
grep -q 'No coding agent found' "$FAKE/setup-out" || fail "no agent message"
[ ! -e "$HOME/sf4" ] || fail "cloned with no agent"

# Key from the clipboard, then --start runs the fixer right away. A clipboard that is not a
# key is refused.
echo "not a key" > "$FAKE/clipboard"
if (unset SPOOKY_API_KEY; setup --yes --key-from-clipboard --dir "$HOME/sf5"); then fail "accepted a clipboard without a key"; fi
[ ! -e "$HOME/sf5" ] || fail "setup ran without a key"
printf 'sp_CLIPsecret0123456789\n' > "$FAKE/clipboard"
(unset SPOOKY_API_KEY; setup --yes --key-from-clipboard --start --once) || fail "setup --start failed"
grep -q 'Starting the fixer now' "$FAKE/setup-out" || fail "--start did not start"
grep -qF -- "sh '$SF/spooky-fixer.sh' --key-from-clipboard --agent claude" "$FAKE/setup-out" || fail "clipboard start line not printed"

# The key is never in any output, file, process argument or conf.
[ "$(count 'bad auth')" = 0 ] || fail "setup key not sent on stdin"
[ "$(count 'KEY IN ARGV')" = 0 ] || fail "setup key in a process argument"
if grep -rlE "k3y-SECRET|sp_CLIPsecret" "$FAKE/setup-out" "$FAKE/calls" "$FAKE/out" "$SF" "$HOME/sf2" "$HOME/sf3" "$HOME/.local/state"; then fail "a key was written"; fi

# Install: --fixer copies the script and writes an example config, and keeps an edited one.
rm -rf "$HOME/.config/spooky"
sh "$here/install.sh" --fixer > /dev/null
[ -x "$HOME/.config/spooky/spooky-fixer.sh" ] || fail "fixer not installed"
grep -q 'owner/repo=' "$HOME/.config/spooky/fixer.conf" || fail "no example config"
echo "mine=/x" > "$HOME/.config/spooky/fixer.conf"
sh "$here/install.sh" --fixer > /dev/null
grep -qx 'mine=/x' "$HOME/.config/spooky/fixer.conf" || fail "install overwrote the config"
[ ! -e "$HOME/.config/spooky/spooky-inbox.sh" ] || fail "--fixer touched the agent inbox"

# Session hook: with no key file, profile line or env key, it uses the key this computer saved
# when it signed in (Keychain first, then the agent-key file), and sends it on stdin.
IB=$(mktemp -d); mkdir -p "$IB/bin" "$IB/home/.config/spooky"
cat > "$IB/bin/curl" <<EOF
#!/bin/sh
case "\$*" in *sp_*) echo "KEY IN ARGV" >> "$IB/log";; esac
cat >> "$IB/log"
echo "Spooky Particles: 0 open problems"
EOF
# shellcheck disable=SC2016
printf '#!/bin/sh\ncase "$*" in "find-generic-password -s spookyparticles.com -a spooky-agent -w") [ -f "%s/kc" ] && cat "%s/kc";; esac\n' "$IB" "$IB" > "$IB/bin/security"
chmod +x "$IB/bin/curl" "$IB/bin/security"
inbox() { (cd "$IB" && env -i HOME="$IB/home" PATH="$IB/bin:/usr/bin:/bin" SPOOKY_PROJECT=o/r sh "$here/spooky-inbox.sh" > /dev/null 2>&1); }
printf 'sp_KEYCHAINsaved1' > "$IB/kc"; inbox
grep -q 'sp_KEYCHAINsaved1' "$IB/log" || fail "inbox did not use the Keychain key"
rm "$IB/kc" "$IB/log"; printf 'sp_FILEsaved2\n' > "$IB/home/.config/spooky/agent-key"; inbox
grep -q 'sp_FILEsaved2' "$IB/log" || fail "inbox did not use the agent-key file"
if grep -q 'KEY IN ARGV' "$IB/log"; then fail "inbox put the key in argv"; fi
rm -rf "$IB"
echo "ok"
