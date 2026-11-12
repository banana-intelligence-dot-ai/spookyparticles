#!/bin/sh

# Fetches an agent-ready incident summary. Every failure is quiet so a prompt is never blocked.

if [ -z "${HOME:-}" ]; then
  exit 0
fi

api_key=${SPOOKY_API_KEY:-}
if [ -z "$api_key" ]; then
  key_file="$HOME/.config/spooky/key"
  if [ ! -r "$key_file" ]; then
    exit 0
  fi
  api_key=
  IFS= read -r api_key < "$key_file" || [ -n "$api_key" ] || exit 0
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
body=$(printf 'Authorization: Bearer %s\n' "$api_key" | curl -fsS -m 3 -G \
  -H @- \
  --data-urlencode "project=$project" \
  --data-urlencode "format=text" \
  "$base_url/api/v1/incidents" 2>/dev/null) || exit 0

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

if [ -n "$body" ]; then
  printf '%s\n' "$body"
fi
exit 0
