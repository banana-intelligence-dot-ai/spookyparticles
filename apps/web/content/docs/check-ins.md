# Check-ins

A check-in tells Spooky that a scheduled job ran. If a run is late or fails, you and your coding agent hear about it. Use one for a nightly build, a daily publish, a GitHub Actions schedule, or a cron or launchd job.

For Vercel jobs and jobs on other systems, see [Cron job monitoring tool for Vercel and other jobs](/cron-job-monitoring-tool-for-vercel).

Creating a job needs a key with the write scope. The examples read the key from `SPOOKY_API_KEY`.

## Create a job

Send `periodMinutes` for how often it runs and `graceMinutes` for how late is still fine.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
  -d '{"name":"Nightly backup","periodMinutes":1440,"graceMinutes":30,"project":"you/your-repo"}' \
  https://spookyparticles.com/api/v1/checkins | jq '{id: .job.id, pingUrl: .job.pingUrl, curl}'
```

For a cron job, send `schedule` and `timeZone` instead of a period. Lateness then follows the real run times.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
  -d '{"name":"Weekday publish","schedule":"35 7 * * 1-5","timeZone":"America/New_York","project":"you/your-repo"}' \
  https://spookyparticles.com/api/v1/checkins
```

| Field | What it does |
|---|---|
| `name` | 2 to 80 characters. |
| `periodMinutes` | How often it runs, in minutes. |
| `schedule`, `timeZone` | A cron schedule, instead of a period. |
| `graceMinutes` | How late is still fine. |
| `project` | The `owner/repo` it belongs to. |
| `owner` | The person responsible. Alerts include it. Up to 80 characters. |
| `maxRunMinutes` | 1 to 10080. Catches a run that starts and never finishes. |
| `minCount` | Catches a run that processed too few items. |

## Ping it

The create call returns a ping link and a ready `curl` line. Put it at the end of the job's script, after its own success check. It is one GET and needs no key.

```bash
curl -fsS -m 10 --retry 3 "<pingUrl>"
```

Treat the link like a password. Anyone who has it can say your job ran.

Options on the link:

```bash
# the job started
curl -fsS -m 10 --retry 3 "<pingUrl>?status=start"

# the job failed, with a short note as the body
curl -fsS -m 10 --retry 3 -X POST --data "import step failed" "<pingUrl>?status=fail"

# the job ran and processed 12 items
curl -fsS -m 10 --retry 3 "<pingUrl>?count=12"
```

- Send `?status=start` before the work, and set `maxRunMinutes`, to catch a run that never finishes.
- Send `?count=N` with an ok ping, and set `minCount`, to flag a run that processed too few items. A missing count does not fail the run.

The link also takes path endings, for tools that build the URL that way (resticprofile, backrest and Ofelia hooks, for example):

```bash
curl -fsS -m 10 --retry 3 "<pingUrl>/start"   # started
curl -fsS -m 10 --retry 3 "<pingUrl>"         # ran fine
curl -fsS -m 10 --retry 3 "<pingUrl>/fail"    # failed
curl -fsS -m 10 --retry 3 "<pingUrl>/$?"      # exit code: 0 is ok, 1 to 255 is a failure
```

The first 2,000 characters of a POST body on any of these are kept as the run's note.

In a Vercel cron route or a Node, Bun or Deno job, the [spooky-checkin package](/docs/npm-package) sends these pings for you. For the Vercel side, see [Vercel cron job monitoring](/vercel-cron-job-monitoring).

If a Vercel job never starts, use the [Vercel cron job not running fixes](/vercel-cron-job-not-running).

## Send a daily number

Post a number to the same check-in link with `/stats` at the end.

```bash
curl -X POST https://spookyparticles.com/api/ping/<token>/stats -H 'content-type: application/json' -d '{"main":{"name":"signups","value":12},"counts":{"users":340}}'
```

The day defaults to yesterday Pacific. You can send up to 3 counts. Values must be whole numbers. Text fields are not accepted. Sending the same day again replaces its numbers. This records no run. The numbers appear in the morning message.

## Read a job's own status

Add `/status` to the ping link. It needs no key and never records a check-in.

```bash
curl -fsS "<pingUrl>/status"
```

## List jobs

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -H @- "https://spookyparticles.com/api/v1/checkins?status=issues" | jq '.jobs[] | {name, status}'
```

Statuses are `new`, `never_checked_in`, `up`, `late`, `down`, `paused` and `retired`. Filter with `?status=down,late`. `?status=issues` means late, down and never checked in. `never_checked_in` does not send an alert.

## Retire a job

A retired job stops alerting. Its next check-in revives it.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X PATCH -H @- -H "content-type: application/json" \
  -d '{"retired":true}' https://spookyparticles.com/api/v1/checkins/JOB_ID
```

## GitHub Actions

Save the ping link as a repository secret straight from the create call, so it is never printed.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
  -d '{"name":"Nightly backup","periodMinutes":1440,"graceMinutes":30,"project":"you/your-repo"}' \
  https://spookyparticles.com/api/v1/checkins | jq -r .job.pingUrl | gh secret set SPOOKY_PING_URL -R you/your-repo
```

Then make the last step of the workflow ping it.

```yaml
- name: Check in with Spooky
  run: curl -fsS -m 10 --retry 3 "$SPOOKY_PING_URL"
  env:
    SPOOKY_PING_URL: ${{ secrets.SPOOKY_PING_URL }}
```

## Where alerts go

Open `/app/jobs` once. Add an ntfy topic or an email, then press Send a test. With no channel set, alerts go to your account email.

To have a missed run start a fix by your coding agent, see [Automate fixes](/automate-fixes). For the bigger picture, see [VibeOps](/vibeops).
