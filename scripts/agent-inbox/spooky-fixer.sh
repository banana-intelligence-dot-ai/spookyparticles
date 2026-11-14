#!/bin/sh

# Spooky fixer: when no coding session is open, start one.
# Polls Spooky for open problems in the projects you map to local repos. For a new problem
# that nobody has claimed, it claims it, runs your own agent headless in that repo, then asks
# Spooky to check production. Opt-in, runs on your machine, uses your agent subscription.
#
# One-time setup, then start. It signs this computer in first: you approve a code in your
# browser, and the key it gets is saved in the macOS Keychain.
#   sh spooky-fixer.sh --setup --start
# Setup lists your GitHub repos from Spooky, clones the ones you keep into ~/spooky-fixer
# (or --dir), writes ~/spooky-fixer/fixer.conf, finds claude or codex, and prints the start line.
#
# Sign in only (an agent can run this for its human; the key is saved, never printed):
#   sh spooky-fixer.sh --sign-in
#
# Usage: spooky-fixer.sh [--setup [--yes] [--dir DIR] [--start]] [--key-from-clipboard] [--sign-in] [--sign-out]
#                        [--agent claude|codex] [--model NAME] [--use-api-key]
#                        [--config FILE] [--interval SECONDS]
#                        [--hours N | --until 2026-11-13T06:00:00Z] [--budget N] [--timeout SECONDS] [--max-turns N] [--once]
#
# Config (default ~/spooky-fixer/fixer.conf, else ~/.config/spooky/fixer.conf), one line per project:
#   owner/repo=/absolute/path/to/your/clone
#
# The key comes from SPOOKY_API_KEY, the clipboard (--key-from-clipboard), or this computer's
# sign-in (saved in the macOS Keychain; --sign-out removes it). It goes to curl on stdin and
# is never printed or logged.
# Optional phone push: set SPOOKY_NTFY_TOPIC (off by default).

set -u

usage() {
  cat >&2 <<'EOF2'
Usage: spooky-fixer.sh [--setup [--yes] [--dir DIR] [--start]] [--key-from-clipboard] [--sign-in] [--sign-out]
                       [--agent claude|codex] [--model NAME] [--use-api-key]
                       [--config FILE] [--interval SECONDS]
                       [--hours N | --until 2026-11-13T06:00:00Z] [--budget N] [--timeout SECONDS] [--max-turns N] [--once]
EOF2
  exit 2
}

agent=
model=${SPOOKY_FIXER_MODEL:-}
use_api_key=false
config=${SPOOKY_FIXER_CONFIG:-}
fixer_dir=${SPOOKY_FIXER_DIR:-"$HOME/spooky-fixer"}
interval=300
hours=12
until_iso=
budget=10
run_timeout=1800
max_turns=60
once=false
setup=false
start=false
assume_yes=false
key_from_clipboard=false
sign_out=false
sign_in_only=false

need() { [ $# -ge 2 ] || usage; }
while [ $# -gt 0 ]; do
  case "$1" in
    --agent) need "$@"; agent=$2; shift ;;
    --model) need "$@"; model=$2; shift ;;
    --use-api-key) use_api_key=true ;;
    --config) need "$@"; config=$2; shift ;;
    --interval) need "$@"; interval=$2; shift ;;
    --hours) need "$@"; hours=$2; shift ;;
    --until) need "$@"; until_iso=$2; shift ;;
    --budget) need "$@"; budget=$2; shift ;;
    --timeout) need "$@"; run_timeout=$2; shift ;;
    --max-turns) need "$@"; max_turns=$2; shift ;;
    --dir) need "$@"; fixer_dir=$2; shift ;;
    --once) once=true ;;
    --setup) setup=true ;;
    --start) start=true ;;
    --yes) assume_yes=true ;;
    --key-from-clipboard) key_from_clipboard=true ;;
    --sign-out) sign_out=true ;;
    --sign-in) sign_in_only=true ;;
    -h|--help) usage ;;
    *) printf 'Unknown option %s\n' "$1" >&2; usage ;;
  esac
  shift
done

case "$agent" in ''|claude|codex) ;; *) printf 'Use --agent claude or --agent codex.\n' >&2; exit 2 ;; esac
for n in "$interval" "$hours" "$budget" "$run_timeout" "$max_turns"; do
  case "$n" in ''|*[!0-9]*) printf 'Numbers only for --interval, --hours, --budget, --timeout and --max-turns.\n' >&2; exit 2 ;; esac
done
if [ "$start" = true ] && [ "$setup" = false ]; then
  printf 'Use --start together with --setup. To start without setup, leave --start out.\n' >&2
  exit 2
fi
case "$fixer_dir" in /*) ;; *) fixer_dir="$(pwd)/$fixer_dir" ;; esac
while [ "${fixer_dir%/}" != "$fixer_dir" ]; do fixer_dir=${fixer_dir%/}; done

# The key stays in memory: read from the clipboard on a pipe, never echoed, never saved.
if [ "$key_from_clipboard" = true ]; then
  command -v pbpaste >/dev/null 2>&1 || { printf 'The clipboard flag needs macOS. Set SPOOKY_API_KEY in this shell instead.\n' >&2; exit 1; }
  SPOOKY_API_KEY=$(pbpaste 2>/dev/null | tr -d ' \t\r\n')
  case "$SPOOKY_API_KEY" in
    sp_?*) ;;
    *) SPOOKY_API_KEY=; printf 'The clipboard does not hold a Spooky key (they start with sp_). Copy the key from Connections and run this again.\n' >&2; exit 1 ;;
  esac
  export SPOOKY_API_KEY
fi
base_url=${SPOOKY_URL:-https://spookyparticles.com}
while [ "${base_url%/}" != "$base_url" ]; do base_url=${base_url%/}; done

# --- The agent's key ------------------------------------------------------------------------
# Order: SPOOKY_API_KEY, the clipboard flag, the key this computer saved at sign-in, then (in a
# terminal) sign-in: Spooky shows a code, you approve it in your browser, and this computer gets
# its own named read key. It is saved in the macOS Keychain (elsewhere: a file only you can
# read, ~/.config/spooky/agent-key). It goes to curl on stdin and is never printed or logged.
key_service=spookyparticles.com
key_account=spooky-agent
key_file=${XDG_CONFIG_HOME:-"$HOME/.config"}/spooky/agent-key

load_key() {
  if command -v security >/dev/null 2>&1; then
    security find-generic-password -s "$key_service" -a "$key_account" -w 2>/dev/null
  elif [ -r "$key_file" ]; then
    cat "$key_file"
  fi
}

store_key() {
  if command -v security >/dev/null 2>&1; then
    # security -i reads its command on stdin, so the key never appears in a process list.
    printf 'add-generic-password -U -s %s -a %s -l "Spooky Particles agent key" -w %s\n' \
      "$key_service" "$key_account" "$1" | security -i >/dev/null 2>&1
  else
    (umask 077; mkdir -p "$(dirname "$key_file")" && printf '%s\n' "$1" > "$key_file")
  fi
}

forget_key() {
  if command -v security >/dev/null 2>&1; then
    security delete-generic-password -s "$key_service" -a "$key_account" >/dev/null 2>&1
  fi
  rm -f "$key_file"
}

# json_get <field>: one top-level string or number from JSON on stdin.
json_get() {
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "$1" '.[$k] // empty' 2>/dev/null
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json, sys
try:
    v = json.load(sys.stdin).get(sys.argv[1])
except Exception:
    v = None
print("" if v is None else v)' "$1" 2>/dev/null
  else
    sed -n "s/.*\"$1\" *: *\"\{0,1\}\([^\",}]*\).*/\1/p" | head -n 1
  fi
}

key_ok() {
  printf 'Authorization: Bearer %s\n' "$1" | curl -fsS -m 30 -o /dev/null -H @- -H "User-Agent: spooky-fixer" "$base_url/api/v1/me" 2>/dev/null
}

# Prints the new key on stdout. Returns 2 when this Spooky has no sign-in, 1 on any other failure.
sign_in() {
  if [ "$agent" = codex ] || { [ -z "$agent" ] && ! command -v claude >/dev/null 2>&1 && command -v codex >/dev/null 2>&1; }; then
    si_client=codex
  else
    si_client=claude-code
  fi
  si_machine=$( (scutil --get ComputerName || hostname) 2>/dev/null | head -n 1 | tr -cd 'A-Za-z0-9 ._-' | cut -c1-60)
  [ -n "$si_machine" ] || si_machine=computer
  si_start=$(printf '{"client":"%s","machine":"%s"}' "$si_client" "$si_machine" \
    | curl -fsS -m 30 -X POST -H 'Content-Type: application/json' -d @- "$base_url/api/v1/device/start" 2>/dev/null) || return 2
  si_code=$(printf '%s' "$si_start" | json_get deviceCode)
  si_user=$(printf '%s' "$si_start" | json_get userCode)
  si_url=$(printf '%s' "$si_start" | json_get verificationUriComplete)
  si_wait=$(printf '%s' "$si_start" | json_get interval)
  si_life=$(printf '%s' "$si_start" | json_get expiresIn)
  [ -n "$si_code" ] && [ -n "$si_user" ] && [ -n "$si_url" ] || return 2
  case "$si_wait" in ''|*[!0-9]*) si_wait=5 ;; esac
  case "$si_life" in ''|*[!0-9]*) si_life=600 ;; esac
  {
    printf '\nSign in this computer to Spooky Particles.\n'
    printf '  1. Open %s\n' "$si_url"
    printf '  2. Check the code matches: %s\n' "$si_user"
    printf '  3. Click Approve.\n'
    printf 'Waiting for you (the code works for %s minutes)...\n' "$((si_life / 60))"
  } >&2
  command -v open >/dev/null 2>&1 && open "$si_url" >/dev/null 2>&1
  si_end=$(( $(date -u +%s) + si_life ))
  while [ "$(date -u +%s)" -lt "$si_end" ]; do
    sleep "$si_wait"
    si_resp=$(printf '{"deviceCode":"%s"}' "$si_code" \
      | curl -sS -m 30 -X POST -H 'Content-Type: application/json' -d @- "$base_url/api/v1/device/token" 2>/dev/null) || continue
    si_key=$(printf '%s' "$si_resp" | json_get key)
    case "$si_key" in sp_?*) printf '%s' "$si_key"; return 0 ;; esac
    case "$(printf '%s' "$si_resp" | json_get error)" in
      authorization_pending|'') ;;
      slow_down) si_wait=$((si_wait + 5)) ;;
      access_denied) printf 'Sign-in was denied in the browser. Nothing was shared.\n' >&2; return 1 ;;
      *) printf 'The sign-in code expired. Run this again for a new one.\n' >&2; return 1 ;;
    esac
  done
  printf 'The sign-in code expired. Run this again for a new one.\n' >&2
  return 1
}

if [ "$sign_out" = true ]; then
  forget_key
  printf 'Signed out: the key this computer saved is removed. Revoke it in Spooky under Connections, Agent keys.\n'
  exit 0
fi

case "${SPOOKY_API_KEY:-}" in sp_?*) ;; *) SPOOKY_API_KEY= ;; esac
# --sign-in is about this computer's saved key, not one in the environment.
[ "$sign_in_only" = false ] || SPOOKY_API_KEY=
key_saved=false
if [ -z "$SPOOKY_API_KEY" ]; then
  SPOOKY_API_KEY=$(load_key | tr -d ' \t\r\n')
  case "$SPOOKY_API_KEY" in sp_?*) key_saved=true ;; *) SPOOKY_API_KEY= ;; esac
fi
# A saved key that Spooky no longer accepts (revoked or expired) is dropped, so sign-in runs again.
if [ "$key_saved" = true ] && ! key_ok "$SPOOKY_API_KEY"; then
  forget_key
  SPOOKY_API_KEY=
  key_saved=false
  printf 'The key this computer saved was revoked or expired.\n' >&2
fi
if [ "$sign_in_only" = true ] && [ "$key_saved" = true ]; then
  printf 'Already signed in on this computer.\n'
  exit 0
fi
if [ -z "$SPOOKY_API_KEY" ] && { [ -t 0 ] || [ "$sign_in_only" = true ]; }; then
  si_rc=0
  SPOOKY_API_KEY=$(sign_in) || si_rc=$?
  if [ "$si_rc" = 2 ] && [ "$sign_in_only" = true ]; then
    printf 'This Spooky has no agent sign-in yet. Make a key under Connections instead.\n' >&2
    exit 1
  elif [ "$si_rc" = 2 ]; then
    # This Spooky has no sign-in yet: ask for a key, hidden.
    printf 'Paste your Spooky key (from Connections, Make key, Read). It stays hidden: '
    stty -echo 2>/dev/null; IFS= read -r SPOOKY_API_KEY || SPOOKY_API_KEY=; stty echo 2>/dev/null; printf '\n'
    SPOOKY_API_KEY=$(printf '%s' "$SPOOKY_API_KEY" | tr -d ' \t\r\n')
    case "$SPOOKY_API_KEY" in sp_?*) ;; *) SPOOKY_API_KEY=; printf 'That is not a Spooky key (they start with sp_).\n' >&2; exit 1 ;; esac
  elif [ "$si_rc" != 0 ]; then
    exit 1
  else
    store_key "$SPOOKY_API_KEY" || printf 'Signed in, but the key could not be saved, so you will sign in again next time.\n' >&2
    key_saved=true
    printf 'Signed in. This computer has its own key now; you can revoke it in Spooky under Connections.\n' >&2
  fi
fi
if [ -z "$SPOOKY_API_KEY" ]; then
  printf 'Not signed in. Run this in a terminal to sign in, or set SPOOKY_API_KEY.\n' >&2
  exit 1
fi
[ "$sign_in_only" = false ] || exit 0
export SPOOKY_API_KEY

# Claude Code first, then Codex. Stops with one line when neither is installed.
detect_agent() {
  if command -v claude >/dev/null 2>&1; then agent=claude
  elif command -v codex >/dev/null 2>&1; then agent=codex
  else
    printf 'No coding agent found. Install Claude Code (claude.com/claude-code) or Codex CLI (github.com/openai/codex), then run this again.\n' >&2
    exit 1
  fi
}

# --- Setup: list repos, clone into the fixer folder, write fixer.conf ---------------------

# Reads the /api/v1/projects JSON on stdin. Prints "owner/repo<TAB>private|public" for every
# GitHub repo that is not archived. Uses jq, else python3.
parse_projects() {
  json=$(cat)
  if command -v jq >/dev/null 2>&1 && rows=$(printf '%s' "$json" | jq -r '
      .projects[]? | select(type == "object")
      | select(.kind == "repo" or (.kind == null and .host == null))
      | select(.status != "archived") | select(.name | type == "string")
      | [.name, (if .private == true then "private" else "public" end)] | @tsv' 2>/dev/null); then
    [ -z "$rows" ] || printf '%s\n' "$rows"
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$json" | python3 -I -c '
import json, sys
for p in (json.load(sys.stdin).get("projects") or []):
    if not isinstance(p, dict) or not isinstance(p.get("name"), str): continue
    kind = p.get("kind")
    if kind != "repo" and not (kind is None and p.get("host") is None): continue
    if p.get("status") == "archived": continue
    print(p["name"] + "\t" + ("private" if p.get("private") is True else "public"))
' 2>/dev/null
    return $?
  fi
  return 1
}

# A GitHub name we can safely turn into one folder: owner/repo, plain characters, no dots-only
# parts and no leading dash, so a clone can never land outside the fixer folder.
safe_name() {
  case "$1" in */*/*|*[!A-Za-z0-9._/-]*) return 1 ;; */?*) ;; *) return 1 ;; esac
  case "${1%%/*}" in ''|.|..|-*) return 1 ;; esac
  case "${1#*/}" in ''|.|..|-*) return 1 ;; esac
  return 0
}

# Is <dir> already a clone of <owner/repo>?
same_repo() {
  url=$(git -C "$1" remote get-url origin 2>/dev/null) || return 1
  url=$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')
  want=$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')
  case "$url" in
    *"github.com/$want"|*"github.com/$want.git"|*"github.com:$want"|*"github.com:$want.git") return 0 ;;
  esac
  return 1
}

# Is <owner/repo> already a key in the config file?
in_conf() {
  [ -r "$2" ] || return 1
  awk -v n="$1" '{ k = $0; sub(/=.*/, "", k); gsub(/^[ \t]+|[ \t]+$/, "", k) } k == n { f = 1 } END { exit !f }' "$2"
}

shell_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

run_setup() {
  if [ -n "$agent" ]; then
    command -v "$agent" >/dev/null 2>&1 || { printf '%s is not on PATH.\n' "$agent" >&2; exit 1; }
  else
    detect_agent
  fi
  if [ "$agent" = claude ] && [ -n "${ANTHROPIC_API_KEY:-}" ] && [ "$use_api_key" = false ]; then
    printf 'Note: ANTHROPIC_API_KEY is set in this shell. The fixer ignores it and uses your Claude login instead (add --use-api-key to use the key).\n'
  fi

  if ! json=$(printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -fsS -m 60 -H @- \
      -H "User-Agent: spooky-fixer" "$base_url/api/v1/projects" 2>/dev/null); then
    printf 'Spooky did not answer. Check that the key is a Read key from Connections and is not revoked.\n' >&2
    exit 1
  fi
  if ! all=$(printf '%s' "$json" | parse_projects); then
    printf 'Could not read the project list. Install jq or python3 and run this again.\n' >&2
    exit 1
  fi

  list=
  n=0
  tab=$(printf '\t')
  while IFS="$tab" read -r name vis; do
    [ -n "$name" ] || continue
    if ! safe_name "$name"; then
      printf 'Left out a project with an unusual name.\n'
      continue
    fi
    n=$((n + 1))
    list="$list$name$tab$vis
"
  done <<EOF
$all
EOF
  if [ "$n" = 0 ]; then
    printf 'Spooky lists no GitHub repos for this key yet. Connect GitHub on Connections, then run this again.\n' >&2
    exit 1
  fi

  printf 'Spooky found %s repos. All are picked:\n' "$n"
  i=0
  while IFS="$tab" read -r name vis; do
    [ -n "$name" ] || continue
    i=$((i + 1))
    if [ "$vis" = private ]; then printf '  %s. %s (private)\n' "$i" "$name"; else printf '  %s. %s\n' "$i" "$name"; fi
  done <<EOF
$list
EOF

  skip=" "
  if [ "$assume_yes" = false ]; then
    printf 'To leave some out, type their numbers (like 2 5). Press Enter to keep all: '
    IFS= read -r answer || answer=
    printf '\n'
    set -f
    for w in $(printf '%s' "$answer" | tr ',' ' '); do
      case "$w" in
        *[!0-9]*) printf 'Ignored %s, not a number.\n' "$w" ;;
        *) if [ "$w" -ge 1 ] && [ "$w" -le "$n" ]; then skip="$skip$w "; else printf 'Ignored %s, not on the list.\n' "$w"; fi ;;
      esac
    done
    set +f
  fi

  use_gh=false
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then use_gh=true; fi

  umask 077
  mkdir -p "$fixer_dir" || exit 1
  conf="$fixer_dir/fixer.conf"
  used=" "
  mapped=
  i=0
  while IFS="$tab" read -r name vis; do
    [ -n "$name" ] || continue
    i=$((i + 1))
    case "$skip" in *" $i "*) continue ;; esac
    repo=${name#*/}
    folder=$repo
    case "$used" in *" $folder "*) folder="${name%%/*}-$repo" ;; esac
    used="$used$folder "
    target="$fixer_dir/$folder"

    if in_conf "$name" "$conf"; then
      printf 'Kept your line for %s in fixer.conf.\n' "$name"
      continue
    fi
    if [ -e "$target" ]; then
      if same_repo "$target" "$name"; then
        printf 'Kept %s, already cloned.\n' "$target"
      else
        printf 'Skipped %s: %s already holds something else.\n' "$name" "$target"
        continue
      fi
    else
      printf 'Cloning %s into %s\n' "$name" "$target"
      if [ "$use_gh" = true ]; then
        gh repo clone "$name" "$target" -- --filter=blob:none --quiet
      else
        GIT_TERMINAL_PROMPT=0 git clone --quiet "https://github.com/$name" "$target"
      fi || {
        if [ "$vis" = private ] && [ "$use_gh" = false ]; then
          printf 'Could not clone %s. It is private: run gh auth login, then run this again.\n' "$name"
        else
          printf 'Could not clone %s. Run this again later.\n' "$name"
        fi
        continue
      }
    fi
    mapped="$mapped$name=$target
"
  done <<EOF
$list
EOF

  tmp="$conf.tmp.$$"
  {
    if [ -r "$conf" ]; then
      awk '{ print }' "$conf"
    else
      printf '# Spooky fixer: one line per project, owner/repo=/absolute/path/to/a/clean/clone\n'
    fi
    [ -z "$mapped" ] || printf '%s' "$mapped"
  } > "$tmp" && mv "$tmp" "$conf" || exit 1

  # Keep a copy of the fixer next to the clones, so the start line works from anywhere.
  script="$0"
  if [ -f "$0" ] && [ -r "$0" ]; then
    script="$fixer_dir/spooky-fixer.sh"
    if ! cmp -s "$0" "$script"; then
      cp "$0" "$script.tmp.$$" && chmod 700 "$script.tmp.$$" && mv "$script.tmp.$$" "$script" || exit 1
    fi
  fi

  config=$conf
  start_line="sh $(shell_quote "$script")"
  [ "$key_from_clipboard" = true ] && start_line="$start_line --key-from-clipboard"
  start_line="$start_line --agent $agent"
  [ "$use_api_key" = true ] && start_line="$start_line --use-api-key"
  start_line="$start_line --config $(shell_quote "$conf")"
  printf 'Wrote %s. The fixer uses %s.\n' "$conf" "$agent"
  if [ "$key_saved" = true ]; then
    printf 'To start it later, run:\n'
  elif [ "$key_from_clipboard" = true ]; then
    printf 'To start it later, copy your key again and run:\n'
  else
    printf 'To start it later, in a shell that has SPOOKY_API_KEY, run:\n'
  fi
  printf '  %s\n' "$start_line"
}

if [ "$setup" = true ]; then
  run_setup
  [ "$start" = true ] || exit 0
  if [ -n "$until_iso" ]; then stop_word="until $until_iso"; else stop_word="for $hours hours"; fi
  printf 'Starting the fixer now. It runs %s. Press Ctrl-C to stop it.\n' "$stop_word"
fi

if [ -z "$config" ]; then
  if [ -r "$fixer_dir/fixer.conf" ]; then config="$fixer_dir/fixer.conf"; else config="$HOME/.config/spooky/fixer.conf"; fi
fi
if [ ! -r "$config" ]; then
  printf 'No config at %s. Run this with --setup, or add one line per project: owner/repo=/absolute/path/to/clone\n' "$config" >&2
  exit 1
fi
if [ -n "$agent" ]; then
  command -v "$agent" >/dev/null 2>&1 || { printf '%s is not on PATH.\n' "$agent" >&2; exit 1; }
else
  detect_agent
fi

state_dir=${XDG_STATE_HOME:-"$HOME/.local/state"}/spooky
state_file="$state_dir/fixer.state"
log_file="$state_dir/fixer.log"
runs_dir="$state_dir/fixer-runs"
umask 077
mkdir -p "$runs_dir" || exit 1

# --- Output: everything printed or logged goes through redact -----------------------------

# Removes the key, the push topic, check-in ping links and anything shaped like a Spooky key.
redact() {
  awk '
    function cut(line, s,    i) {
      if (length(s) < 8) return line
      while ((i = index(line, s)) > 0) line = substr(line, 1, i - 1) "[redacted]" substr(line, i + length(s))
      return line
    }
    {
      line = cut($0, ENVIRON["SPOOKY_API_KEY"])
      line = cut(line, ENVIRON["SPOOKY_NTFY_TOPIC"])
      gsub(/\/api\/ping\/[A-Za-z0-9_-]+/, "/api/ping/[redacted]", line)
      gsub(/sp_[A-Za-z0-9_-]+/, "[redacted]", line)
      print line
    }'
}

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | redact | tee -a "$log_file"
}

# Optional phone push. The topic goes to curl on stdin, so it never shows in a process list.
push() {
  [ -n "${SPOOKY_NTFY_TOPIC:-}" ] || return 0
  msg=$(printf '%s' "$1" | redact | cut -c1-900)
  printf 'url = "https://ntfy.sh/%s"\n' "$SPOOKY_NTFY_TOPIC" \
    | curl -fsS -m 15 -K - -H "Title: Spooky fixer" -d "$msg" >/dev/null 2>&1 || log "push failed"
}

# spooky GET|POST <path> <project>: calls Spooky with the key on stdin. Prints the body.
spooky() {
  method=$1
  path=$2
  project=$3
  printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -fsS -m 60 -G -X "$method" \
    -H @- -H "User-Agent: spooky-fixer" \
    --data-urlencode "project=$project" --data-urlencode "format=text" \
    "$base_url$path"
}

# --- State: read first, written last ------------------------------------------------------
# Lines: "day YYYY-MM-DD N" (runs started today) and "done <key> <time> <project>".

today=$(date +%Y-%m-%d)
runs_today=0
load_state() {
  today=$(date +%Y-%m-%d)
  runs_today=0
  [ -r "$state_file" ] || return 0
  line=$(grep "^day $today " "$state_file" 2>/dev/null | tail -n 1)
  [ -n "$line" ] && runs_today=${line##* }
  return 0
}

is_done() { [ -r "$state_file" ] && grep -q "^done $1 " "$state_file"; }

save_state() {
  tmp="$state_file.tmp.$$"
  {
    printf 'day %s %s\n' "$today" "$runs_today"
    [ -r "$state_file" ] && grep '^done ' "$state_file" | tail -n 500
    for k in "$@"; do printf 'done %s %s %s\n' "$k" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$project"; done
  } > "$tmp" && mv "$tmp" "$state_file"
}

# Undo a run that never started work (the agent could not sign in): forget its keys and the run.
unsave_state() {
  tmp="$state_file.tmp.$$"
  {
    printf 'day %s %s\n' "$today" "$runs_today"
    [ -r "$state_file" ] && grep '^done ' "$state_file" | grep -v -F -e "$(printf 'done %s \n' "$@" | sed '/^$/d')" | tail -n 500
  } > "$tmp" && mv "$tmp" "$state_file"
}

# prune_done <project> [open keys...]: forget this project's done marks for problems that are no
# longer open, so a job that recovers and later fails again is a new problem.
prune_done() {
  pd_project=$1; shift
  [ -r "$state_file" ] || return 0
  tmp="$state_file.tmp.$$"
  {
    grep -v '^done ' "$state_file"
    grep '^done ' "$state_file" | awk -v p="$pd_project" -v keep=" $* " '$4 != p || index(keep, " " $2 " ")'
  } > "$tmp" && mv "$tmp" "$state_file"
}

# lessons_for <repo> <project>: the latest lessons from earlier fixes, from the repo's own
# .spooky/lessons.md and from this computer's copy (kept even when a fix was never merged).
lessons_for() {
  lf_local="$state_dir/lessons/$(printf '%s' "$2" | tr -c 'A-Za-z0-9._-' '_').md"
  lf_text=
  [ -r "$1/.spooky/lessons.md" ] && lf_text=$(tail -n 40 "$1/.spooky/lessons.md")
  [ -r "$lf_local" ] && lf_text="$lf_text
$(tail -n 20 "$lf_local")"
  lf_text=$(printf '%s\n' "$lf_text" | awk 'NF && !seen[$0]++')
  [ -n "$lf_text" ] || return 0
  printf '\nLessons from earlier fixes in this repo:\n%s\n' "$lf_text"
}

# save_lesson <project> <run log>: keep the run's "Lesson:" line on this computer, last 60.
save_lesson() {
  sl_line=$(sed -n 's/^Lesson: *//p' "$2" | tail -n 1)
  [ -n "$sl_line" ] || return 0
  mkdir -p "$state_dir/lessons"
  sl_file="$state_dir/lessons/$(printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_').md"
  { [ -r "$sl_file" ] && cat "$sl_file"; printf '%s %s\n' "$(date -u +%Y-%m-%d)" "$sl_line"; } | tail -n 60 > "$sl_file.tmp.$$" && mv "$sl_file.tmp.$$" "$sl_file"
}

hash_text() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 | cut -c1-16
  else sha256sum | cut -c1-16
  fi
}

# Prints "<claimed yes|no><TAB><identity>" per incident block in the inbox text. A failed
# deploy's identity is its first line, When line and Change line: one deploy, one problem. A
# job's is its first line only, because its When line moves with every failed run: a job that
# keeps failing is one problem until it recovers (see prune_done).
incident_rows() {
  awk '
    function flush() { if (key != "") print (claimed ? "yes" : "no") "\t" key; key = ""; claimed = 0; inblock = 0 }
    /^Deploy failed: / { flush(); inblock = 1; isjob = 0; key = $0; next }
    /^Job (failed|went quiet|never checked in): / { flush(); inblock = 1; isjob = 1; key = $0; next }
    inblock && /^$/ { flush(); next }
    inblock && /^(When|Change): / { if (!isjob) key = key " | " $0; next }
    inblock && /^Claimed: / { claimed = 1; next }
    END { flush() }'
}

brief() {
  cat <<'EOF'
You are fixing a production problem in this repository. Spooky Particles found it. You are running headless and nobody is watching, so be careful and small.

1. Read this repo's CLAUDE.md or AGENTS.md first and follow its rules, above all about committing, pushing and deploying. If they say a person must approve a deploy, commit the fix and stop there.
2. Read .spooky/lessons.md if it exists: what earlier fixes in this repo learned. The latest ones are also under the incident. Then find the cause, starting from the incident, then the code, the logs and recent commits.
3. If the cause is clear, make the smallest fix, add or update a test, and run the repo's own tests. If the cause is not clear, or the fix needs secrets, environment variables, DNS, billing, a database schema change or deleting data, change nothing and say why.
4. Deploy only the way the repo's rules allow.
5. Do not run the claim or confirm commands in the incident, and do not try to reach Spooky. The fixer that started you has claimed this problem and asks Spooky to check production as soon as you finish.
6. Add one dated line to .spooky/lessons.md (create it if needed): what broke, the real cause, and what fixed it or why you stopped. Write it for the next agent that fixes this repo. Keep the file under 60 lines by merging repeats. Commit it with your fix; if you changed nothing else, commit it alone only if the repo's rules allow.

Never read or print .env files, keys or tokens. One fix per run.

End with four short lines: what broke, what you did (commit hash or "no change"), whether it is deployed, committed only, or not changed, and "Lesson: " followed by the line you added.

Incident:
EOF
}

claude_tools="Read,Edit,Write,Grep,Glob,Bash(git:*),Bash(npm test:*),Bash(npm run:*),Bash(npx:*),Bash(pnpm:*),Bash(yarn:*),Bash(bun:*),Bash(make:*),Bash(pytest:*),Bash(python3 -m pytest:*),Bash(python -m pytest:*),Bash(python3 -m unittest:*),Bash(python -m unittest:*),Bash(uv run:*),Bash(poetry run:*),Bash(cargo:*),Bash(go:*),Bash(ls:*),Bash(grep:*),Bash(sed:*),Bash(curl:*),Bash(sleep:*)"

# sync_repo <repo>: fetch origin, switch to its default branch and fast-forward it. Fails rather
# than merge or discard: local commits that are not on origin stop the run.
sync_repo() {
  git -C "$1" fetch -q origin 2>/dev/null || return 1
  sr_head=$(git -C "$1" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null) || sr_head=
  if [ -z "$sr_head" ]; then
    git -C "$1" remote set-head origin -a >/dev/null 2>&1 || return 1
    sr_head=$(git -C "$1" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null) || return 1
  fi
  git -C "$1" checkout -q "${sr_head#origin/}" 2>/dev/null || return 1
  git -C "$1" merge -q --ff-only "$sr_head" 2>/dev/null
}

# run_agent <repo> <prompt> <log>: one headless run with a hard timeout. Prints the exit code.
run_agent() {
  repo=$1
  prompt=$2
  out=$3
  status_file="$out.status"
  {
    (
      cd "$repo" || exit 1
      if [ "$agent" = claude ]; then
        # Your Claude login, not a stray ANTHROPIC_API_KEY in the shell, unless --use-api-key.
        if [ "$use_api_key" = true ]; then set -- claude; else set -- env -u ANTHROPIC_API_KEY claude; fi
        set -- "$@" -p "$prompt" --permission-mode acceptEdits --max-turns "$max_turns" \
          --allowedTools "$claude_tools" --disallowedTools "Read(./.env*),Read(**/.env*)"
        [ -n "$model" ] && set -- "$@" --model "$model"
      else
        # workspace-write is Codex's own sandbox: edits stay in this repo. Never bypass it.
        set -- codex exec --sandbox workspace-write -C "$repo"
        [ -n "$model" ] && set -- "$@" -m "$model"
        set -- "$@" "$prompt"
      fi
      # macOS has no timeout(1); perl alarm ends the run after run_timeout seconds.
      perl -e 'alarm shift; exec @ARGV or exit 127' "$run_timeout" "$@" < /dev/null
    )
    printf '%s\n' "$?" > "$status_file"
  } 2>&1 | redact > "$out"
  code=$(cat "$status_file" 2>/dev/null || echo 1)
  rm -f "$status_file"
  printf '%s' "$code"
}

# --- One pass over every mapped project ---------------------------------------------------

check_project() {
  project=$1
  repo=$2
  if ! body=$(spooky GET /api/v1/incidents "$project" 2>&1); then
    log "$project: could not read Spooky ($(printf '%s' "$body" | head -n 1))"
    return 0
  fi
  rows=
  [ -z "$body" ] || rows=$(printf '%s\n' "$body" | incident_rows)
  tab=$(printf '\t')
  open_keys=
  while IFS="$tab" read -r claimed identity; do
    [ -n "$identity" ] || continue
    open_keys="$open_keys $(printf '%s' "$identity" | hash_text)"
  done <<EOF
$rows
EOF
  # shellcheck disable=SC2086
  prune_done "$project" $open_keys
  [ -n "$rows" ] || return 0
  new_keys=
  held=false
  while IFS="$tab" read -r claimed identity; do
    [ -n "$identity" ] || continue
    k=$(printf '%s' "$identity" | hash_text)
    is_done "$k" && continue
    if [ "$claimed" = yes ]; then held=true; continue; fi
    new_keys="$new_keys $k"
  done <<EOF
$rows
EOF
  if [ -z "$new_keys" ]; then
    [ "$held" = true ] && log "$project: open problem is claimed by another session, leaving it to them"
    return 0
  fi

  if [ "$runs_today" -ge "$budget" ]; then
    log "$project: new problem, but today's budget of $budget fix runs is used. Needs a person."
    push "$project is broken. Fix budget of $budget runs is used today, so it needs you."
    # shellcheck disable=SC2086
    save_state $new_keys
    return 0
  fi
  if [ ! -d "$repo/.git" ] && ! git -C "$repo" rev-parse --git-dir >/dev/null 2>&1; then
    log "$project: $repo is not a git repository, skipped"
    return 0
  fi
  if [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
    log "$project: $repo has uncommitted changes, skipped so your work is not mixed in. Use a separate clone for the fixer."
    return 0
  fi
  # Fix today's code, not the clone's: put the repo on its default branch, up to date with origin.
  if git -C "$repo" remote get-url origin >/dev/null 2>&1 && ! sync_repo "$repo"; then
    log "$project: could not bring $repo up to date with origin (offline, or local commits not on origin), skipped. Will try next pass."
    return 0
  fi

  if ! claim=$(spooky POST /api/v1/incidents/claim "$project" 2>&1); then
    log "$project: claim failed ($(printf '%s' "$claim" | head -n 1)), will try next pass"
    return 0
  fi
  case "$claim" in
    Claimed\ *) ;;
    *) log "$project: another session claimed it first, leaving it to them"; return 0 ;;
  esac

  runs_today=$((runs_today + 1))
  # Written before the run, so a crash or timeout never reruns the same problem.
  # shellcheck disable=SC2086
  save_state $new_keys
  run_log="$runs_dir/$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%s' "$project" | tr -c 'A-Za-z0-9._-' '_').log"
  log "$project: claimed, running $agent in $repo (run $runs_today of $budget today)"
  push "$project is broken. Your $agent is fixing it (run $runs_today of $budget today)."

  code=$(run_agent "$repo" "$(brief)
$body$(lessons_for "$repo" "$project")" "$run_log")
  [ "$code" = 0 ] || log "$project: $agent run ended with code $code (142 means it hit the ${run_timeout}s limit)"
  if [ "$code" != 0 ] && grep -q -i -E 'invalid api key|not logged in|please run /login|authentication_error|401 unauthorized' "$run_log"; then
    runs_today=$((runs_today - 1))
    # shellcheck disable=SC2086
    unsave_state $new_keys
    log "$project: $agent could not sign in, so nothing was tried and this does not count. Sign in to $agent (run it once by hand), then start the fixer again."
    push "Spooky fixer stopped: $agent could not sign in."
    exit 3
  fi

  save_lesson "$project" "$run_log"
  if check=$(spooky POST /api/v1/incidents/confirm "$project" 2>&1); then
    verdict=$(printf '%s\n' "$check" | head -n 1 | sed 's/^.*: //')
  else
    verdict="unknown (fix check failed)"
  fi
  case "$verdict" in
    fixed) word="fixed" ;;
    "still broken") word="still broken" ;;
    checking|"waiting on run") word="checking ($verdict)" ;;
    *) word=$verdict ;;
  esac
  log "$project: $word. Run log: $run_log"
  push "$project: $word. $(tail -n 3 "$run_log" | tr '\n' ' ')"
  return 0
}

one_pass() {
  load_state
  while IFS= read -r line <&3 || [ -n "$line" ]; do
    line=$(printf '%s' "$line" | sed 's/[[:space:]]*#.*$//; s/^[[:space:]]*//; s/[[:space:]]*$//')
    case "$line" in ''|*=*) ;; *) log "config: skipped a line without ="; continue ;; esac
    [ -n "$line" ] || continue
    name=${line%%=*}
    path=${line#*=}
    case "$path" in \~/*) path="$HOME/${path#\~/}" ;; esac
    case "$path" in /*) ;; *) log "config: $name needs an absolute path"; continue ;; esac
    [ -d "$path" ] || { log "config: $path does not exist"; continue; }
    check_project "$name" "$path"
  done 3< "$config"
}

# --- Main loop ----------------------------------------------------------------------------

lock="$state_dir/fixer.lock"
if ! mkdir "$lock" 2>/dev/null; then
  old=$(cat "$lock/pid" 2>/dev/null || echo)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    printf 'Another fixer is running (pid %s).\n' "$old" >&2
    exit 1
  fi
  rm -rf "$lock"
  mkdir "$lock" || exit 1
fi
printf '%s\n' "$$" > "$lock/pid"
trap 'rm -rf "$lock"' 0
trap 'exit 130' INT TERM

if [ -n "$until_iso" ]; then
  stop=$(date -j -u -f %Y-%m-%dT%H:%M:%SZ "$until_iso" +%s 2>/dev/null || date -u -d "$until_iso" +%s 2>/dev/null) \
    || { printf 'Use --until like 2026-11-13T06:00:00Z\n' >&2; exit 2; }
else
  stop=$(( $(date -u +%s) + hours * 3600 ))
fi

if [ "$once" = true ]; then
  one_pass
  exit 0
fi
# A wrong or revoked key would fail every pass in silence; say so once and stop.
if ! printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -fsS -m 30 -o /dev/null -H @- -H "User-Agent: spooky-fixer" "$base_url/api/v1/me" 2>/dev/null; then
  printf 'Spooky did not accept that key (wrong, revoked or expired). Start again without SPOOKY_API_KEY set to sign in this computer.\n' >&2
  exit 1
fi
log "fixer start: $agent, every ${interval}s, budget $budget a day"
while [ "$(date -u +%s)" -lt "$stop" ]; do
  one_pass
  sleep "$interval"
done
log "fixer stop: reached the stop time"
