# Spooky Particles

VibeOps for apps on Vercel. You ship the app; Spooky keeps it running.

Live at [spookyparticles.com](https://spookyparticles.com). Sign in with Vercel.

## What it does

- **Watches schedules and deploys.** Every Vercel cron job and schedule, with an alert when a run misses or fails and again when it recovers. A failed deploy comes with the log line that names the cause.
- **Checks the basics.** Uptime, server-error spikes, secrets in browser-readable variables, open preview links, unguarded cron routes, dependency updates, dates that expire. The full list is [the Standard](docs/standard/STANDARD.md).
- **Lists what you run.** Every outside service each project depends on, what it costs on your Vercel bill, and whether it is still used.
- **Hands work to your agent.** An MCP server and a REST API, so a coding agent can ask what is broken and open a pull request to fix it. Setup for agents: [spookyparticles.com/setup.md](https://spookyparticles.com/setup.md).

## Skills

One agent skill per item of [the Standard](docs/standard/STANDARD.md). Any coding agent that reads `SKILL.md` files (Claude Code, Codex, Cursor and others) can run one to bring a Vercel project up to that item. Each skill says how to check the item, how to fix it, and how to prove it is done. Every skill ends in a pull request or in steps for a person. None of them touches a secret's value or deletes anything. They work without Spooky; with Spooky, each names the API field or MCP tool that shows the item.

Install all of them for your agents:

```bash
npx skills add banana-intelligence-dot-ai/spookyparticles
```

Or copy one folder from `skills/` into your agent's skills folder, for example `.claude/skills/` for Claude Code.

| # | Standard item | Skill | Spooky shows it in |
|---|---|---|---|
| 1 | Someone hears within 10 minutes when the live site stops answering | [spooky-uptime](skills/spooky-uptime/SKILL.md) | `uptime.state` in `GET /api/v1/projects` |
| 2 | Someone hears when a production deploy fails | [spooky-deploy-alerts](skills/spooky-deploy-alerts/SKILL.md) | `whats_broken`, `GET /api/v1/incidents` |
| 3 | Someone hears when server errors spike | [spooky-error-alerts](skills/spooky-error-alerts/SKILL.md) | reason `needs_read_token` in `list_findings` |
| 4 | Every scheduled job is watched | [spooky-checkin](skills/spooky-checkin/SKILL.md) | `list_jobs`, `GET /api/v1/checkins` |
| 5 | No secret sits in a variable the browser can read | [spooky-public-secret](skills/spooky-public-secret/SKILL.md) | check `secret_in_public_code` in `list_findings` |
| 6 | Preview links are not open to the world | [spooky-previews](skills/spooky-previews/SKILL.md) | check `previews_open` in `list_findings` |
| 7 | Scheduled routes refuse callers without the cron secret | [spooky-cron-guard](skills/spooky-cron-guard/SKILL.md) | check `cron_unguarded` in `list_findings` |
| 8 | Secrets are marked sensitive | [spooky-sensitive](skills/spooky-sensitive/SKILL.md) | check `secret_not_sensitive` in `list_findings` |
| 9 | Dependencies get update pull requests on their own | [spooky-deps](skills/spooky-deps/SKILL.md) | check `deps_not_updated` in `list_findings` |
| 10 | Nothing breaks on a date by surprise | [spooky-expiry](skills/spooky-expiry/SKILL.md) | `list_expirations`, `GET /api/v1/expirations` |
| 11 | Every outside service is listed, with cost and use | [spooky-service](skills/spooky-service/SKILL.md) | `services[].usage`, `monthlyCostUsd` in `GET /api/v1/services` |
| 12 | A spend limit is set | [spooky-spend-limit](skills/spooky-spend-limit/SKILL.md) | not checked yet; `bill` in `GET /api/v1/services` helps pick the amount |

The `spooky` skill (served at [spookyparticles.com/skill.md](https://spookyparticles.com/skill.md)) works through Spooky's findings one at a time and points to the skill for each item.

## How it is built

Next.js (App Router) on Vercel, Neon Postgres through Drizzle, Better Auth, Vercel Workflow for long syncs. Every capability is an `/api/v1` endpoint first; the web app, the MCP server and agents all use the same API.

- `apps/web`: the app, the API and the MCP server. Run it locally with [apps/web/README.md](apps/web/README.md).
- `packages/tier0`: rules that sort billing and renewal email by sender, with no model call.
- `docs/standard`: what "done" means for a project on Vercel.
- `skills`: one agent skill per Standard item.

## Security rules, enforced in code

- Read-only. Calls to your providers are reads, and nothing on your accounts is changed or deleted.
- Environment variable values are never stored. When Vercel returns one, it is dropped in memory.
- Every action is written to an append-only audit log.
- Revoking a connection deletes its tokens at once and, within 30 days, the data only that connection supplied.

Found a security problem? Email hello@spookyparticles.com rather than opening an issue.

## License

MIT. See [LICENSE](LICENSE).
