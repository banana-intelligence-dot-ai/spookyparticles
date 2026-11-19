# Vercel cron job monitoring: how to know a run was missed

Spooky finds your Vercel cron jobs and alerts when a run is missed or fails, and again when it recovers. Where it can't read the project's request history on Vercel, one check-in line in the job turns watching on.

## How do I see whether a Vercel cron job ran?

Vercel shows the jobs and their logs in the dashboard.

1. Open your project and select **Schedules** in the sidebar, then the **Cron Jobs** tab.
2. Select **View Logs** for the job. This opens the runtime logs filtered to the job's request path, so you can read the status code of each logged invocation.

Source: Vercel's guide to [managing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs). Vercel adds that a job that answers with a redirect or a cached response does not show in the logs.

## Why can a Vercel cron job fail without anyone noticing?

Vercel's own guide gives several reasons. Most leave nothing to read in the logs.

- **No retry.** Vercel will not retry an invocation if a cron job fails.
- **Best effort delivery.** Occasional transient network errors can stop a request from reaching your function. Then the function does not execute and no runtime log exists for that run, so there is nothing to search for.
- **Wrong path.** A job pointed at a path that does not exist produces a 404, and Vercel still runs it.
- **Redirects.** Cron jobs do not follow redirects. With the Next.js `trailingSlash` option on, a request to `/api/cron` redirects to `/api/cron/` and never reaches your function.
- **Secret mismatch.** If the `Authorization` header does not match `CRON_SECRET`, your endpoint returns 401 for every invocation.
- **Preview deployments.** Cron jobs run only on production deployments.

## What does a monitor need to catch?

Two different failures need two different signals. A run that fails shows up as an error status. A run that never happens shows up only as silence, so something has to expect it on a schedule and speak up when it is late. Vercel also says delivery can occasionally repeat a scheduled run, so a good job is safe to run twice.

## How does Spooky monitor Vercel cron jobs?

Spooky finds your Vercel cron jobs and alerts when a run is missed or fails, and again when it recovers. Where it can't read the project's request history on Vercel, one check-in line in the job turns watching on.

The [spooky-checkin package](/docs/npm-package) sends that line for a Vercel cron route, and [check-ins](/docs/check-ins) explains how a late or failed run is caught.

## How do I turn it on?

Give your coding agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps. For a cron job that does not run at all, start with the setup causes in Vercel's troubleshooting table, then see [VibeOps](/vibeops) for the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
