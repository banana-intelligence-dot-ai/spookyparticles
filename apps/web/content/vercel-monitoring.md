# Vercel monitoring: what to watch and how

Monitoring a Vercel app means watching deploys, cron jobs, whether the site answers and server errors. Vercel gives you logs and observability tools for this; Spooky watches them too: deploys and uptime out of the box, cron jobs and server errors once it can read your Vercel request history or a check-in.

## What should I monitor on a Vercel app?

Monitor deploys, cron jobs, whether the site answers and server errors. Each signal points to a different kind of problem and a more focused next step. The pages in this table explain what to inspect for each one.

| What to watch | Focused guides |
|---|---|
| Deploys | [Vercel deployment failed](/vercel-deployment-failed) and [Vercel deployment notifications](/vercel-deployment-notifications) |
| Cron jobs | [Vercel cron job monitoring](/vercel-cron-job-monitoring) and [Cron job monitoring tool for Vercel](/cron-job-monitoring-tool-for-vercel) |
| Whether the site answers | [Vercel uptime monitoring](/vercel-uptime-monitoring) |
| Server errors | [Vercel error log](/vercel-error-log) and [Vercel deployment errors](/vercel-deployment-errors) |

Start with the [quickstart](/docs/quickstart) to connect your coding agent, then follow the guide for the signal you are investigating. This page keeps the four monitoring jobs together as an index to the focused guides.

## What does Vercel give me for monitoring?

Vercel Observability finds production errors, captures request traces, and has queryable metrics from the dashboard or Vercel CLI. See [Vercel's Observability documentation](https://vercel.com/docs/observability) for these tools.

To find production requests that returned HTTP 500 and get structured JSON output, run:

```bash
vercel logs requests --environment production --query 'httpStatus:500' --json
```

To capture a request trace for an endpoint and return JSON, run:

```bash
vercel curl --trace --json /api/hello
```

The error search gives you production requests to investigate. The trace follows one request. Queryable metrics help you inspect behavior from the dashboard or CLI. Use the focused guides above to move from the monitoring signal to the relevant evidence.

## Where does Spooky fit?

Spooky watches deploys and whether the site answers, and tells you when one goes wrong. Cron jobs and server errors need readable Vercel request history, or a check-in for a cron job.

To set it up, follow the [quickstart](/docs/quickstart) or choose one of the four monitoring guides above.
