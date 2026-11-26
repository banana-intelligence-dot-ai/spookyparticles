# Vercel uptime monitoring: get an alert when your site goes down

Spooky checks your live Vercel site every 5 minutes and alerts when it stops answering or answers with an error. It waits for two failed checks in a row, so one blip doesn't page you. When the site answers normally again, you hear that too.

Each 5 minute sweep covers up to 40 projects, so an account with more checks each one less often.

## How do I monitor uptime on a Vercel site?

You need something outside your app that asks for the page again and again and tells you when it stops answering. Vercel's own alerts watch your traffic from the inside. Its [alerts page](https://vercel.com/docs/alerts) describes error anomalies, which compare a route's recent error count to its usual level, and usage anomalies. It also says alerts are available on Enterprise and Pro plans with Observability Plus. The page does not describe a check that fetches your site from the outside, and Vercel notes that minimum activity thresholds reduce low-volume noise, so a quiet site may not trigger them.

An outside check covers that gap. You can run one yourself or use a service. Spooky Particles does it for each Vercel project it watches.

For the full set of signals to watch, see [Vercel monitoring](/vercel-monitoring).

## What does Spooky check?

- It reads your project's production address from Vercel. If the project has a verified custom domain that does not redirect elsewhere, it uses that. If not, it uses the deployment address.
- Every 5 minutes it asks that address for the page. Each sweep checks up to 40 projects, the ones checked longest ago first. A reply that is not an error counts as up, including after a redirect to another address Vercel lists for the same project.
- A slow answer counts too. If the site does not answer within 10 seconds, or the name or connection fails, the check fails.
- An error status, such as 500 or 404, fails the check.
- A 401 or 403 does not count as down. A site behind a login still answers, so Spooky does not read it as an outage.
- After two failed checks in a row, you get an alert on ntfy or email. One failed check alone does not alert.
- When the site answers normally again, you get a second message saying it is back. If it comes back behind a login (401 or 403), Spooky does not send that message.

## Why does it wait for two failed checks?

A single failed request can be a network blip, a cold start or a deploy in progress. Waiting for a second failure keeps those from waking you up. The cost is that an alert comes a little after the site goes down, not at the first failure.

## What is uptime monitoring?

Uptime monitoring is a check, made again and again from outside, that your site still answers. When it stops, you get an alert.

## What about a site that is up but broken?

An uptime check sees whether the address answers, not whether the page is right. Spooky also alerts on a burst of server errors in a project's recent request history, where it can read that history. For a failed deploy, see [Vercel deployment failed](/vercel-deployment-failed), which covers reading the build log by hand.

## How do I turn it on?

Give your coding agent [setup.md](/setup.md), or follow the [quickstart](/docs/quickstart). Spooky reads your Vercel account, finds your projects and starts checking. [VibeOps](/vibeops) is the wider practice of keeping shipped apps running, and [automate fixes](/automate-fixes) shows how a failure becomes a pull request from your own agent.

## Price

Free, requires your own coding agent.
