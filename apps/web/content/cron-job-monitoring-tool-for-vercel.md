# Cron job monitoring tool for Vercel and other jobs

Cron monitors differ in how they learn a job ran. Spooky reads your Vercel project's cron list and watches each run where it can read the request history. For any other scheduled job (GitHub Actions, launchd, plain cron), one check-in line tells it the job ran.

## How does a cron monitor know a job ran?

A cron monitor learns about a run in one of two ways.

1. It reads the platform's request history.
2. The job sends a check-in when it finishes.

The first path needs a platform whose request history the monitor can read. The second path works for a scheduled job that can call a link when its work is done.

## What should I look for in a cron job monitoring tool?

Ask four short questions.

- Does it learn of a run without you editing every job?
- Does it alert on a late or missed run and on recovery?
- Does it tell your coding agent, not just you?
- Does it cover jobs outside one platform?

## How does Spooky watch Vercel cron jobs?

Spooky reads your Vercel project's cron list. Where it can read the request history, it watches each run without a code change. It alerts when a run is missed or fails, and again when it recovers.

Read [Vercel cron job monitoring](/vercel-cron-job-monitoring) for where Vercel shows runs and why a run can leave no log.

## How do I monitor GitHub Actions, launchd or plain cron?

Add a check-in at the end of the job, after its own success check. Create the job with `periodMinutes`, or with a cron `schedule` and `timeZone`, plus `graceMinutes` for how late is still fine.

For a cron schedule, the [check-ins guide](/docs/check-ins) uses this call. It reads the key from `SPOOKY_API_KEY`.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
  -d '{"name":"Weekday publish","schedule":"35 7 * * 1-5","timeZone":"America/New_York","project":"you/your-repo"}' \
  https://spookyparticles.com/api/v1/checkins
```

Creating a job needs a key with the write scope. The create call returns a ping link. Put that link at the end of the job's script. The [REST API](/docs/api) lists keys, scopes, endpoints and errors. The [quickstart](/docs/quickstart) explains how setup gives your agent a read key and where a write key fits.

## Where does Spooky fit?

Spooky finds your Vercel cron jobs and alerts when a run is missed or fails, and again when it recovers. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix for you to review.

For the wider practice of keeping shipped apps running, read [VibeOps](/vibeops).

## Price

Free, requires your own coding agent.
