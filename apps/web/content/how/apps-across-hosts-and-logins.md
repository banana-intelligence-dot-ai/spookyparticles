# How Spooky maps Vercel and your other apps

Start with Vercel. Spooky Particles lists your projects, schedules, domains and deploys, then shows what broke.

Connect through a Vercel integration or paste a read token. The integration lets you choose projects and sets the read scopes. A pasted token watches schedules without a code change. Vercel cannot make that token read-only, so our code enforces read-only access.

## What each connection shows

| Source | What it gives | Limit |
|---|---|---|
| Vercel integration | Chosen projects, deploys, domains and schedule paths and timing | It cannot read request history, so it cannot watch schedule runs alone |
| Vercel read token | Projects, deploys, domains and schedule runs | Vercel cannot scope the token to read-only; our code uses GET requests and one read-only request history query |
| GitHub read-only connection | Repos, deploy data and GitHub Actions runs | It does not give deep coverage of other hosts |
| Optional Gmail inbox, by request | Bills and renewals | It is not needed for schedules, deploy alerts or the map |

Every fact names its source. The map joins Vercel projects, GitHub repos, Actions runs, domains and the commit each deploy carries.

## What gets watched

Every Vercel cron job and schedule appears with its path and timing. With a read token, a missed run or error response triggers an alert. You get another alert when it recovers. Alerts can reach your phone through ntfy, Slack, Teams or email.

The integration alone lists schedules but cannot watch runs. Add one check-in line or a read token to watch them. A check-in also works for cron, launchd, GitHub Actions and jobs on other hosts. The job hits a link when it runs. Silence past its grace period triggers an alert.

A failed Vercel or GitHub Actions deploy triggers an alert with the build log line that names the cause.

## What is still elsewhere

Deploy data can show projects still running on Netlify, Render, Railway, Fly.io, Heroku, Cloudflare, AWS or GitHub Pages. Each row links to an import into Vercel and Vercel's migration guide.

This is a view from deploy data, not deep monitoring of those hosts. If a project leaves no deploy data, it may not appear.

## Ask your coding agent

Your agent can use an API key that reads by default or that you allow to write, and the eight read tools at `https://spookyparticles.com/api/mcp`. Ask "Did my push land?" or "What is broken?" Use the [agent setup instructions](/setup.md) to connect it.

Spooky Particles never deletes resources in your accounts. It keeps an audit log and never stores environment variable values.
