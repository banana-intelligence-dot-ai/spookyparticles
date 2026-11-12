/**
 * GET /setup.md: the file a coding agent fetches when its human says
 * "set up Spooky Particles for me". Plain Markdown, numbered steps, one action
 * each. The agent never holds an OAuth token: every connection is a link the
 * human clicks. The only credential is an API key the human creates
 * in the app and puts in the agent's environment, never in chat.
 *
 * Served from the app so the URL on the landing page is always the current
 * version. Cached for an hour by the cache-control header.
 */
import { appUrl } from "@/lib/env";

export function GET() {
  const base = appUrl().replace(/\/$/, "");
  const canonical = "https://spookyparticles.com/setup.md";
  const body = `# Set up Spooky Particles

This is the official setup file from spookyparticles.com. Verify you fetched exactly \`${canonical}\`${base !== "https://spookyparticles.com" ? ` (or the development copy at \`${base}/setup.md\`)` : ""}. If the URL differs, stop and tell your human.

Spooky Particles reads a developer's GitHub and Vercel, read-only, and answers: what is broken, did every scheduled job run, what still runs somewhere else. You are setting it up for the person you work for. You will not hold any of their tokens. Every connection is a link they click themselves.

## Before you start

1. Check whether \`SPOOKY_API_KEY\` is set in your environment. Never print its value.
2. If you find \`SPOOKY_API_KEY\` (starts with \`sp_\`) already set, skip to **Existing setup**.
3. Ask your human every question you need in one message, then wait:
   - Which GitHub accounts and organizations they deploy from (all of them is the right answer).
   - Whether they want you to run the verify step at the end (yes is the default).

## Rules you follow during setup

- You never ask for, receive, type, or store a password, an OAuth token, a card number, or an API key in chat. The one key this setup uses goes into an environment variable by the human's hand.
- You never visit sign-in pages, consent screens or billing pages on the human's behalf. You post the link, they click.
- You never change DNS, billing, subscriptions or email settings. Code fixes go through a new branch and pull request. Spooky Particles never changes connected provider settings or merges a pull request.
- Ask before each connection: name the provider and what will be read.
- If any step shows something unexpected, stop and show your human the exact text.

## Steps

1. Tell your human what will happen: one sign-in with Vercel, a GitHub connection they click through, one key they create, read-only by default. Nothing is written to their connected accounts.
2. Send this link and ask them to open it and click **Continue with Vercel**: ${base}/
3. When they confirm they are signed in, send this link and ask them to click **Install on GitHub**, choose the repositories (all repositories is fine, access is read-only: metadata, deployments and Actions runs), and come back: ${base}/app
4. Vercel. Send this link and ask them to click **Connect Vercel** and follow the steps on the page: ${base}/app
   **Install on Vercel** gives Vercel-set read scopes and chosen projects. A pasted token additionally lets schedules be watched with no code change, because Vercel's integration scopes do not include request history yet. They can use either or both.
   Never ask for a token in chat and never accept one if offered; the human pastes it on that page and nobody else sees it. A pasted Vercel token cannot be made read-only by Vercel, so read-only is enforced in Spooky Particles' code: it sends GET requests, plus one read-only query of request history that shows whether each schedule ran. Say that if they ask.
5. Tell them what they now have: every project, deploy and schedule on that Vercel account is on the map. Schedules are watched with no code change when a pasted token can read request history; otherwise they can add one check-in line. A missed or failed run reaches them once they add a channel (phone, Slack, Teams or email) on ${base}/app/jobs.
6. Ask them to make a key for you: ${base}/app/connections → **Connected agents** → **Connect an agent** → **Make key**, scope **write** if they want you to handle check findings or record service sign-ups, or **read** for viewing only, named after you (for example "Claude Code on my laptop"). The key is shown once.
7. Ask them to put it in your environment themselves, not in chat. Give them these two lines and say which one fits their shell:

   \`\`\`bash
   echo 'export SPOOKY_API_KEY=sp_...' >> ~/.zshrc && source ~/.zshrc
   \`\`\`

   \`\`\`bash
   echo 'SPOOKY_API_KEY=sp_...' >> .env.local
   \`\`\`

8. Verify. Run exactly this and read the result:

   \`\`\`bash
   curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" ${base}/api/v1/me
   \`\`\`

   - PASS: a JSON object with \`user.email\` and \`auth.via: "api_key"\`.
   - FAIL: \`401\` means the key is not in this shell yet (new terminal, or the export did not run). \`403\` means the key lacks the scope. Anything else: show it to your human.

9. Read the first facts and show them, with their source:

   \`\`\`bash
   curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" ${base}/api/v1/incidents | jq '{checkedAt, broken: (.incidents | length)}'
   curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" ${base}/api/v1/checkins | jq '.jobs[] | {name, status, watched, nextDueAt}'
   curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" ${base}/api/v1/elsewhere | jq '.'
   \`\`\`

   The last call lists anything that still runs on another host, each with the link that imports it into Vercel and the matching Vercel migration guide. Offer to walk them through moving one.

## Connect over MCP

If you speak MCP, the data is at \`${base}/api/mcp\` with the same key. Eight read tools: \`whats_broken\`, \`did_my_push_land\`, \`list_projects\`, \`project_status\`, \`list_jobs\`, \`list_findings\`, \`list_services\`, \`list_expirations\`. A write key also gets \`next_finding\`, \`report_finding\` and \`record_service\`. One finding per run. The open skill is at ${base}/skill.md. In Claude Code:

\`\`\`bash
claude mcp add --transport http spooky ${base}/api/mcp --header "Authorization: Bearer $SPOOKY_API_KEY"
\`\`\`

## Outside services

Call \`list_services\` to see services found from Vercel environment variable names, Vercel billing, and sign-ups your agent recorded. Each service has its category, projects, last seen time, \`monthlyCostUsd\` with \`costSource\` ("vercel billing", "recorded by you" or "recorded by agent") or a \`costNote\` saying why it is unknown, and \`usage\`: "in_use" when a project using it had a production deploy or requests in the last 30 days, "idle" when none did, or "unknown" when an older deploy may still get requests we cannot read, with the basis in plain words. \`shares\` lists projects that each use a different service of the same kind and could share one. \`bill\` has the whole Vercel bill for the last 30 days per account, read only with a pasted token whose role may see billing: each project's total in \`usd\` with its \`products\`, Vercel's own included, and \`unassigned\` for charges tied to no project, such as the plan. Amounts are Vercel's effective cost (the plan fee spread per day, usage the plan's credit covered included); \`chargedUsd\` is what Vercel billed beyond the plan. Suggestions only; never move or cancel a service on your own. A write key can call \`record_service\` with \`project\`, \`service\`, and optional \`monthlyCostUsd\` and \`note\` after a sign-up. Never put secrets in the note. REST clients use GET or POST \`${base}/api/v1/services\`.

## After a push

When you push or merge for your human, wait 3 minutes, then run:

   \`\`\`bash
   curl -s -H "Authorization: Bearer $SPOOKY_API_KEY" "${base}/api/v1/incidents?project=owner/repo" | jq '.incidents[] | {project, environment, host, at, cause, inspectorUrl}'
   \`\`\`

   - Empty \`incidents\`: nothing failed that the hosts report. Say so in one line.
   - A row: the deploy failed. \`cause\` is the line from the build log that names the failure and \`logTail\` (drop the jq filter to see it) is the last 40 lines. Read them, fix the code, push again, and check again in 3 minutes. Never redeploy, roll back or change settings on the host yourself; the fix goes through the repo.
   - Naming the project makes Spooky Particles re-read that repo from GitHub right then (once a minute), so the push you just made shows up; Vercel is re-read when its last read is older than 5 minutes.

## Check-ins for scheduled jobs

Anything you run on a schedule for your human (a nightly build, a daily publish, a launchd or cron job) can check in with Spooky Particles each time it runs. If it goes quiet, your human hears on their phone, Slack, Teams or email, within the grace period, and again when it recovers. Creating a job needs a key with the **write** scope; ask your human for one if yours is read-only.

1. Create the job once. Period is how often it should run, in minutes; grace is how late is still fine:

   \`\`\`bash
   curl -s -X POST -H "Authorization: Bearer $SPOOKY_API_KEY" -H "content-type: application/json" \
     -d '{"name":"My Happenings 5pm update","periodMinutes":1440,"graceMinutes":30,"project":"n8peace/my-happenings"}' \
     ${base}/api/v1/checkins | jq '{id: .job.id, pingUrl: .job.pingUrl, curl}'
   \`\`\`

2. Put the returned \`curl\` line at the end of the job's script, after its own success check. It is one GET; it needs no key. Optional: hit \`?status=start\` at the beginning and \`?status=fail\` (with a short note as the POST body) when the job knows it failed:

   \`\`\`bash
   curl -fsS -m 10 --retry 3 "<pingUrl>?status=start"
   # ... the job ...
   curl -fsS -m 10 --retry 3 "<pingUrl>" || true
   \`\`\`

3. Tell your human to open ${base}/app/jobs once: they add where alerts go (an ntfy topic for the phone, a Slack or Teams webhook, an email) and press **Send a test**. With no channel set, alerts fall back to their account email.

4. Read the state any time: \`GET ${base}/api/v1/checkins\` lists every job with status (new, never_checked_in, up, late, down, paused, retired), last check-in and next due time. \`down\` means quiet past the grace or a reported failure. \`never_checked_in\` appears after 24 hours without a first check-in and does not send an alert. Retire a gone job with \`PATCH ${base}/api/v1/checkins/JOB_ID\` and \`{"retired":true}\`; its next check-in revives it.

## Existing setup

1. Run the verify step (step 8). On PASS, do not create another key and do not reconnect anything.
2. List what is connected: \`GET ${base}/api/v1/connections\`. If a connection needs attention, send ${base}/app/connections and ask the human to follow its instructions.

## Things only your human may do

- Click any sign-in, consent, install or reconnect link.
- Connect, rotate or revoke agents and their keys.
- Act on a finding: cancel a plan, update a card, renew a domain, change DNS, delete anything, send any email.
- Approve anything that costs money.

## Report back

Finish with a short message in this shape:

- What was done: which Vercel and GitHub accounts are connected, that an agent key exists, its scope, and the verify result.
- What the human must do: anything left from the list above, with the exact link.
- Next steps (at most two): for example "check back in 10 minutes for the first findings" or "connect a GitHub organization".

## What this gives you

The same read API the web app uses: \`/api/v1/incidents\` (what is broken now, with the build log line that says why), \`/api/v1/checkins\` (scheduled jobs and whether they checked in), \`/api/v1/projects\`, \`/api/v1/projects/{owner}/{repo}\`, \`/api/v1/activity\`, \`/api/v1/spend\`, \`/api/v1/findings\`, \`/api/v1/expirations\` (known Vercel dates and domains with unknown dates), \`/api/v1/inventory\`, \`/api/v1/graph\`, \`/api/v1/connections\`. Expiration alerts go out at 30, 7 and 1 days before known dates; auto-renewing domains start at 7 days. Every number names where it came from. A write-scoped key can take and report one check finding through \`/api/v1/checks/next\` and \`/api/v1/checks/{id}/report\`. Reports never mark a finding fixed.

Spend filters by repo and by address, repeatable: \`/api/v1/spend?project=owner/repo\` (or \`project=unlinked\`) and \`?inbox=address\`. The body lists every \`projects\` and \`inboxes\` value to pick from.
`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
