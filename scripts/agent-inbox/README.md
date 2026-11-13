# Agent inbox

## Your coding agent hears about it

Spooky tells your coding agent what is broken. It works with Claude Code, Cursor and OpenAI Codex CLI.

Create a read-only agent key in Spooky Particles and set `SPOOKY_API_KEY` in this shell. From this repository, run:

```sh
mkdir -p ~/.config/spooky && printf '%s\n' "$SPOOKY_API_KEY" > ~/.config/spooky/key && chmod 600 ~/.config/spooky/key
sh scripts/agent-inbox/install.sh
```

With no flags, the installer finds `~/.claude`, `~/.cursor` and `~/.codex` and sets up each one it finds. To pick one, run one of these:

```sh
sh scripts/agent-inbox/install.sh --agent claude
sh scripts/agent-inbox/install.sh --agent cursor
sh scripts/agent-inbox/install.sh --agent codex
```

Add `--dry-run` to print the merged files without changing anything.

## What each one changes

Every file is saved first as `<file>.bak-spooky`. A re-run keeps the first backup. Existing entries are kept, and nothing is added twice. The key itself is never written to an agent config.

- **Claude Code**: adds SessionStart and UserPromptSubmit hooks to `~/.claude/settings.json`. At session start it prints what is broken. Before later prompts it speaks only when the open problems changed.
- **Cursor**: adds a `spooky` MCP server to `~/.cursor/mcp.json` with the header `Bearer ${env:SPOOKY_API_KEY}`, and a `sessionStart` hook to `~/.cursor/hooks.json` that adds the incident text to the session. Cursor reads `SPOOKY_API_KEY` from the environment it was started with, so start Cursor from a shell that has it. The hook reads the key file and does not need the environment.
- **Codex CLI**: adds a `[mcp_servers.spooky]` table with `bearer_token_env_var = "SPOOKY_API_KEY"` to `~/.codex/config.toml`, only if that table is missing, and a short marked block to `~/.codex/AGENTS.md`. The block tells Codex to call `whats_broken` at the start and `confirm_fix` before it says fixed. Re-runs replace the block. Codex reads `SPOOKY_API_KEY` from the shell that starts it. Codex hooks need a manual trust step, so the installer does not use them.

Set `SPOOKY_PROJECT` to override the project name. Set `SPOOKY_URL` to use another Spooky Particles server.

## When no session is open

The fixer starts a fix when nobody is at the keyboard. It runs on your own machine with your own Claude Code or Codex. It is off until you start it, and it never runs code on Spooky's servers.

Every few minutes it asks Spooky what is broken in the projects you list. For a new problem that no other session has claimed, it:

1. Claims the problem, so your other sessions leave it alone.
2. Runs your agent headless in that project's folder. The agent finds the cause, makes a small fix, runs the project's own tests, and commits or deploys only the way the project's CLAUDE.md or AGENTS.md allows.
3. Asks Spooky to check production, and writes down the answer: fixed, still broken, or checking.

It never runs the same problem twice. It stops after 4 runs a day, so it cannot burn through your plan.

Set it up with one command:

1. In Spooky, open Connections and make a Read key for the fixer, so its claims show as its own. Copy it.
2. From this repository, run:

```sh
sh scripts/agent-inbox/spooky-fixer.sh --setup --start --key-from-clipboard
```

The key is read from the clipboard and stays in memory. It is never shown or saved. Not on a Mac? Put the key in `SPOOKY_API_KEY` instead and leave out `--key-from-clipboard`.

Setup does the rest:

- Lists your GitHub repos from Spooky, all picked except archived ones. Type the numbers of any to leave out, or press Enter to keep all.
- Clones each one into `~/spooky-fixer/<repo>`, a clean copy just for the fixer. It uses `gh` when you are signed in to it, which private repos need. A folder that is already there is kept as it is. Pick another folder with `--dir`.
- Writes `~/spooky-fixer/fixer.conf`, one `owner/repo=/path` line per project. Lines you added yourself are kept.
- Uses Claude Code if it is installed, else Codex.
- Prints the line to start the fixer again later, then starts it. Leave out `--start` to set up only.

The fixer skips any folder with uncommitted changes, so it never mixes into your own work.

It runs for 12 hours and then stops. Options:

- `--agent codex` uses Codex instead. Codex stays inside its own sandbox, so it can edit the project but not push. Add `--model` to pick a model.
- Claude runs on your Claude login. If `ANTHROPIC_API_KEY` is set in the shell, the fixer ignores it. Add `--use-api-key` to use the key instead.
- If Claude cannot sign in, the fixer stops with code 3 and the run does not count. Sign in to Claude once by hand, then start it again.
- `--interval 300` sets the seconds between checks. `--hours 12` or `--until 2026-11-13T06:00:00Z` sets when it stops.
- `--budget 4` sets the most runs in a day. `--timeout 1800` sets the most seconds one run may take.
- `--once` checks one time and exits, which suits a scheduler you already use.

To get a phone notice for each run, set `SPOOKY_NTFY_TOPIC` to your ntfy topic. It is off by default.

The key is read from `SPOOKY_API_KEY` or, with `--key-from-clipboard`, from the clipboard. It is never printed, logged or saved. Logs and each run's output are in `~/.local/state/spooky/`, with keys and check-in links removed.

Run `sh scripts/agent-inbox/test.sh` to check the installer and the fixer against a throwaway home directory. It uses fake agents and a fake server.
