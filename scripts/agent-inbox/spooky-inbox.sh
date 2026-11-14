#!/bin/sh

# Fetches an agent-ready incident summary. Every failure is quiet so a prompt is never blocked.

if [ -z "${HOME:-}" ]; then
  exit 0
fi

# Read the key fresh on every run, so a session started before a key rotation still works:
# the key file first, then the export line in a shell profile, then the inherited environment,
# then the key saved when this computer signed in.
profile_key() {
  for profile in "$HOME/.zshrc" "$HOME/.zshenv" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile"; do
    [ -r "$profile" ] || continue
    line=$(grep -E '^[[:space:]]*export[[:space:]]+SPOOKY_API_KEY=' "$profile" 2>/dev/null | tail -n 1)
    [ -n "$line" ] || continue
    value=${line#*SPOOKY_API_KEY=}
    case "$value" in
      \"*) value=${value#\"}; value=${value%%\"*} ;;
      \'*) value=${value#\'}; value=${value%%\'*} ;;
      *) value=${value%%[[:space:]]*} ;;
    esac
    # Never evaluate a reference like $OTHER or a command; fall through to the environment instead.
    case "$value" in *'$'*|*'`'*|'') continue ;; esac
    printf '%s' "$value"
    return 0
  done
  return 1
}

api_key=
key_file="$HOME/.config/spooky/key"
if [ -r "$key_file" ]; then
  IFS= read -r api_key < "$key_file" || [ -n "$api_key" ] || api_key=
fi
if [ -z "$api_key" ]; then
  api_key=$(profile_key) || api_key=
fi
if [ -z "$api_key" ]; then
  api_key=${SPOOKY_API_KEY:-}
fi
# Last: the key this computer got when it signed in (spooky-fixer.sh --setup).
if [ -z "$api_key" ] && command -v security >/dev/null 2>&1; then
  api_key=$(security find-generic-password -s spookyparticles.com -a spooky-agent -w 2>/dev/null) || api_key=
fi
if [ -z "$api_key" ] && [ -r "${XDG_CONFIG_HOME:-"$HOME/.config"}/spooky/agent-key" ]; then
  IFS= read -r api_key < "${XDG_CONFIG_HOME:-"$HOME/.config"}/spooky/agent-key" || [ -n "$api_key" ] || api_key=
fi
carriage_return=$(printf '\r')
api_key=${api_key%"$carriage_return"}
if [ -z "$api_key" ]; then
  exit 0
fi

project=${SPOOKY_PROJECT:-}
if [ -z "$project" ]; then
  remote=$(git remote get-url origin 2>/dev/null) || remote=
  github_path=
  case "$remote" in
    git@github.com:*) github_path=${remote#git@github.com:} ;;
    ssh://git@github.com/*) github_path=${remote#ssh://git@github.com/} ;;
    https://github.com/*) github_path=${remote#https://github.com/} ;;
    http://github.com/*) github_path=${remote#http://github.com/} ;;
    git://github.com/*) github_path=${remote#git://github.com/} ;;
  esac
  if [ -n "$github_path" ]; then
    github_path=${github_path%/}
    github_path=${github_path%.git}
    repo_name=${github_path##*/}
    owner_path=${github_path%/*}
    owner_name=${owner_path##*/}
    if [ -n "$owner_name" ] && [ -n "$repo_name" ] && [ "$owner_path" != "$github_path" ]; then
      project="$owner_name/$repo_name"
    fi
  elif [ -n "$remote" ]; then
    remote=${remote%/}
    remote=${remote%.git}
    project=${remote##*/}
    project=${project##*:}
  fi
fi
if [ -z "$project" ]; then
  project=$(basename "$PWD" 2>/dev/null) || exit 0
fi

base_url=${SPOOKY_URL:-https://spookyparticles.com}
while [ "${base_url%/}" != "$base_url" ]; do
  base_url=${base_url%/}
done
if [ -z "$base_url" ]; then
  exit 0
fi

# The key goes in on stdin, so it never shows in a process list.
response=$(printf 'Authorization: Bearer %s\n' "$api_key" | curl -sS -m 3 -G \
  -H @- \
  --data-urlencode "project=$project" \
  --data-urlencode "format=text" \
  -w '\n%{http_code}' \
  "$base_url/api/v1/incidents" 2>/dev/null) || exit 0
status=$(printf '%s' "$response" | tail -n 1)
body=$(printf '%s' "$response" | sed '$d')
case "$status" in
  2??) ;;
  401) body="Spooky: the API key was rejected (revoked or expired). Put the new key in ~/.config/spooky/key or ~/.zshrc; the next prompt picks it up." ;;
  *) exit 0 ;;
esac

hash_body() {
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$body" | shasum -a 256 | sed 's/[[:space:]].*$//'
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$body" | sha256sum | sed 's/[[:space:]].*$//'
  elif command -v openssl >/dev/null 2>&1; then
    printf '%s' "$body" | openssl dgst -sha256 | sed 's/^.*= //'
  else
    return 1
  fi
}

body_sha=$(hash_body) || exit 0
cache_root=${XDG_CACHE_HOME:-"$HOME/.cache"}
cache_dir="$cache_root/spooky"
safe_project=$(printf '%s' "$project" | sed 's/[^A-Za-z0-9._-]/_/g') || exit 0
if [ -z "$safe_project" ]; then
  safe_project=project
fi
cache_file="$cache_dir/inbox-$safe_project"
umask 077
mkdir -p "$cache_dir" 2>/dev/null || exit 0

previous_sha=
if [ -r "$cache_file" ]; then
  IFS= read -r previous_sha < "$cache_file" || previous_sha=
fi
if [ "${1:-start}" = "prompt" ] && [ "$previous_sha" = "$body_sha" ]; then
  exit 0
fi

state_tmp="$cache_file.tmp.$$"
printf '%s\n' "$body_sha" > "$state_tmp" 2>/dev/null || exit 0
mv "$state_tmp" "$cache_file" 2>/dev/null || exit 0

if [ "${1:-start}" = "cursor" ]; then
  # Cursor sessionStart hooks must print JSON; "additional_context" is added to the session.
  if [ -n "$body" ]; then
    escaped=$(printf '%s' "$body" | tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/	/\\t/g' | awk 'BEGIN { ORS = "\\n" } { print }')
    printf '{"additional_context":"%s"}\n' "$escaped"
  fi
  exit 0
fi

if [ -n "$body" ]; then
  printf '%s\n' "$body"
fi
exit 0
