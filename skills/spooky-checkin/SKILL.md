---
name: spooky-checkin
description: Make every scheduled job watched, so a missed or failed run raises an alert. Adds one check-in line to jobs that run off Vercel. Use when adding a cron job, a GitHub Actions schedule, or any recurring task.
---

# Watch every scheduled job

Covers Standard item 4: every scheduled job is watched, and a missed or failed run raises an alert. See [the Standard, Keep it running](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-running).

Spooky reads Vercel cron jobs and their run history on its own, with no code change. Jobs that run anywhere else (GitHub Actions, another host, a machine under a desk) need a check-in: a link the job calls when it finishes. If the call does not arrive on time, Spooky alerts.

## Check

1. List every schedule in the project:
   - `crons` in `vercel.json`.
   - `schedule:` triggers in `.github/workflows/*.yml`.
   - Any other cron config the repo has (a host's config file, a `crontab` line in the docs).
2. If the person uses Spooky, call the MCP tool `list_jobs` (or `GET https://spookyparticles.com/api/v1/checkins` with `Authorization: Bearer $SPOOKY_API_KEY`). Each job shows `status`, `lastCheckIn` and `nextDue`. Vercel cron jobs appear on their own once the team is connected.
3. A schedule off Vercel with no matching job in the list is not watched.

## Fix

For each schedule off Vercel that is not watched:

1. Create a check-in job. This needs a Spooky key with the write scope:

   ```bash
   curl -fsS -X POST https://spookyparticles.com/api/v1/checkins \
     -H "Authorization: Bearer $SPOOKY_API_KEY" -H "Content-Type: application/json" \
     -d '{"name":"<job name>","periodMinutes":<minutes between runs>,"project":"<vercel project>"}'
   ```

   The answer has `job.pingUrl` and a ready `curl` line.
2. Treat the ping link like a password: anyone with it can say the job ran. Do not put it in code. Give it to the person and ask them to store it as a secret named `SPOOKY_PING_URL` where the job runs (for GitHub Actions: repo Settings, Secrets and variables, Actions). Do not print it in logs or in the pull request.
3. On a new branch, add one line as the last step of the job, so it runs only when the job succeeds:

   ```bash
   curl -fsS -m 10 --retry 3 "$SPOOKY_PING_URL"
   ```

   In a GitHub Actions step, pass it in with `env: SPOOKY_PING_URL: ${{ secrets.SPOOKY_PING_URL }}`.
4. Open one pull request per job. Say in the description that the person must add the secret before merging.

## Prove it is done

- `list_jobs` shows a job for every schedule found in step 1.
- After the next run, the job's `status` is `up` and `lastCheckIn` is recent.
- Report the pull request links. Spooky decides when the job counts as watched.

## Rules

- Never print, copy or commit the ping link or any secret.
- Pull requests only. Never merge.
- Never delete a job, a schedule or a workflow.
