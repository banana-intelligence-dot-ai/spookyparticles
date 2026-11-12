# Spooky Particles

VibeOps for apps on Vercel. You ship the app; Spooky keeps it running.

Live at [spookyparticles.com](https://spookyparticles.com). Sign in with Vercel.

## What it does

- **Watches schedules and deploys.** Every Vercel cron job and schedule, with an alert when a run misses or fails and again when it recovers. A failed deploy comes with the log line that names the cause.
- **Checks the basics.** Uptime, server-error spikes, secrets in browser-readable variables, open preview links, unguarded cron routes, dependency updates, dates that expire. The full list is [the Standard](docs/standard/STANDARD.md).
- **Lists what you run.** Every outside service each project depends on, what it costs on your Vercel bill, and whether it is still used.
- **Hands work to your agent.** An MCP server and a REST API, so a coding agent can ask what is broken and open a pull request to fix it. Setup for agents: [spookyparticles.com/setup.md](https://spookyparticles.com/setup.md).

## How it is built

Next.js (App Router) on Vercel, Neon Postgres through Drizzle, Better Auth, Vercel Workflow for long syncs. Every capability is an `/api/v1` endpoint first; the web app, the MCP server and agents all use the same API.

- `apps/web`: the app, the API and the MCP server. Run it locally with [apps/web/README.md](apps/web/README.md).
- `packages/tier0`: rules that sort billing and renewal email by sender, with no model call.
- `docs/standard`: what "done" means for a project on Vercel.

## Security rules, enforced in code

- Read-only. Calls to your providers are reads, and nothing on your accounts is changed or deleted.
- Environment variable values are never stored. When Vercel returns one, it is dropped in memory.
- Every action is written to an append-only audit log.
- Revoking a connection deletes its tokens at once and, within 30 days, the data only that connection supplied.

Found a security problem? Email hello@spookyparticles.com rather than opening an issue.

## License

MIT. See [LICENSE](LICENSE).
