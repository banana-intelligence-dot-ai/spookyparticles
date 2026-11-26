# Claude Code with Vercel: MCP, CLI and plugin

Claude Code works with Vercel three ways: Vercel's MCP server, the Vercel CLI and the Vercel plugin. Add the MCP server with one command, then ask Claude Code about your deployments and logs. Spooky Particles adds one thing: it hands a failed deploy's log to Claude Code.

## How do I connect Claude Code to Vercel?

Vercel's [MCP server docs](https://vercel.com/docs/agent-resources/vercel-mcp) list Claude Code as a supported client. Run this in your project folder:

```
claude mcp add --transport http vercel https://mcp.vercel.com
```

Start `claude`, then type `/mcp` to sign in to Vercel. Vercel says its MCP server can search its docs, manage projects and deployments, analyze deployment logs and query Web Analytics. Your connection's tool list shows what is available to you.

## What are the other ways to use Claude Code with Vercel?

- **Vercel MCP.** Best when you want Claude Code to look at projects, deployments and logs for you.
- **Vercel CLI.** Claude Code can run commands in your terminal, so it can use the [Vercel CLI](https://vercel.com/docs/cli), for example [vercel logs](https://vercel.com/docs/cli/logs) to read runtime logs.
- **Vercel plugin.** Vercel's [plugin for AI coding agents](https://vercel.com/docs/agent-resources/vercel-plugin) lists Claude Code as supported. It adds Vercel context, skills, agents and slash commands. Install it with `npx plugins add vercel/vercel-plugin`.

These are separate choices. Pick the one that fits how you work.

## Is this the same as running Claude Code on Vercel?

No. Vercel also has a guide to [running Claude Code durably on Vercel](https://vercel.com/docs/agent-harnesses/claude-code). That is for building your own product that runs Claude Code in a Vercel Sandbox. Vercel marks it experimental. This page is about using Claude Code to work on a project you already deploy to Vercel.

## Where does Spooky fit?

The MCP server and the CLI answer when you ask Claude Code something. Spooky Particles starts the other way round. It watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself.

Claude Code and Codex hear about open problems when a session starts. Claude Code also checks before later prompts and speaks only when the list changed.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
