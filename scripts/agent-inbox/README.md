# Agent inbox

## Your coding agent hears about it

Spooky tells Claude Code what is broken at session start. Before later prompts, it speaks only when the open problems changed.

Create a read-only agent key in Spooky Particles and set `SPOOKY_API_KEY` in this shell. From this repository, run these two commands:

```sh
mkdir -p ~/.config/spooky && printf '%s\n' "$SPOOKY_API_KEY" > ~/.config/spooky/key && chmod 600 ~/.config/spooky/key
sh scripts/agent-inbox/install.sh
```

The installer keeps existing Claude Code settings and hooks. It saves `~/.claude/settings.json.bak-spooky` before it writes. Use `sh scripts/agent-inbox/install.sh --dry-run` to see the merged settings without changing files.

Set `SPOOKY_PROJECT` to override the project name. Set `SPOOKY_URL` to use another Spooky Particles server.
