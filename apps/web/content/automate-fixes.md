# How to automate fixes for failed Vercel deploys and scheduled jobs with your own coding agent

To automate fixes, connect Vercel and GitHub to Spooky Particles and add one GitHub workflow per repo. When a deploy fails or a scheduled job misses, Spooky starts it, and your coding agent writes the fix as a pull request.

The agent gets what failed, with the cause when Spooky can find it. It ships directly only where your repo's own rules allow. This is one part of [VibeOps](/vibeops), the work of keeping shipped apps running.

## How do I set it up?

1. Give your coding agent [setup.md](/setup.md). Claude Code and Codex can both read it. The [quickstart](/docs/quickstart) has the same steps.
2. Approve the agent's sign-in code, then connect GitHub and Vercel on one page. Spooky reads both accounts. In your repos it can also start the fix workflow.
3. Run `claude setup-token` once in your own terminal and save what it prints. Your agent stores it as a repository secret without seeing it.
4. Your agent adds `.github/workflows/spooky-fix.yml` to each repo by pull request. Merge it.
5. For jobs that run outside Vercel, your agent adds a [check-in](/docs/check-ins), so a missed run counts as a failure too.

## What does your agent receive?

- The project, the check that failed and a link to it.
- The cause when Spooky can find it: the build log line for a deploy (see [how to read a failed Vercel deployment](/vercel-deployment-failed) by hand, [a failed Vercel build](/vercel-build-failed), [a failed deploy that started from GitHub](/vercel-deployment-failed-github), [the Root Directory error](/vercel-root-directory-does-not-exist), or [a missing environment variable](/vercel-env-var-not-found-build)), or the missed or failed run for a scheduled job.
- One rule, every time: fix the cause, never make a check pass by weakening it. No lower thresholds, no skipped or deleted checks, tests or alerts. See [alarm checks](/docs/alarms).

If a scheduled job is still failing 15 minutes later, Spooky alerts your people on ntfy or email.

## What does Spooky never do?

- Spooky never merges a pull request and never deletes anything in your accounts. Its one action in your repos is starting the fix workflow.
- It never changes DNS, billing or provider settings.
- It never stores the values of your environment variables.
- Every change made through Spooky is kept in an audit log.

## Price

Free, requires your own coding agent. Fixes run on your own plan.

## Vercel Agent

Vercel Agent, in public beta, reviews code and investigates production issues inside Vercel. Spooky Particles sends the work to the coding agent you already use, on your own plan, and also covers scheduled jobs that run on other hosts. You can use both.

## Questions

**Which coding agents work?** Claude Code runs the GitHub workflow. Codex can use the same API and MCP server from your editor.

**Does it ship the fix itself?** Spooky never does. Your agent opens a pull request, or ships directly only where your repo's CLAUDE.md or AGENTS.md allows it.

**What counts as a failure?** A failed production deploy, a page that stops answering, or a scheduled job that misses or reports an error.

**Do I need to change my code?** With a Vercel read token, Vercel cron jobs are watched with no code change. With the Vercel integration alone, and for jobs on other hosts, add a one-line check-in.
