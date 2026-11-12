#!/bin/sh

set -u

dry_run=false
case "${1:-}" in
  "") ;;
  --dry-run) dry_run=true ;;
  *) printf 'Usage: %s [--dry-run]\n' "$0" >&2; exit 2 ;;
esac

if [ -z "${HOME:-}" ]; then
  printf 'HOME is required.\n' >&2
  exit 1
fi

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd) || exit 1
source_script="$script_dir/spooky-inbox.sh"
config_dir="$HOME/.config/spooky"
installed_script="$config_dir/spooky-inbox.sh"
claude_dir="$HOME/.claude"
settings_file="$claude_dir/settings.json"
backup_file="$claude_dir/settings.json.bak-spooky"

merge_settings() {
  node - "$settings_file" <<'NODE'
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

if [ "$dry_run" = true ]; then
  merge_settings
  exit $?
fi

if [ ! -r "$source_script" ]; then
  printf 'Cannot read %s.\n' "$source_script" >&2
  exit 1
fi

umask 077
mkdir -p "$config_dir" "$claude_dir" || exit 1
cp "$source_script" "$installed_script" || exit 1
chmod 700 "$installed_script" || exit 1

if [ -f "$settings_file" ]; then
  cp "$settings_file" "$backup_file" || exit 1
else
  printf '{}\n' > "$backup_file" || exit 1
fi

settings_tmp="$settings_file.tmp-spooky.$$"
trap 'rm -f "$settings_tmp"' 0 HUP INT TERM
merge_settings > "$settings_tmp" || exit 1
mv "$settings_tmp" "$settings_file" || exit 1
trap - 0 HUP INT TERM

printf 'Installed %s.\n' "$installed_script"
printf 'Merged SessionStart and UserPromptSubmit hooks into %s without duplicates.\n' "$settings_file"
printf 'Saved the previous settings at %s.\n' "$backup_file"
printf 'Put a read-only key in ~/.config/spooky/key, then run: chmod 600 ~/.config/spooky/key\n'
