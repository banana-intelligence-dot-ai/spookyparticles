# Automatic bug fixing for Vercel apps

When a Vercel deploy fails or a scheduled job misses, Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent writes the fix. If your site goes down, Spooky alerts you. Spooky never changes your code itself.

## How does bug fixing with a coding agent work?

1. Something breaks. A [deploy fails](/vercel-deployment-failed) or a [scheduled job misses](/vercel-cron-job-monitoring).
2. Spooky tells your agent what broke. For a failed deploy, it passes the build log line when it can find one. For a missed scheduled job, it says the run is missing. A quiet job has no log line to pass. For a site that goes down, or a runtime [500 error](/vercel-500-internal-server-error) or [504 error](/vercel-function-timeout), Spooky alerts you and does not pass a log line to your agent.
3. Your agent proposes a fix. You review the code and merge it.

## What can the agent fix and what can it not?

The agent can inspect your repo and the evidence Spooky provides. It can propose code changes for a failed build, a broken function, or a scheduled job. You review and merge those changes.

The agent cannot fix a Vercel outage or a bad account setting. It should tell you when the problem needs a person instead of proposing a code change.

## What should I ask my coding agent?

Paste this prompt into Claude Code or Codex:

```
Find the Vercel problem Spooky reported. First identify whether a deploy failed or a scheduled job missed. For a failed deploy, use the build log line Spooky provided, if it found one. For a missed scheduled job, do not expect a log line when the job never ran. Check its schedule and code. Inspect the repo and propose the smallest code change that fixes the cause. Run the relevant tests. Do not weaken or remove a check. Do not deploy or merge. If the cause is a Vercel outage or an account setting, tell me that a person must fix it.
```

## Where does Spooky fit?

Spooky watches for the failure and gives the useful evidence to your own coding agent. The agent works in your repo and proposes the change. You stay in control of review and merge.

Follow the [quickstart](/docs/quickstart), give your agent [setup.md](/setup.md), or read [how to set up the fix flow](/automate-fixes).

Using Codex to deploy? See [deploy to Vercel with Codex](/codex-vercel-deploy).

## Price

Free, requires your own coding agent.
