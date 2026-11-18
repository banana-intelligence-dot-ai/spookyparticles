# Quickstart

You sign in once. Your coding agent does the rest.

1. Go to [spookyparticles.com](https://spookyparticles.com) and sign in.
2. Give your coding agent this line:

```text
Fetch and follow the instructions at https://spookyparticles.com/setup.md to set up Spooky Particles for me.
```

3. Your agent posts links. You click them to connect Vercel and GitHub, and to approve its sign-in. Spooky reads these accounts. Its one write is on GitHub: starting the fix workflow in repos where you added it.
4. Your agent saves a key in this computer's Keychain, where it stays out of chat. You never paste a key into chat.

## What happens next

- Spooky maps your projects, deploys, GitHub Actions runs and scheduled jobs.
- When something breaks, your coding agent hears about it at the start of its next session, with the log line that says why.
- If the problem is still open after a wait, your people hear on ntfy or email.
- Your agent can create check-ins for your scheduled jobs. See [Check-ins](/docs/check-ins).

## Keys

Setup gives your agent a read key. To create jobs or change records, your agent needs a write key. You make it under `/app/agents` and put it in `SPOOKY_API_KEY` yourself. See [REST API](/docs/api).

## Next

- [Check-ins](/docs/check-ins) for scheduled jobs.
- [Alarm checks](/docs/alarms) for checks that watch the real world.
- [MCP server](/docs/mcp-server) to connect your agent.
