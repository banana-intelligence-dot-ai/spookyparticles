# The Spooky Standard: what "done" means for a project on Vercel

Version 1, 2026-11-11.

A project meets the standard when all twelve items below are true. Each item says what done looks like, how Spooky checks it (read-only, never a change), and the skill an agent runs to make it true. A skill always ends in a pull request or in steps for a person. Nothing merges itself.

Today one skill, `spooky` (served at /skill.md), covers every live finding. Each item is getting its own small skill.

Status says what Spooky can check today. "Live" means it runs on real accounts now. "Planned" means the item is part of the standard, but the check is not built yet.

## Keep it running

| # | Done means | How Spooky checks | Skill | Status |
|---|---|---|---|---|
| 1 | Someone hears within 10 minutes when the live site stops answering | Fetches the production address every 5 minutes; alerts after two failures, again on recovery | none needed, on by default | Live |
| 2 | Someone hears when a production deploy fails | Reads deploy results for every connected project | none needed, on by default | Live |
| 3 | Someone hears when server errors spike | 10 or more 5xx and 20% of production traffic over 15 minutes | none needed, on by default | Live (needs a read token) |
| 4 | Every scheduled job is watched, and a missed or failed run raises an alert | Reads each project's schedules and their run history; check-in links for jobs off Vercel | `spooky-checkin`: adds one check-in line to a job | Live |

## Close the doors

| # | Done means | How Spooky checks | Skill | Status |
|---|---|---|---|---|
| 5 | No secret sits in a variable the browser can read | Variable names with a public prefix (NEXT_PUBLIC_ and others) that look secret; a scan of the live site's scripts | `spooky-public-secret`: moves it server-side, then lists the keys to rotate | Live |
| 6 | Preview links are not open to the world | The project's deployment protection setting | `spooky-previews`: the one Vercel setting, as steps for the person | Live |
| 7 | Scheduled routes refuse callers without the cron secret | Schedules present and CRON_SECRET set for production | `spooky-cron-guard`: adds the check to each scheduled route | Live |
| 8 | Secrets are marked sensitive, so nobody can read them back | Secret-looking variables stored as plain or readable in production or preview | `spooky-sensitive`: the steps to re-add each one as sensitive | Live |

## Keep it current

| # | Done means | How Spooky checks | Skill | Status |
|---|---|---|---|---|
| 9 | Dependencies get update pull requests on their own | A Dependabot or Renovate file in the linked public repo | `spooky-deps`: adds a Dependabot file | Live (public repos) |
| 10 | Nothing breaks on a date by surprise: domains, certificates, the Node version, API keys | Dates Vercel knows; dates the person or agent records for keys (names and dates only, never a value) | `spooky-expiry`: records a key's date when the agent creates it | Live for dates Vercel knows; typed-in key dates planned |

## Know what you run

| # | Done means | How Spooky checks | Skill | Status |
|---|---|---|---|---|
| 11 | Every outside service the project depends on is listed, with what it costs and whether it is still used | Service names read from variable names and Vercel Marketplace installs; sign-ups the agent records | `spooky-service`: records a sign-up the moment the agent makes it | Live, with cost from the Vercel bill and in use or idle |
| 12 | A spend limit is set, so a traffic spike cannot become a surprise bill | The team's spend management setting, where the plan allows it | `spooky-spend-limit`: the steps for the person | Planned (needs a test of what a free plan lets us read) |

## Rules every skill follows

- One finding per pull request. The person reviews and merges. Three tries per finding, then it goes to the person.
- Read the finding from Spooky first, report back after, and never mark anything fixed. Spooky checks again and decides.
- Never print, copy or store a secret's value. A key that may have leaked is named for rotation, not moved.
- Never delete a resource, a variable or a project.
