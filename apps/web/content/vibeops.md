# VibeOps

VibeOps is the work of keeping shipped apps running. For a Vercel app, that starts with knowing when a schedule misses or a deploy fails.

## The definition

You build and ship an app. Then the jobs, deploys and domains need watching. VibeOps gives that work a name.

Spooky Particles lists every Vercel cron job and schedule with its path and timing. A read token watches runs without a code change. If one misses or returns an error, you get an alert. You hear when it recovers.

A failed Vercel or GitHub Actions deploy sends the build log line that names the cause. Check-ins cover scheduled jobs anywhere: cron, launchd, GitHub Actions or another host.

## The map

One map holds Vercel projects, GitHub repos, Actions runs, domains and deploy commits. It also finds apps still running on other hosts from deploy data. Each has a Vercel import link and migration guide.

Every fact names its source. Connections read by default, nothing deletes resources in your accounts, and environment variable values are never stored.

## Ask from your editor

Your coding agent can use an API key that reads by default, or that you allow to write, and MCP tools that follow the same key. Ask whether a push landed or what is broken. [Set up your agent](/setup.md) with the prompt on the home page.

Nate Peace, Banana Intelligence, November 2026.
