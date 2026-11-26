# Deploy to Vercel with Codex

Codex can deploy your app to Vercel. Ask it to use the Vercel plugin to deploy a preview and hand you the live URL, or run the Vercel CLI yourself. If a deploy fails, Spooky tells Codex what broke the next time a Codex session starts.

## How do I deploy to Vercel with Codex?

OpenAI's [Codex guide for deploying an app or website](https://developers.openai.com/codex/use-cases/deploy-app-or-website) pairs two plugins. Build Web Apps builds and polishes the app. The Vercel plugin deploys previews, inspects deployments and reads build logs.

1. Open your project in Codex.
2. Ask it to build the app, then use the Vercel plugin to deploy a preview.
3. Have it run the local build and check that the deployment is ready before it hands you the URL.

A preview deployment is the default. Ask for production only when you mean it.

## What if I do not use the plugin?

Run the Vercel CLI from the project root. Vercel's [deploy command docs](https://vercel.com/docs/cli/deploy) say `vercel deploy` deploys a project from its root directory or from a path you give it.

## What should Codex say when a deploy is not done?

If the deploy needs an environment variable, a team choice, a domain setting or a login step, Codex should say so instead of calling the site finished. That is the rule in OpenAI's guide, and it is a good one to keep in your prompt.

## What happens when the Vercel deploy fails?

Codex can read the Vercel build logs through the plugin and fix the cause. To get the news without asking, turn on agent alerts in [setup.md](/setup.md), step 5. Spooky then tells Codex about a [failed deploy](/vercel-deployment-failed) when a session starts, and passes the build log line when it can find one. Claude Code also checks before later prompts. Codex hears at session start. For a [Claude Code setup](/claude-code-vercel), the flow is the same.

Paste this into Codex:

```
Check for a Vercel problem Spooky reported. If a deploy failed, use the build log line Spooky provided, or read the Vercel build log for that deployment. Find the cause in the repo and propose the smallest code change that fixes it. Run the local build and the tests. Do not weaken or remove a check. Deploy a preview, not production, and do not merge. If the cause is an environment variable, a domain or an account setting, tell me what a person must change.
```

Follow the [quickstart](/docs/quickstart) to set this up, or see [how to automate fixes](/automate-fixes). For the full review flow, read [bug fixing for Vercel apps](/automatic-bug-fixing-vercel).

## Price

Free, requires your own coding agent.
