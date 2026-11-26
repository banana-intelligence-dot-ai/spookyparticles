# VibeOps

VibeOps is the work of keeping shipped apps running. For a Vercel app, that starts with knowing when a schedule misses or a deploy fails.

## What is VibeOps?

You build and ship an app. Then the jobs, deploys and domains need watching. VibeOps gives that work a name.

Use [Vercel monitoring](/vercel-monitoring) as an index to the deploy, cron job, uptime and server error guides.

Spooky Particles lists every Vercel cron job and schedule with its path and timing. A read token watches runs without a code change. If one misses or returns an error, you get an alert. You hear when it recovers. See [Vercel cron job monitoring](/vercel-cron-job-monitoring) for where Vercel shows runs and why they go missing.

If a job never starts, use the [Vercel cron job not running fixes](/vercel-cron-job-not-running).

Spooky also checks your live site every 5 minutes. See [Vercel uptime monitoring](/vercel-uptime-monitoring) for what it checks and when it alerts.

If a deployed function returns 504, use the [Vercel function timeout fixes](/vercel-function-timeout).

If a deployed function returns 500, use the [Vercel 500 internal server error fixes](/vercel-500-internal-server-error). If a deployed site returns 502 from an external rewrite target, use the [Vercel 502 bad gateway fixes](/vercel-502-bad-gateway).

If a deployment stays queued or initializing, use the [Vercel deployment stuck fixes](/vercel-deployment-stuck).

To choose where Vercel sends failure alerts, set up [Vercel deployment notifications](/vercel-deployment-notifications).

For what Vercel's own alerts cover, see [Vercel Alerts](/vercel-alerts).

If a build reaches its time or memory limit, use the [Vercel build timeout and out of memory fixes](/vercel-build-timeout-and-out-of-memory).

Use the [build and runtime log guide](/vercel-error-log) when you need the evidence behind a failure.

A failed Vercel or GitHub Actions deploy sends the build log line that names the cause. To read a failed build log by hand, see [Vercel deployment failed: how to read the log](/vercel-deployment-failed). If the build step is what failed, see [Vercel build failed: find the cause](/vercel-build-failed). If the push came from GitHub, see [Vercel deployment failed from GitHub](/vercel-deployment-failed-github). Three common causes have their own pages: [a module the build cannot find](/vercel-module-not-found), [a Vercel Root Directory that does not exist](/vercel-root-directory-does-not-exist) and [an environment variable the build cannot find](/vercel-env-var-not-found-build). [Check-ins](/docs/check-ins) cover scheduled jobs anywhere: cron, launchd, GitHub Actions or another host. For both monitoring paths in one place, see [Cron job monitoring tool for Vercel and other jobs](/cron-job-monitoring-tool-for-vercel).

## How is VibeOps different from DevOps?

DevOps grew up around teams with on-call rotations and dashboards. VibeOps is for people who build with coding agents and ship alone or in a small team. The first responder can be the agent that wrote the code. It hears what broke, with the cause when Spooky has one, and writes the fix as a pull request. [Automate fixes](/automate-fixes) shows how.

See the plain [bug fixing flow for Vercel apps](/automatic-bug-fixing-vercel).

## The map

One map holds Vercel projects, GitHub repos, Actions runs, domains and deploy commits. It also finds apps still running on other hosts from deploy data. Each has a Vercel import link and migration guide.

Every fact names its source. Connections read by default, nothing deletes resources in your accounts, and environment variable values are never stored.

## Ask from your editor

Your coding agent can use an API key that reads by default, or that you allow to write, and MCP tools that follow the same key. Ask whether a push landed or what is broken. [Set up your agent](/setup.md) with the prompt on the home page, or follow the [quickstart](/docs/quickstart).

Using Claude Code with Vercel? See [Claude Code with Vercel: MCP, CLI and plugin](/claude-code-vercel).

Using Codex? See [deploy to Vercel with Codex](/codex-vercel-deploy).

Nate Peace, Banana Intelligence, November 2026.
