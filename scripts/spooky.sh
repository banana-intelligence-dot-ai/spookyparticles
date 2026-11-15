#!/bin/sh

# One safe entry point for a coding agent. Keys stay in memory and reach curl on stdin only.

here=$(CDPATH='' cd "$(dirname "$0")" && pwd)
base_url=${SPOOKY_URL:-https://spookyparticles.com}
while [ "${base_url%/}" != "$base_url" ]; do base_url=${base_url%/}; done

usage() {
  cat <<'EOF'
Usage: sh scripts/spooky.sh COMMAND

Commands:
  start [--sign-in-again]  Sign in if needed, then wait for GitHub and Vercel
  status                   Show setup status
  problems                 Show the incidents inbox
  alerts [ARGS...]         Install agent alerts
  fixer [ARGS...]          Set up the automatic fixer
  help                     Show this help
EOF
}

key_file() {
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then
    printf '%s/spooky/agent-key' "$XDG_CONFIG_HOME"
  elif [ -n "${HOME:-}" ]; then
    printf '%s/.config/spooky/agent-key' "$HOME"
  fi
}

load_saved_key() {
  saved_key=
  if command -v security >/dev/null 2>&1; then
    saved_key=$(security find-generic-password -s spookyparticles.com -a spooky-agent -w 2>/dev/null) || saved_key=
  fi
  if [ -z "$saved_key" ]; then
    saved_file=$(key_file)
    if [ -n "$saved_file" ] && [ -r "$saved_file" ]; then
      IFS= read -r saved_key < "$saved_file" || [ -n "$saved_key" ] || saved_key=
    fi
  fi
  carriage_return=$(printf '\r')
  saved_key=${saved_key%"$carriage_return"}
  [ -n "$saved_key" ] || return 1
  printf '%s' "$saved_key"
}

load_key() {
  if [ -n "${SPOOKY_API_KEY:-}" ]; then
    printf '%s' "$SPOOKY_API_KEY"
    return 0
  fi
  load_saved_key
}

need_key() {
  key=$(load_key) || key=
  if [ -z "$key" ]; then
    printf 'Not signed in. Run: sh scripts/spooky.sh start\n' >&2
    exit 1
  fi
}

authorized_get() {
  printf 'Authorization: Bearer %s\n' "$key" | curl -fsS -H @- "$1"
}

verify_key() {
  me_status=$(printf 'Authorization: Bearer %s\n' "$key" | curl -fsS -o /dev/null -w '%{http_code}' -H @- "$base_url/api/v1/me" 2>/dev/null)
  case "$me_status" in
    200) return 0 ;;
    401) printf 'The key was revoked or is wrong. Run: sh scripts/spooky.sh start --sign-in-again\n' >&2 ;;
    403) printf 'The key lacks read scope. Use a Read key or run: sh scripts/spooky.sh start --sign-in-again\n' >&2 ;;
    ''|000) printf 'Spooky could not be reached at %s.\n' "$base_url" >&2 ;;
    *) printf 'Spooky returned HTTP %s while checking this key.\n' "$me_status" >&2 ;;
  esac
  exit 1
}

setup_text() {
  authorized_get "$base_url/api/v1/setup?format=text"
}

status_field() {
  printf '%s' "$1" | sed -n "s/.*\"$2\":[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

start() {
  sign_in_again=false
  # SPOOKY_SIGN_IN_AGAIN=1 in the environment does the same as the flag, so a person can try
  # setup from scratch on a machine that already has a saved key, without telling the agent.
  if [ "${SPOOKY_SIGN_IN_AGAIN:-}" = 1 ]; then sign_in_again=true; fi
  if [ "${1:-}" = "--sign-in-again" ]; then sign_in_again=true; shift; fi
  if [ $# -gt 0 ]; then usage >&2; exit 2; fi

  key=$(load_key) || key=
  if [ "$sign_in_again" = true ] || [ -z "$key" ]; then
    if [ "$sign_in_again" = true ]; then
      SPOOKY_SIGN_IN_AGAIN=1 sh "$here/agent-inbox/spooky-fixer.sh" --sign-in || exit $?
      key=$(load_saved_key) || key=
    else
      sh "$here/agent-inbox/spooky-fixer.sh" --sign-in || exit $?
      key=$(load_key) || key=
    fi
  fi
  if [ -z "$key" ]; then
    printf 'Sign-in finished, but its key could not be loaded. Run start again.\n' >&2
    exit 1
  fi
  verify_key

  attempt=0
  last_text=
  last_json=
  while [ "$attempt" -lt 90 ]; do
    attempt=$((attempt + 1))
    if current_json=$(authorized_get "$base_url/api/v1/setup" 2>/dev/null); then
      # The text costs a second read, so fetch it only when the status changed.
      if [ "$current_json" != "$last_json" ]; then
        current_text=$(setup_text 2>/dev/null) || current_text=
        if [ -n "$current_text" ] && [ "$current_text" != "$last_text" ]; then
          printf '%s\n' "$current_text"
          last_text=$current_text
        fi
      fi
      last_json=$current_json
      if printf '%s' "$last_json" | grep -q '"ready":[[:space:]]*true'; then
        if [ -z "$last_text" ]; then setup_text || exit 1; fi
        authorized_get "$base_url/api/v1/incidents?format=text"
        return 0
      fi
    else
      printf 'Spooky did not answer this setup check. Trying again.\n' >&2
    fi
    if [ "$attempt" -lt 90 ]; then
      printf 'Waiting for GitHub and Vercel, check %s of 90.\n' "$attempt"
      sleep 10
    fi
  done

  github=$(status_field "$last_json" github)
  vercel=$(status_field "$last_json" vercel)
  [ -n "$github" ] || github=unknown
  [ -n "$vercel" ] || vercel=unknown
  printf 'Timed out after 15 minutes. GitHub is %s; Vercel is %s.\n' "$github" "$vercel" >&2
  return 3
}

command=${1:-help}
[ $# -eq 0 ] || shift
case "$command" in
  start) start "$@" ;;
  status)
    [ $# -eq 0 ] || { usage >&2; exit 2; }
    need_key
    setup_text
    ;;
  problems)
    [ $# -eq 0 ] || { usage >&2; exit 2; }
    need_key
    authorized_get "$base_url/api/v1/incidents?format=text"
    ;;
  alerts)
    need_key
    (SPOOKY_API_KEY=$key; export SPOOKY_API_KEY; exec sh "$here/agent-inbox/install.sh" "$@")
    ;;
  fixer)
    need_key
    (SPOOKY_API_KEY=$key; export SPOOKY_API_KEY; sh "$here/agent-inbox/spooky-fixer.sh" --setup --yes "$@") || exit $?
    printf 'Hand the start line above to your human.\n'
    ;;
  help|-h|--help)
    [ $# -eq 0 ] || { usage >&2; exit 2; }
    usage
    ;;
  *)
    printf 'Unknown command: %s\n' "$command" >&2
    usage >&2
    exit 2
    ;;
esac
