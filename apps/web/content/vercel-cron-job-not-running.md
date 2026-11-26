# Vercel cron job not running: fixes

A Vercel cron job runs only on production deployments. If yours is not running, check that its path matches a real route, your plan allows its frequency, and a CRON_SECRET mismatch is not returning 401. Check these setup causes first.

These setup checks and the seven causes below come from [Vercel's troubleshooting guide for cron jobs](https://vercel.com/kb/guide/troubleshooting-vercel-cron-jobs) and its guide to [managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

## Why is my Vercel cron job not running?

Use the seven causes in Vercel's troubleshooting guide to find the fix:

| Cause | Fix |
|---|---|
| It does not run on a preview deployment | Cron jobs run only on production deployments. Request the endpoint directly, then check scheduled runs on the production deployment. |
| It does not run at the expected time | Check whether the cron expression matches the intended schedule and whether your plan restricts how often jobs run. Review the usage and pricing limits. Hobby jobs can run anywhere within the scheduled hour. |
| Every invocation returns 401 | The Authorization header does not match CRON_SECRET. Check the value for characters that are not valid in a header. |
| It runs but does not appear in the logs | The endpoint returned a redirect or cached response. Remove the redirect, including one caused by `trailingSlash`. In a Next.js route handler, add `export const dynamic = 'force-dynamic';`. |
| It is blocked before reaching your function | A WAF custom rule matches the cron request. Review firewall rules and exclude the cron path from rules that deny or challenge. |
| It targets the wrong path | The function was renamed or moved. Update the cron configuration path to a route in the deployment. |
| It is not listed on the Cron Jobs tab | The build did not register the job. Run `vercel build --prod` locally and confirm `.vercel/output/config.json` contains a `crons` array with your job. |

## What should I ask a coding agent?

Based on those Vercel checks, paste this prompt into Claude Code or Codex:

```
My Vercel cron job is not running. Inspect the production deployment and cron configuration. Confirm the path matches a deployed route. Verify the schedule expression and the plan's usage and pricing limits. Check every 401 against CRON_SECRET and the Authorization header, including invalid header characters. Look for redirects or cached responses. Inspect WAF custom rules. Run vercel build --prod locally and confirm .vercel/output/config.json contains a crons array with the job. If this is a Next.js route handler that returns a cached response, propose adding export const dynamic = 'force-dynamic';. Identify the likely cause and propose the smallest fix. Do not deploy.
```

## Where does Spooky fit?

Spooky finds your Vercel cron jobs and alerts you when a run is missed or fails, and again when it recovers. Where it can't read the project's request history on Vercel, one check-in line in the job turns watching on. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself.

Give your agent [setup.md](/setup.md), follow the [quickstart](/docs/quickstart), read about [Vercel cron job monitoring](/vercel-cron-job-monitoring), or add [check-ins](/docs/check-ins).

## Price

Free, requires your own coding agent.
