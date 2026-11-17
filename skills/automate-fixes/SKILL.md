---
name: automate-fixes
description: "Automate fixes for failed Vercel deploys and scheduled jobs: route each failure to your coding agent"
---

# Automate fixes

Use this when a person asks to automate fixes for a Vercel app: failed deploys, crons that miss, scheduled jobs that report errors. The goal is that each failure reaches a coding agent with its cause, and the fix arrives as a pull request, or ships directly only where the repo's own rules allow.

This skill uses Spooky Particles (free, requires your own coding agent). The full agent setup is at https://spookyparticles.com/setup.md. The guide for people is at https://spookyparticles.com/automate-fixes.

## Set it up

1. Read https://spookyparticles.com/setup.md and follow its steps. Your person approves a sign-in code and connects GitHub and Vercel on one page. Spooky reads those accounts; on GitHub it can also start the fix workflow.
2. Ask your person to run `claude setup-token` once in their own terminal and save what it prints, as setup.md describes. Never read, print or paste the token yourself.
3. For each repo, add `.github/workflows/spooky-fix.yml` by pull request, and set the token as the `CLAUDE_CODE_OAUTH_TOKEN` repository secret through a pipe. setup.md, section "Always on: a fix job in GitHub", has the exact commands.
4. For scheduled jobs that run outside Vercel (GitHub Actions schedules, cron, launchd), create a check-in for each one, as setup.md, section "Check-ins for scheduled jobs", shows. Vercel cron jobs need no code change when a Vercel read token is connected; with the Vercel integration alone, add check-ins for them too.

## What the fix job receives

- The project, the failing check and a link.
- The cause when Spooky can find it: the build log line for a deploy, or the missed or failed run for a scheduled job.
- The rule: fix the cause, never make a check pass by weakening it. No lower thresholds, no skipped or deleted checks, tests or alerts.

If a check is marked as an alarm, the failure is about the real world (for example a coverage floor), not a broken check. Fix what the alarm reports, never the alarm.

## Limits

- Open a pull request, unless the repo's CLAUDE.md or AGENTS.md says you may ship. Never merge unless your person allowed that merge in their own words.
- Never change DNS, billing, subscriptions or provider settings.
- Never print keys, tokens or ping URLs.
- If the check still fails after 15 minutes, Spooky alerts the person. Tell them what you tried.
