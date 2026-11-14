#!/bin/sh
# shellcheck disable=SC2329 # the merge functions run through write_merged and show.

# Installs the Spooky agent inbox for Claude Code, Cursor and OpenAI Codex CLI.
# Usage: install.sh [--agent claude|cursor|codex|all] [--dry-run]
#        install.sh --fixer [--dry-run]   (only copies the fixer and writes an example config)
# No key value is ever written to an agent config. MCP entries refer to $SPOOKY_API_KEY by name.

set -u

dry_run=false
agent=auto
fixer=false
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry_run=true ;;
    --fixer) fixer=true ;;
    --agent)
      [ $# -ge 2 ] || { printf 'Usage: %s [--agent claude|cursor|codex|all] [--dry-run] | --fixer [--dry-run]\n' "$0" >&2; exit 2; }
      agent=$2
      shift
      ;;
    --agent=*) agent=${1#--agent=} ;;
    *) printf 'Usage: %s [--agent claude|cursor|codex|all] [--dry-run] | --fixer [--dry-run]\n' "$0" >&2; exit 2 ;;
  esac
  shift
done
case "$agent" in
  auto|claude|cursor|codex|all) ;;
  *) printf 'Unknown agent %s. Use claude, cursor, codex or all.\n' "$agent" >&2; exit 2 ;;
esac

if [ -z "${HOME:-}" ]; then
  printf 'HOME is required.\n' >&2
  exit 1
fi

script_dir=$(CDPATH='' cd "$(dirname "$0")" && pwd) || exit 1
source_script="$script_dir/spooky-inbox.sh"
config_dir="$HOME/.config/spooky"
installed_script="$config_dir/spooky-inbox.sh"

mcp_url="https://spookyparticles.com/api/mcp"
begin_marker="<!-- spooky:begin -->"
end_marker="<!-- spooky:end -->"
toml_begin="# spooky:begin"
toml_end="# spooky:end"

# --fixer: copy the fixer and write an example config. Starts nothing, schedules nothing.
if [ "$fixer" = true ]; then
  fixer_source="$script_dir/spooky-fixer.sh"
  fixer_target="$config_dir/spooky-fixer.sh"
  fixer_conf="$config_dir/fixer.conf"
  example_conf() {
    cat <<'EOF'
# Spooky fixer: one line per project, Spooky project name = absolute path to a clean clone.
# A separate clone is best: the fixer skips a repo with uncommitted changes.
# owner/repo=/Users/you/code/repo
EOF
  }
  if [ "$dry_run" = true ]; then
    printf 'Would copy %s to %s.\n' "$fixer_source" "$fixer_target"
    [ -e "$fixer_conf" ] || { printf '# %s\n' "$fixer_conf"; example_conf; }
    exit 0
  fi
  [ -r "$fixer_source" ] || { printf 'Cannot read %s.\n' "$fixer_source" >&2; exit 1; }
  umask 077
  mkdir -p "$config_dir" || exit 1
  cp "$fixer_source" "$fixer_target" || exit 1
  chmod 700 "$fixer_target" || exit 1
  printf 'Installed %s.\n' "$fixer_target"
  if [ -e "$fixer_conf" ]; then
    printf 'Kept your config at %s.\n' "$fixer_conf"
  else
    example_conf > "$fixer_conf" || exit 1
    printf 'Wrote an example config at %s. Add your projects there.\n' "$fixer_conf"
  fi
  printf 'Nothing is running yet. To start it for 12 hours, in a shell that has SPOOKY_API_KEY:\n'
  printf '  sh %s --agent claude\n' "$fixer_target"
  exit 0
fi

want_claude=false
want_cursor=false
want_codex=false
case "$agent" in
  claude) want_claude=true ;;
  cursor) want_cursor=true ;;
  codex) want_codex=true ;;
  all) want_claude=true; want_cursor=true; want_codex=true ;;
  auto)
    [ -d "$HOME/.claude" ] && want_claude=true
    [ -d "$HOME/.cursor" ] && want_cursor=true
    [ -d "$HOME/.codex" ] && want_codex=true
    ;;
esac
if [ "$want_claude" = false ] && [ "$want_cursor" = false ] && [ "$want_codex" = false ]; then
  printf 'No ~/.claude, ~/.cursor or ~/.codex found. Pass --agent claude, cursor, codex or all.\n' >&2
  exit 1
fi

# Short instruction block for agents that cannot take a context-injecting hook (Codex).
instruction_block() {
  cat <<EOF
$begin_marker
## Spooky Particles

Spooky watches this project's Vercel deploys and scheduled jobs through the \`spooky\` MCP server.

- At the start of work, call \`whats_broken\` for this project and tell the user what is open.
- After you deploy a fix, call \`confirm_fix\` with the project. Say it is fixed only when it answers "fixed".
$end_marker
EOF
}

codex_toml_block() {
  cat <<EOF
$toml_begin
[mcp_servers.spooky]
url = "$mcp_url"
bearer_token_env_var = "SPOOKY_API_KEY"
$toml_end
EOF
}

# --- JSON merges (Node) -------------------------------------------------------------------

merge_claude() {
  node - "$1" <<'NODE'
const fs = require("node:fs");

const settingsPath = process.argv[2];
let settings = {};
if (fs.existsSync(settingsPath)) {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
}
if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
  throw new Error("Claude settings must be a JSON object");
}
if (settings.hooks === undefined) settings.hooks = {};
if (!settings.hooks || typeof settings.hooks !== "object" || Array.isArray(settings.hooks)) {
  throw new Error("Claude hooks must be a JSON object");
}

const wanted = [
  ["SessionStart", "sh ~/.config/spooky/spooky-inbox.sh start"],
  ["UserPromptSubmit", "sh ~/.config/spooky/spooky-inbox.sh prompt"],
];
const hasCommand = (value, command) => {
  if (Array.isArray(value)) return value.some((item) => hasCommand(item, command));
  if (!value || typeof value !== "object") return false;
  if (value.type === "command" && value.command === command) return true;
  return Object.values(value).some((item) => hasCommand(item, command));
};

for (const [event, command] of wanted) {
  if (settings.hooks[event] === undefined) settings.hooks[event] = [];
  if (!Array.isArray(settings.hooks[event])) {
    throw new Error(`${event} hooks must be an array`);
  }
  if (!hasCommand(settings.hooks[event], command)) {
    settings.hooks[event].push({ matcher: "", hooks: [{ type: "command", command }] });
  }
}

process.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
NODE
}

# Cursor MCP: remote server, key read from the environment by name.
merge_cursor_mcp() {
  node - "$1" "$mcp_url" <<'NODE'
const fs = require("node:fs");

const [, , file, url] = process.argv;
let config = {};
if (fs.existsSync(file)) {
  config = JSON.parse(fs.readFileSync(file, "utf8"));
}
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error("Cursor mcp.json must be a JSON object");
}
if (config.mcpServers === undefined) config.mcpServers = {};
if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
  throw new Error("Cursor mcpServers must be a JSON object");
}
if (config.mcpServers.spooky === undefined) {
  config.mcpServers.spooky = {
    url,
    headers: { Authorization: "Bearer ${env:SPOOKY_API_KEY}" },
  };
}
process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
NODE
}

# Cursor hooks: sessionStart can add text to the session through additional_context.
merge_cursor_hooks() {
  node - "$1" <<'NODE'
const fs = require("node:fs");

const file = process.argv[2];
let config = {};
if (fs.existsSync(file)) {
  config = JSON.parse(fs.readFileSync(file, "utf8"));
}
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error("Cursor hooks.json must be a JSON object");
}
if (config.version === undefined) config.version = 1;
if (config.hooks === undefined) config.hooks = {};
if (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)) {
  throw new Error("Cursor hooks must be a JSON object");
}
if (config.hooks.sessionStart === undefined) config.hooks.sessionStart = [];
if (!Array.isArray(config.hooks.sessionStart)) {
  throw new Error("Cursor sessionStart hooks must be an array");
}
const command = "sh ~/.config/spooky/spooky-inbox.sh cursor";
if (!config.hooks.sessionStart.some((hook) => hook && hook.command === command)) {
  config.hooks.sessionStart.push({ command });
}
process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
NODE
}

# --- Text-block merges (POSIX) ------------------------------------------------------------

# Prints $1 (a file, maybe missing) with the marked block replaced or appended.
merge_agents_md() {
  file=$1
  if [ -f "$file" ] && grep -qF "$begin_marker" "$file"; then
    block_file="$file.block-spooky.$$"
    instruction_block > "$block_file"
    awk -v b="$begin_marker" -v e="$end_marker" -v bf="$block_file" '
      $0 == b { while ((getline line < bf) > 0) print line; skip = 1; next }
      skip && $0 == e { skip = 0; next }
      !skip { print }
    ' "$file"
    rm -f "$block_file"
  else
    [ -f "$file" ] && { cat "$file"; [ -s "$file" ] && printf '\n'; }
    instruction_block
  fi
}

# Prints the config with the marked TOML block appended only if [mcp_servers.spooky] is absent.
codex_has_spooky() {
  [ -f "$1" ] && grep -Eq '^[[:space:]]*\[mcp_servers\.("?spooky"?)(\.[^]]*)?\][[:space:]]*(#.*)?$' "$1"
}

merge_codex_toml() {
  [ -f "$1" ] && cat "$1"
  if ! codex_has_spooky "$1"; then
    [ -s "$1" ] && printf '\n'
    codex_toml_block
  fi
}

# --- Writing ------------------------------------------------------------------------------

# write_merged <file> <merge function> [args...]: back up, merge to a temp file, then move into place.
write_merged() {
  target=$1
  shift
  backup="$target.bak-spooky"
  if [ -e "$backup" ]; then
    : # Keep the first backup, so a re-run never overwrites the original.
  elif [ -f "$target" ]; then
    cp "$target" "$backup" || return 1
  else
    : > "$backup" || return 1
    [ "${json_backup:-false}" = true ] && printf '{}\n' > "$backup"
  fi
  tmp="$target.tmp-spooky.$$"
  if ! "$@" > "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$target" || { rm -f "$tmp"; return 1; }
  printf 'Saved the previous file at %s.\n' "$backup"
}

show() {
  printf '# %s\n' "$1"
  shift
  "$@"
}

if [ "$dry_run" = true ]; then
  [ "$want_claude" = true ] && show "$HOME/.claude/settings.json" merge_claude "$HOME/.claude/settings.json"
  if [ "$want_cursor" = true ]; then
    show "$HOME/.cursor/mcp.json" merge_cursor_mcp "$HOME/.cursor/mcp.json"
    show "$HOME/.cursor/hooks.json" merge_cursor_hooks "$HOME/.cursor/hooks.json"
  fi
  if [ "$want_codex" = true ]; then
    show "$HOME/.codex/config.toml" merge_codex_toml "$HOME/.codex/config.toml"
    show "$HOME/.codex/AGENTS.md" merge_agents_md "$HOME/.codex/AGENTS.md"
  fi
  exit 0
fi

if [ ! -r "$source_script" ]; then
  printf 'Cannot read %s.\n' "$source_script" >&2
  exit 1
fi

umask 077
mkdir -p "$config_dir" || exit 1
cp "$source_script" "$installed_script" || exit 1
chmod 700 "$installed_script" || exit 1
printf 'Installed %s.\n' "$installed_script"

status=0

if [ "$want_claude" = true ]; then
  mkdir -p "$HOME/.claude" || exit 1
  json_backup=true
  if write_merged "$HOME/.claude/settings.json" merge_claude "$HOME/.claude/settings.json"; then
    printf 'Claude Code: merged SessionStart and UserPromptSubmit hooks into %s/.claude/settings.json.\n' "$HOME"
  else
    printf 'Claude Code: failed, nothing changed.\n' >&2; status=1
  fi
fi

if [ "$want_cursor" = true ]; then
  mkdir -p "$HOME/.cursor" || exit 1
  json_backup=true
  if write_merged "$HOME/.cursor/mcp.json" merge_cursor_mcp "$HOME/.cursor/mcp.json" \
    && write_merged "$HOME/.cursor/hooks.json" merge_cursor_hooks "$HOME/.cursor/hooks.json"; then
    printf 'Cursor: spooky MCP server in %s/.cursor/mcp.json and a sessionStart hook in %s/.cursor/hooks.json.\n' "$HOME" "$HOME"
    printf 'Cursor reads the key from SPOOKY_API_KEY in the environment Cursor starts with.\n'
  else
    printf 'Cursor: failed, check the files above.\n' >&2; status=1
  fi
fi

if [ "$want_codex" = true ]; then
  mkdir -p "$HOME/.codex" || exit 1
  json_backup=false
  if write_merged "$HOME/.codex/config.toml" merge_codex_toml "$HOME/.codex/config.toml" \
    && write_merged "$HOME/.codex/AGENTS.md" merge_agents_md "$HOME/.codex/AGENTS.md"; then
    printf 'Codex: spooky MCP server in %s/.codex/config.toml and a short block in %s/.codex/AGENTS.md.\n' "$HOME" "$HOME"
    printf 'Codex reads the key from SPOOKY_API_KEY in the shell that starts it.\n'
  else
    printf 'Codex: failed, check the files above.\n' >&2; status=1
  fi
fi

printf 'Not signed in yet? Run: sh scripts/agent-inbox/spooky-fixer.sh --sign-in\n'
exit $status
