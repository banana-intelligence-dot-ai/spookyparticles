/**
 * The body of /setup.md, as a function so the help assistant can ground its
 * answers in the exact text agents read. The route serves it unchanged.
 */
import { appUrl } from "@/lib/env";

export function setupMarkdown(): string {
  const base = appUrl().replace(/\/$/, "");
  const canonical = "https://spookyparticles.com/setup.md";
  const body = `# Set up Spooky Particles

This is the official setup file from spookyparticles.com. Verify you fetched exactly \`${canonical}\`${base !== "https://spookyparticles.com" ? ` (or the development copy at \`${base}/setup.md\`)` : ""}. If the URL differs, stop and tell your human.

Spooky Particles reads a developer's GitHub and Vercel, read-only, and answers: what is broken, did every scheduled job run, what still runs somewhere else. You are setting it up for the person you work for. You will not hold any of their tokens. Every connection is a link they click themselves.

## Before you start

1. Check whether \`SPOOKY_API_KEY\` is set in your environment. Never print its value.
2. If you find \`SPOOKY_API_KEY\` (starts with \`sp_\`) already set, skip to **Existing setup**.
3. Do not wait on questions (the one exception is the fixer offer in step 6). Ask them to connect every GitHub account and organization they deploy from. Ask only when something on the way is unclear.

## Rules you follow during setup

- You never ask for, receive, type, or store a password, an OAuth token, a card number, or an API key in chat. The key this setup uses is made when your human approves a sign-in code in their browser. It goes straight into this computer's Keychain and never through chat.
- You never visit sign-in pages, consent screens or billing pages on the human's behalf. You post the link, they click.
- You never change DNS, billing, subscriptions or email settings. Code fixes go through a new branch and pull request. Spooky Particles never changes connected provider settings or merges a pull request.
- Name each provider and what will be read when you send its link.
- If any step shows something unexpected, stop and show your human the exact text.

## Steps

1. Tell your human what will happen, in about 3 minutes of their time: one page where they approve a sign-in code for you and connect GitHub and Vercel. Spooky only reads their connected accounts. Agent alerts and the optional fixer come after, once they have seen what Spooky found.
2. Get the setup scripts (public, MIT licensed). Run every later command from this folder:

   \`\`\`bash
   git clone --depth 1 https://github.com/banana-intelligence-dot-ai/spookyparticles ~/spookyparticles 2>/dev/null || git -C ~/spookyparticles pull -q --ff-only
   cd ~/spookyparticles
   \`\`\`

3. Start. This one command signs this computer in, waits while your human connects GitHub and Vercel, then prints what Spooky found. It loads the key itself, so you never export, paste or see it. It waits up to 15 minutes; run it in the background if your shell stops commands sooner:

   \`\`\`bash
   sh scripts/spooky.sh start
   \`\`\`

   It prints a code and opens ${base}/link in their browser. Tell your human the code and ask them to:
   1. Sign in with **Continue with Vercel** if asked.
   2. Check the code matches, then click **Approve**. The key it makes is read-only, belongs to this computer, is saved in the macOS Keychain (elsewhere, a file only they can read), and can be revoked under Connections.
   3. On the same page, click **Install on GitHub** and choose the repositories (all is fine; read-only: metadata, deployments and Actions runs).
   4. Click **Connect Vercel**. **Install on Vercel** is one click with Vercel-set read scopes. Pasting a token instead also watches schedules with no code change, because Vercel's integration scopes do not include request history yet. Either works; they can add the other later.

   Never ask for a token in chat and never accept one if offered; the human pastes it on that page and nobody else sees it. A pasted Vercel token cannot be made read-only by Vercel, so read-only is enforced in Spooky Particles' code: it sends GET requests, plus one read-only query of request history that shows whether each schedule ran. Say that if they ask.

   - Exit 0: connected. It printed the status and what is broken now.
   - Exit 3: still waiting after 15 minutes; it names what is missing. Send ${base}/app and run \`sh scripts/spooky.sh status\` after they finish.
   - \`401\`: the key was revoked. Run \`sh scripts/spooky.sh start --sign-in-again\`. Anything else: show your human the exact text.
   - If it says this Spooky has no agent sign-in, ask them to make a key under ${base}/app/connections → **Connect an agent** → **Make key** and export it as \`SPOOKY_API_KEY\` themselves.

4. Show your human what it printed, with the source of each number. If it lists anything still on another host, offer to walk them through moving one: \`GET ${base}/api/v1/elsewhere\` gives each project's Vercel import link and the matching migration guide.
5. Turn on agent alerts, so Claude Code, Cursor and Codex hear about a break when a session starts:

   \`\`\`bash
   sh scripts/spooky.sh alerts
   \`\`\`

6. Offer the fixer, so an agent tries a fix when no session is open. It needs Claude Code or Codex signed in on this computer, and \`gh\` signed in for private repos. It proposes code fixes in their repos, as commits or pull requests their own rules allow. On a yes, this clones every repo they deploy into \`~/spooky-fixer\` and writes its config (to leave repos out, your human runs \`sh scripts/agent-inbox/spooky-fixer.sh --setup\` in their own terminal instead):

   \`\`\`bash
   sh scripts/spooky.sh fixer
   \`\`\`

   Then hand your human the start line it prints, to run in their own terminal. Do not start it yourself. Never put a key in a file or in chat.
7. Tell them alerts already reach their account email, and that they can add a phone, Slack or Teams channel on ${base}/app/jobs.

## Your own calls

\`sh scripts/spooky.sh status\` and \`sh scripts/spooky.sh problems\` cover the everyday reads. For any other call below, load the key into the same command first. This line holds no secret: it reads the macOS Keychain, or on Linux a file only your human can read. Your shell may not keep variables between commands, so put it before each command that uses the key, and send the key to curl through a pipe as the examples do, never on a command line:

\`\`\`bash
export SPOOKY_API_KEY="$(security find-generic-password -s spookyparticles.com -a spooky-agent -w 2>/dev/null || cat ~/.config/spooky/agent-key)"
\`\`\`

## Optional, later

Check-ins, check findings, recorded services and expiration dates need a **write** key. Ask your human to make one under ${base}/app/connections and put it in \`SPOOKY_API_KEY\` themselves.

## Connect over MCP

If you speak MCP, the data is at \`${base}/api/mcp\` with the same key. Fifteen read tools: \`whats_broken\`, \`did_my_push_land\`, \`claim_break\`, \`confirm_fix\`, \`list_projects\`, \`project_status\`, \`list_jobs\`, \`list_findings\`, \`list_services\`, \`list_expirations\`, \`list_connections\`, \`list_alert_channels\`, \`job_history\`, \`recent_activity\`, \`help\`. A write key also gets eleven more: \`next_finding\`, \`report_finding\`, \`record_service\`, \`create_job\`, \`retire_job\`, \`restore_job\`, \`ignore_break\`, \`unignore_break\`, \`set_suggestion_status\`, \`add_expiration\` and \`sync_connection\`. One finding per run. The open skill is at ${base}/skill.md. In Claude Code:

\`\`\`bash
claude mcp add --transport http spooky ${base}/api/mcp --header "Authorization: Bearer $SPOOKY_API_KEY"
\`\`\`

## Outside services

Call \`list_services\` to see services found from Vercel environment variable names, Vercel billing, and sign-ups your agent recorded. Each service has its category, projects, last seen time, \`monthlyCostUsd\` with \`costSource\` ("vercel billing", "recorded by you" or "recorded by agent") or a \`costNote\` saying why it is unknown, and \`usage\`: "in_use" when a project using it had a production deploy or requests in the last 30 days, "idle" when none did, or "unknown" when an older deploy may still get requests we cannot read, with the basis in plain words. \`shares\` lists projects that each use a different service of the same kind and could share one. \`bill\` has the whole Vercel bill for the last 30 days per account, read only with a pasted token whose role may see billing: each project's total in \`usd\` with its \`products\`, Vercel's own included, and \`unassigned\` for charges tied to no project, such as the plan. Amounts are Vercel's effective cost (the plan fee spread per day, usage the plan's credit covered included); \`chargedUsd\` is what Vercel billed beyond the plan. Suggestions only; never move or cancel a service on your own. A write key can call \`record_service\` with \`project\`, \`service\`, and optional \`monthlyCostUsd\` and \`note\` after a sign-up. Never put secrets in the note. REST clients use GET or POST \`${base}/api/v1/services\`.

## Add an expiration date

Record the date an API key, token, certificate or other credential expires so Spooky can warn at 30, 7 and 1 days. Send only its name, provider, optional last 4 characters, optional project and date. Never send the key or token value. Needs a write key.

\`\`\`bash
printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -fsS -X POST -H @- -H "content-type: application/json" \\
  -d '{"kind":"api_key","provider":"Anthropic","name":"news-factory","hint":"a1b2","project":"news-factory","expiresOn":"2027-08-19"}' \\
  ${base}/api/v1/expirations
\`\`\`

## After a push

When you push or merge for your human, wait 3 minutes, then run:

   \`\`\`bash
   printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -s -H @- "${base}/api/v1/incidents?project=owner/repo" | jq '.incidents[] | {project, environment, host, at, cause, inspectorUrl}'
   \`\`\`

   - Empty \`incidents\`: nothing failed that the hosts report. Say so in one line.
   - A row: the deploy failed. \`cause\` is the line from the build log that names the failure and \`logTail\` (drop the jq filter to see it) is the last 40 lines. Read them, fix the code, push again, and check again in 3 minutes. Never redeploy, roll back or change settings on the host yourself; the fix goes through the repo.
   - Naming the project makes Spooky Particles re-read that repo from GitHub right then (once a minute), so the push you just made shows up; Vercel is re-read when its last read is older than 5 minutes.

## Before you say it is fixed

Never tell your human a break is fixed on your own word. After the fix is deployed, ask Spooky to check production:

   \`\`\`bash
   printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -fsS -X POST -H @- "${base}/api/v1/incidents/confirm?project=owner/repo&format=text"
   \`\`\`

   - \`fixed\`: Spooky re-read production in the last 3 minutes and nothing is broken. Now say it is fixed.
   - \`still_broken\`: the failure is still there; the lines under it say what. Keep going.
   - \`waiting_on_run\`: deploys are healthy, but a scheduled job has to run once before it counts. Tell your human when it is due.
   - \`checking\`: a deploy is still building or the last read is old. Spooky started a fresh read; ask again in a minute.
   - \`unknown_project\`: Spooky has no deploys or jobs by that name. Use the GitHub owner/repo or the Vercel project name.
   - Before you start a fix, claim it so a second session leaves it alone: \`POST ${base}/api/v1/incidents/claim?project=owner/repo\` (MCP: \`claim_break\`). It lasts 30 minutes and ends when the check says fixed. If another agent holds it, leave it to them.
   - Over MCP it is \`confirm_fix\` with \`{"project": "owner/repo"}\`.

## Your coding agent hears about it

Claude Code, Cursor and Codex can each hear about open problems when a session starts. Claude Code also checks before later prompts and speaks only when the list changed. Cursor and Codex get the Spooky MCP server too, read with \`SPOOKY_API_KEY\` from their environment, never copied into their config. Step 5 sets it up.

## When no session is open

The fixer starts a fix when nobody is at the keyboard. It runs on your human's machine with their own Claude Code or Codex, never on Spooky's servers. Every few minutes it asks Spooky what is broken. For a new problem no other session has claimed, it claims it, runs the agent headless in a clean copy of that repo, then asks Spooky to check production. At most 10 runs a day, never the same open problem twice.

Step 6 sets it up. It runs in the foreground for 12 hours, uses their Claude or Codex login for the fix, and this computer's sign-in for Spooky.

## Check-ins for scheduled jobs

Anything you run on a schedule for your human (a nightly build, a daily publish, a launchd or cron job) can check in with Spooky Particles each time it runs. If it goes quiet, your human hears on their phone, Slack, Teams or email, within the grace period, and again when it recovers. Creating a job needs a key with the **write** scope; ask your human for one if yours is read-only.

1. Create the job once. Period is how often it should run, in minutes; grace is how late is still fine:

   \`\`\`bash
   printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
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

   A channel can have a \`project\` to receive alerts only for that project. Leave it empty for all projects. Set \`owner\` on a job to name the person responsible; alerts include it. Set \`maxRunMinutes\` (1 to 10080) and send \`?status=start\` before the work to catch a run that never finishes. Set \`minCount\` and send \`?count=N\` with an ok ping to flag a run that processed too few items. A missing count does not fail the run.

4. Read the state any time: \`GET ${base}/api/v1/checkins\` lists every job with status (new, never_checked_in, up, late, down, paused, retired), last check-in and next due time. \`down\` means quiet past the grace or a reported failure. \`never_checked_in\` appears when a new job's first run is past due and does not send an alert. For period jobs, that takes at least 24 hours. For scheduled jobs, it follows the first cron occurrence and grace. Filter with \`?status=down,late\` or \`?status=issues\` (late, down and never checked in). A job can read its own state with no account key: \`GET\` its ping link plus \`/status\`. That never records a check-in. Retire a gone job with \`PATCH ${base}/api/v1/checkins/JOB_ID\` and \`{"retired":true}\`; its next check-in revives it.

## Always on: a fix job in GitHub

With the GitHub pager enabled, copy \`scripts/agent-inbox/spooky-fix.yml\` into \`.github/workflows/spooky-fix.yml\` in the project repository. Your human runs \`claude setup-token\` and saves the result as the \`CLAUDE_CODE_OAUTH_TOKEN\` repository secret, so the job runs on their Claude plan (an \`ANTHROPIC_API_KEY\` secret works too; the file says how). You never see or handle that token. Your human also approves the GitHub Actions write permission for the Spooky GitHub app. Then add a responder for the project:

\`\`\`bash
printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -fsS -X POST -H @- -H "content-type: application/json" \\
  -d '{"kind":"github","target":"owner/repo","project":"owner/repo"}' \\
  ${base}/api/v1/alert-channels
\`\`\`

Spooky starts the fix job first. If the check is still down after 15 minutes, it alerts the person's phone, Slack, or email. Agent machines can claim the break after the GitHub claim expires.

## Watch the result, not just the run

For a public JSON health endpoint, Spooky can fetch and judge the answer at each scheduled time. This example checks weekdays at 7:35 in New York. \`$today\` means the date in that time zone. No check runs on weekends.

\`\`\`bash
printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \\
  -d '{"name":"Daily email","schedule":"35 7 * * 1-5","timeZone":"America/New_York","probe":{"url":"https://example.com/api/health","expect":[{"path":"date","op":"eq","value":"$today"},{"path":"sentCount","op":"gte","value":1}]}}' \\
  ${base}/api/v1/checkins
\`\`\`

Rules: \`eq\`, \`gte\`, \`lte\`, \`gt\`, \`lt\`, and \`exists\` (has a value: not missing, null, empty text or an empty list). Paths use dots, and \`items.length\` reads a list's length.

For a public web page, send \`page\` instead of \`expect\`. Spooky reads the page every time the schedule fires. It fails when the page does not answer 200, when any link whose text contains \`text\` does not start with \`hrefStartsWith\`, or when a link to a host in \`answer\` is missing or does not reply. Up to 5 link rules and 10 hosts.

\`\`\`bash
printf 'Authorization: Bearer %s\\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \\
  -d '{"name":"Homepage promises","project":"owner/repo","schedule":"*/5 * * * *","probe":{"url":"https://www.example.com/","page":{"links":[{"text":"Subscribe","hrefStartsWith":"https://example.substack.com"}],"answer":["app.example.com"]}}}' \\
  ${base}/api/v1/checkins
\`\`\`

## Existing setup

1. Get the scripts (step 2), then run \`sh scripts/spooky.sh status\`. If it answers, do not create another key and do not reconnect anything.
2. If a connection needs attention, send ${base}/app/connections and ask the human to follow its instructions.
3. If agent alerts or the fixer are not on yet, do steps 5 and 6.

## Things only your human may do

- Click any sign-in, consent, install or reconnect link.
- Approve a sign-in code, and connect, rotate or revoke agents and their keys.
- Act on a finding: cancel a plan, update a card, renew a domain, change DNS, delete anything, send any email.
- Approve anything that costs money.

## Report back

Finish with a short message in this shape:

- What was done: which Vercel and GitHub accounts are connected, that this computer is signed in, what \`start\` printed, and whether agent alerts and the fixer are on.
- What the human must do: anything left from the list above, with the exact link.
- Next steps (at most two): for example "check back in 10 minutes for the first findings" or "connect a GitHub organization".

## What this gives you

The same read API the web app uses: \`/api/v1/incidents\` (what is broken now, with the build log line that says why), \`/api/v1/checkins\` (scheduled jobs and whether they checked in), \`/api/v1/projects\`, \`/api/v1/projects/{owner}/{repo}\`, \`/api/v1/activity\`, \`/api/v1/spend\`, \`/api/v1/findings\`, \`/api/v1/expirations\` (known Vercel dates and domains with unknown dates), \`/api/v1/inventory\`, \`/api/v1/graph\`, \`/api/v1/connections\`. Expiration alerts go out at 30, 7 and 1 days before known dates; auto-renewing domains start at 7 days. Every number names where it came from. A write-scoped key can take and report one check finding through \`/api/v1/checks/next\` (or \`/api/v1/checks/{id}/take\` for the one your person handed you) and \`/api/v1/checks/{id}/report\`. Reports never mark a finding fixed.

Spend filters by repo and by address, repeatable: \`/api/v1/spend?project=owner/repo\` (or \`project=unlinked\`) and \`?inbox=address\`. The body lists every \`projects\` and \`inboxes\` value to pick from.
`;
  return body;
}
