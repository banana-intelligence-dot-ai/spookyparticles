# How to automate fixes for failed Vercel deploys and scheduled jobs with your own coding agent

Connect Vercel and GitHub to Spooky Particles, then add one GitHub workflow to each repo. When a deploy fails or a scheduled job misses, Spooky starts that workflow, and your coding agent gets what failed, with the cause when Spooky can find it, and makes the fix: as a pull request, or shipped directly only where your repo's own rules allow.

## Set it up

1. Give your coding agent [setup.md](/setup.md). Claude Code, Codex and Cursor can all read it.
2. Approve the agent's sign-in code, then connect GitHub and Vercel on one page. Spooky reads both accounts. In your repos it can also start the fix workflow.
3. Run `claude setup-token` once in your own terminal and save what it prints. Your agent stores it as a repository secret without seeing it.
4. Your agent adds `.github/workflows/spooky-fix.yml` to each repo by pull request. Merge it.
5. For jobs that run outside Vercel, your agent adds a check-in, so a missed run counts as a failure too.

## What your agent receives

- The project, the check that failed and a link to it.
- The cause when Spooky can find it: the build log line for a deploy, or the missed or failed run for a scheduled job.
- One rule, every time: fix the cause, never make a check pass by weakening it. No lower thresholds, no skipped or deleted checks, tests or alerts.

If the check is still failing after 15 minutes, Spooky alerts you on ntfy, Slack, Teams or email.

## What it never does

- Spooky never merges a pull request and never deletes anything in your accounts. Its one action in your repos is starting the fix workflow.
- It never changes DNS, billing or provider settings.
- It never stores the values of your environment variables.
- Every change made through Spooky is kept in an audit log.

## Price

Free, requires your own coding agent. Fixes run on your own plan.

## Vercel Agent

Vercel Agent, in public beta, reviews code and investigates production issues inside Vercel. Spooky Particles sends the work to the coding agent you already use, on your own plan, and also covers scheduled jobs that run on other hosts. You can use both.

## Questions

**Which coding agents work?** Claude Code runs the GitHub workflow. Codex and Cursor can use the same API and MCP server from your editor.

**Does it ship the fix itself?** Spooky never does. Your agent opens a pull request, or ships directly only where your repo's CLAUDE.md or AGENTS.md allows it.

**What counts as a failure?** A failed production deploy, a page that stops answering, or a scheduled job that misses or reports an error.

**Do I need to change my code?** With a Vercel read token, Vercel cron jobs are watched with no code change. With the Vercel integration alone, and for jobs on other hosts, add a one-line check-in.
