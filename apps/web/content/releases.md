# Releases

What changed in Spooky Particles, dated, newest first. One entry per shipped change that a user can see. Nothing here is a plan; if it is on this page it is live.

## 2026-11-10

- **Hand a finding to your own agent.** A coding agent with a write key can ask for the next finding from the check, fix it as a pull request, and report back. It never merges, and its report never marks anything fixed: only our next check does. Three tries per finding, one finding at a time. Findings that only you can fix come with the exact setting to open. The Check page shows what your agent did. Tools: `next_finding` and `report_finding` on the MCP endpoint, or `POST /api/v1/checks/next` and `POST /api/v1/checks/{id}/report`. The skill file is at `/skill.md`.
- **The check.** Five checks on every Vercel project, read-only: preview links open to the world, a secret that can be read back from your settings, a secret key visible in your public site, a schedule anyone can trigger, and no update bot on the repo. Each finding names the one setting that fixes it and links Vercel's own docs. We read names and settings, never a secret's value. On the new **Check** page and at `GET /api/v1/checks`.
- **Uptime, on by default.** Every connected project's live site is requested every 5 minutes, as any visitor could. Two failures in a row alert you, and you hear again when it is back. Nothing to set up.
- **Server-error alert.** A spike of server errors on production alerts you: 10 or more in 15 minutes, making up a fifth of traffic. It needs request history, so a read token for now.
- **Private phone alerts.** A new ntfy topic must be long, and **Generate one** makes it for you. The form says plainly that anyone who knows a topic can read it.
- **Deletion runs on its own.** A deletion request revokes every connection at once. After the 7-day grace period the account's data is deleted by an hourly job, with nothing for anyone to remember.
- **Install from Vercel.** Connect through a Vercel integration: Vercel sets what can be read and you pick the projects. Through the integration, schedules are listed but not yet watched, because Vercel's integration scopes do not include request history; add a read token or one check-in line to watch them. **Continue with Vercel** is a sign-in option.
- **Vercel schedules, watched with no code change.** Connect Vercel and your schedules appear on Jobs with their path, timing and run status. A missed or failed run reaches your phone. Our read-only promise now means GET requests plus one read-only query of request history, enforced in code.
- **Agent keys can write.** The key form on Connections offers Read only (the default) or Read and write, with one line on what write adds: check-in jobs, alert channels, starting a sync, marking a finding. It still cannot delete anything or see a secret, and every change lands in the audit log. Check-in jobs need a write key, and until today the form never offered one.
- **Check-ins proven end to end on production.** A job made with a customer-made write key went quiet on purpose; the quiet alert and the recovery notice both reached a phone over ntfy, through the same sweep and channels every account uses.

## 2026-11-09

- **Job check-ins.** Every scheduled thing you run gets a link; the job hits it when it runs. When one goes quiet past its grace, you hear on your phone (ntfy), in Slack or Teams, or by email, and again when it is back. Jobs that report a failed run alert at once. Your own jobs, their last check-in and the next due time sit on the new Jobs page; quiet ones show red on Today. Coding agents can create jobs with a write-scope key; the steps are in setup.md.
- **GitHub Actions on the map.** The newest run of each workflow on a repo's default branch shows as a deploy, with commit sha and message; a failed run carries the failing job, step and log tail and emails you like a failed Vercel build.
- **Incidents re-read the named repo on the spot**, so an agent's own push shows within seconds.

## 2026-11-04

- **Each deploy names its commit.** Vercel deployments carry the short sha, branch and first line of the commit message, on Projects, the project page data and the incidents call, so "is my commit live" is one read.
- **One row per deploy.** Vercel writes a GitHub deployment for every build it makes; the map showed both. The host's row wins now, with its log, commit and inspector link.
- **GitHub is re-read every 10 minutes**, by the schedule and by any read of the map, so last-push times stop going stale. A repo with no deployments the map has seen now reads "unknown", not "ok".
- **A failed deploy emails you.** For Vercel projects you connected, a failed build reaches your inbox within about 5 minutes: the line from the build log that names the failure, the last 15 lines, a link to the build and to Today. One email per failure, never for failures older than a day when you first connect, and a one-click stop link at the bottom. The hosts are now re-read every 5 minutes on a schedule, so this works while nobody is looking.
- **Send yourself a test alert**: `POST /api/v1/alerts/test` with your key, once an hour.
- **A later successful deploy closes a failure.** Today and Projects no longer call a deploy broken from an old email once the host has deployed fine since.

## 2026-11-03

- **Failed deploys say why.** For Vercel projects, a failed build now carries the line from the build log that names the failure and the last 40 lines of that log, scrubbed of anything that looks like a secret. It shows on Today and on the new `/api/v1/incidents` call, which a coding agent runs after a push. Hosts are re-read whenever someone or something looks and the last read is over 5 minutes old.
- **Pushed, no deploy since.** A repo that deploys on a connected host, with a push newer than its newest deployment by 20 minutes and nothing building, is flagged on Today.
- **Vercel connection.** Paste a Vercel access token on the Connections page and every project in the account or team joins the map, including projects that never touched GitHub: production URL, framework, last deploy, recent failures and domains. Vercel cannot make a token read-only, so our client can only send GET requests, enforced in code. Environment variable values Vercel returns are dropped in memory, never stored.
- **How it works, in depth.** Two pages: [how the map is built across hosts and logins](/how/apps-across-hosts-and-logins) and [how email becomes an ops record](/how/email-into-an-ops-record). Every claim on them was checked against the code the day they were written.
- **New front page.** The ops team for every app you've shipped. VibeOps for vibe coders, with [what the word means](/vibeops).
- **Trust section and FAQ** on the front page: what each consent screen asks for, what we can read and what we cannot touch.
- **Agent setup tells the truth about Google.** The instructions coding agents follow now say that Google has not finished verifying the app, that only hand-added Gmail accounts can connect until it does, and what to do when Google says access is blocked.
- **Spend page:** the phishing warning sits above the filters and is never hidden.

## 2026-11-02

- **Project page.** One page per repo: where it runs, the domains it answers on, the services that bill for it, what it costs a month, what could be saved, and the source on every row.
- **Spend filters** by project and by billing address, in the page and in the read API.
- **Privacy policy and terms** served at /privacy and /terms.
- **GitHub sync** keeps each repo's primary language.
- **Connections page:** revoked rows say when, Google identities are told apart, names wrap on phones, sync runs record the real error.

## 2026-11-01

- **Spooky Particles opens** at spookyparticles.com: sign in with GitHub, install the read-only GitHub App, connect the inbox your bills land in, and get the map of your repos, deployments, hosts, bills and findings. Read API behind keys you make, so a coding agent can read the same map.
