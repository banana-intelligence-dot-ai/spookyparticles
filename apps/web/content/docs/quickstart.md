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
- Use [Vercel monitoring](/vercel-monitoring) as an index to the deploy, cron job, uptime and server error guides.
- When something breaks, your coding agent hears about it at the start of its next session, with the log line that says why.
- To read a failed deploy's build log yourself, see [Vercel deployment failed](/vercel-deployment-failed), or [Vercel build failed](/vercel-build-failed) if the build step broke.
- To inspect build and runtime failures, use the [Vercel log commands](/vercel-error-log).
- If a live URL returns 404, follow the [Vercel 404 NOT_FOUND fix](/vercel-404-not-found).
- If a page works until you refresh it, follow the [Vercel refresh routing fix](/vercel-404-on-refresh).
- If the site answers 503 DEPLOYMENT_PAUSED, follow the [deployment paused checks](/vercel-deployment-paused).
- If a deployed function returns 504, follow the [Vercel function timeout fixes](/vercel-function-timeout).
- If a deployed function returns 500, follow the [Vercel 500 internal server error fixes](/vercel-500-internal-server-error).
- If a deployed site returns 502 from an external rewrite target, follow the [Vercel 502 bad gateway fixes](/vercel-502-bad-gateway).
- If a deployment stays queued or initializing, follow the [Vercel deployment stuck fixes](/vercel-deployment-stuck).
- To choose where Vercel sends failure alerts, set up [Vercel deployment notifications](/vercel-deployment-notifications).
- To see what Vercel's own alerts cover, read [Vercel Alerts](/vercel-alerts).
- If a build reaches its time or memory limit, follow the [Vercel build timeout and out of memory fixes](/vercel-build-timeout-and-out-of-memory).
- If a push to your main branch gets no Vercel deployment within 20 minutes, Spooky tells you which commit.
- If the problem is still open after a wait, your people hear on ntfy or email.
- Spooky also checks your live site every 5 minutes. See [Vercel uptime monitoring](/vercel-uptime-monitoring).
- Your agent can create check-ins for your scheduled jobs. See [Check-ins](/docs/check-ins). For Vercel jobs and jobs on other systems, see [Cron job monitoring tool for Vercel and other jobs](/cron-job-monitoring-tool-for-vercel).
- If a Vercel job never starts, use the [Vercel cron job not running fixes](/vercel-cron-job-not-running).

## Keys

Setup gives your agent a read key. To create jobs or change records, your agent needs a write key. You make it under `/app/agents` and put it in `SPOOKY_API_KEY` yourself. See [REST API](/docs/api).

## Next

- [Check-ins](/docs/check-ins) for scheduled jobs.
- [Alarm checks](/docs/alarms) for checks that watch the real world.
- [MCP server](/docs/mcp-server) to connect your agent.
- [Automate fixes](/automate-fixes) for the full fix setup, step by step.
- [Bug fixing for Vercel apps](/automatic-bug-fixing-vercel) for the review flow.
- [Deploy to Vercel with Codex](/codex-vercel-deploy) if your agent is Codex.
- [VibeOps](/vibeops) for what the word means.
- Matching an error line to a cause? See [Vercel deployment errors](/vercel-deployment-errors).
