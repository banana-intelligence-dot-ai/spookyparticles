# Vercel Alerts: what they cover and how to set them up

Vercel Alerts notify you by email, Slack or webhook when something is wrong with a project, such as a spike in failed function invocations. They are available on Enterprise and Pro plans with Observability Plus. Spooky also alerts you when a deploy fails or a cron job goes quiet.

For alerts about a failed deployment on any plan, see [Vercel deployment notifications](/vercel-deployment-notifications).

## What are Vercel Alerts?

Alerts tell you when Vercel sees something unusual in a project, so you can respond quickly. Vercel documents them in its [Alerts guide](https://vercel.com/docs/alerts).

## What does Vercel alert on?

By default, Vercel notifies you about two things:

- **Usage anomaly:** your project's usage goes above abnormal levels.
- **Error anomaly:** your project's error rate on function invocations goes above abnormal levels.

An error anomaly fires when a route's five-minute error count is unusually high against its recent baseline. By default it tracks 5xx status codes, and a monitor can track 4xx instead. A usage anomaly fires when 15-minute usage is more than four standard deviations above both the 24-hour and 7-day averages.

## How do I get a Vercel alert by email, Slack or webhook?

1. Open **Settings > Alerts** for your team.
2. Click **Add Monitor**.
3. Pick **Error anomaly** or **Usage anomaly**, and set the filters.
4. Name the monitor and choose which projects it covers.
5. Choose the lowest severity that should notify you, and the destinations.

Vercel always includes Critical alerts on top of the severity you choose. Vercel's [configure alerts guide](https://vercel.com/docs/alerts/configure-alerts) has the full steps, including the CLI.

## Which plans include Vercel Alerts?

Vercel lists Alerts as available on Enterprise and Pro plans with Observability Plus. After you turn on Observability Plus, Vercel holds alerts back until it has enough data: error anomalies start after 24 hours and usage anomalies after 3 days.

## Do Vercel Alerts catch a failed deploy or a quiet cron job?

Vercel's anomaly alerts watch errors and usage on running projects. For a failed deployment, see [Vercel deployment notifications](/vercel-deployment-notifications). For scheduled jobs, see [Vercel cron job monitoring](/vercel-cron-job-monitoring).

## Where does Spooky fit?

Spooky Particles alerts you on ntfy or email when a production deploy fails or a cron job goes quiet, and passes the build log line to your coding agent, Claude Code or Codex, so the agent starts with the likely cause, when Spooky can find it. The agent writes the fix. Spooky never changes your code itself and never merges anything.

Follow the [quickstart](/docs/quickstart) to connect your coding agent, or see [how to automate fixes](/automate-fixes).

This is one part of [VibeOps](/vibeops), the work of keeping shipped apps running.

## Price

Free, requires your own coding agent.
