# Vercel deployment notifications: how to set up

Vercel notifies the deployment's creator by email and on the web when a deployment fails. You can change where you get these alerts in your team's My Notifications settings. For other events, use webhooks. Spooky can also send a failed deploy's log line to your coding agent.

For alerts on errors and usage in running projects, see [Vercel Alerts](/vercel-alerts).

When an alert arrives, use the [Vercel deployment failed guide](/vercel-deployment-failed) to find the cause in the build log.

## How do I get notified when a Vercel deployment fails?

Notifications are available on all plans. Web and email are on by default for deployment failures, and Vercel sends the alert to the deployment's creator. Vercel documents these settings in its [notifications guide](https://vercel.com/docs/notifications).

## How do I change where Vercel sends deployment notifications?

1. Select your team.
2. Open **Settings** in the sidebar.
3. Under **Account**, choose **My Notifications**.
4. Toggle where you want to receive each notification type.

Your changes affect only you. You cannot configure notifications for other team members.

## Can I turn off all Vercel notifications?

Not for critical notifications. You can opt out of one channel, such as email, but you cannot turn off both email and web for a critical notification.

## Does Vercel send both a dashboard and an email notification?

Web and email are both on by default for deployment failures. If you read a failure notification in the dashboard before Vercel sends the email, Vercel does not send that email.

## What about push or SMS?

Push notifications are opt-in for each device. They are available on desktop and mobile web. SMS notifications are available per user only for Spend Management.

## How do I get notified of other deployment events?

Use [Vercel Webhooks](https://vercel.com/docs/webhooks) for other deployment events.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, alerts you on ntfy or email when a production deploy fails, and passes the build log line to your coding agent, Claude Code or Codex, so the agent starts with the likely cause, when Spooky can find it. The agent writes the fix. Spooky never changes your code itself and never merges anything.

Follow the [quickstart](/docs/quickstart) to connect your coding agent.

See [how to automate fixes](/automate-fixes) for the full fix setup.

This is one part of [VibeOps](/vibeops), the work of keeping shipped apps running.

## Price

Free, requires your own coding agent.
