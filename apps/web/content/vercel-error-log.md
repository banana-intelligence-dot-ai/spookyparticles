# Vercel error log: where to find it

Find Vercel error logs in the project's Logs tab, or run vercel logs for a deployment and vercel inspect for build logs. For a failed deploy, Spooky passes the build log line to your coding agent. For runtime errors, it tells the agent when server errors rise. It can do that only where it can read the project's request history.

Vercel separates runtime activity from deployment build output. Use the [Vercel Logs documentation](https://vercel.com/docs/logs) for dashboard and runtime log details, and the [production debugging guide](https://vercel.com/docs/observability/debug-production-errors) for a workflow that starts with a failing request.

Use [Vercel monitoring](/vercel-monitoring) to see how logs fit with deploy, cron job and uptime signals.

## Where do I find the Vercel error log?

Open the project and use its **Logs** tab for runtime activity, or open a deployment to read its build log. Runtime logs are searched at project level in the dashboard's deployments section, while build output belongs to a specific deployment.

## How do I query production errors with the CLI?

The [vercel logs command](https://vercel.com/docs/cli/logs) can search production records by environment, field, and time window. To catch every production request with a 5xx response, query the HTTP status field on request records:

```bash
vercel logs requests --environment production --query 'httpStatus >= 500 AND httpStatus < 600' --since 1h
```

Request records carry HTTP status, but they do not carry runtime messages. Query error-level runtime messages separately:

```bash
vercel logs --environment production --query 'level:error' --since 1h
```

When a response or report gives you a request ID, use it to collect the related logs:

```bash
vercel logs --query 'requestId:"<request-id>"' --since 2h
```

Widen the time window if the request is older than 30 minutes. This keeps the query tied to the request instead of mixing unrelated failures into the result.

## How do I read a deployment's build log?

Build logs are available on all plans. If you need the deployment URL, list production deployments:

```bash
vercel list --environment production
```

Then ask [vercel inspect](https://vercel.com/docs/cli/inspect) for that deployment's build output:

```bash
vercel inspect <deployment-url> --logs
```

Build logs explain failures during install, compile, and deployment preparation. For a practical next step, use the [failed deployment guide](/vercel-deployment-failed) or match the message against [common deployment errors](/vercel-deployment-errors).

## How long are Vercel logs available?

Runtime logs are available on all plans and are searched at project level in the dashboard's deployments section. Retention depends on the plan and Observability Plus, and how far back `vercel logs` can query also depends on the plan. For longer storage, use Log Drains, which are available on Pro and Enterprise plans.

## What should I check after I find the error?

If requests return 500, use the [Vercel 500 error guide](/vercel-500-internal-server-error). If a function stops before returning a response, check the [Vercel function timeout fixes](/vercel-function-timeout). These pages turn the log evidence into a focused code or configuration check.

## Where does Spooky fit?

Spooky Particles alerts you on ntfy or email. For a failed production deploy it passes the build log line to your coding agent, Claude Code or Codex, when it can find one. For runtime errors it does not pass a log line. It tells the agent when server errors rise in the project's request history, where it can read that history. The agent writes the fix. Spooky never changes your code.

Follow the [quickstart](/docs/quickstart) to connect your coding agent. See [how to automate fixes](/automate-fixes) for the review flow, and [VibeOps](/vibeops) for the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
