/** Plain summary for AI crawlers. Keep each claim tied to the live product. */
const BODY = `# Spooky Particles

> When an app you shipped quietly stops, Spooky Particles tells your phone and gives your coding agent the evidence.

Spooky Particles is for people who deploy on Vercel. It is made by Banana Intelligence LLC at spookyparticles.com. Every fact names its source.

## Start
- Sign in with Vercel. Accounts made before 10 November 2026 can still use GitHub or Google.
- Connect Vercel through its integration or with a pasted read token. Connect GitHub with read-only access.
- The Vercel integration uses Vercel's read scopes and lets you choose projects. It lists schedules but cannot watch their runs alone.
- Vercel cannot make a pasted token read-only. Spooky Particles enforces read-only access in code with GET requests and one read-only request history query.

## What it does today
- Schedules: lists every Vercel cron job and schedule, with path and timing. A read token watches runs without a code change. Missed runs and error responses trigger alerts. Recovery triggers another alert. Add one check-in line to watch through the integration alone.
- Check-ins: any scheduled job can hit a link when it runs. Silence past its grace period triggers an alert.
- Alerts reach a phone through ntfy, Slack, Teams or email, routed per project, plus a daily digest.
- Agent inbox: open problems reach Claude Code sessions at start, with the build log line or job note. Any agent can ask through /api/v1/incidents or MCP.
- Outcome checks (new): Spooky reads a public JSON URL on a schedule and judges the answer, for example 'date is today, sentCount at least 1'.
- Failed deploys: alerts name the cause from a build log line for Vercel and GitHub Actions.
- Expirations: the Check page, /api/v1/expirations and MCP list_expirations show published Vercel Node.js runtime deprecations and registration dates Vercel returns for its domains. Domains registered elsewhere have an unknown date. Alerts go out at 30, 7 and 1 days before a known date; auto-renewing domains start at 7 days.
- Map: Vercel projects, GitHub repos, GitHub Actions runs and domains, with the commit each deploy carries.
- Other hosts: finds apps on Netlify, Render, Railway, Fly.io, Heroku, Cloudflare, AWS or GitHub Pages from deploy data. Each row links to Vercel import and a Vercel migration guide.
- Coding agents: Read keys can look at account data. Write keys can change and remove Spooky records, including jobs, expirations, alert channels, findings and connections. Full control keys add key management, agent sign-in approval and account deletion. Every change is audited. The MCP server at /api/mcp has twenty-three read tools: public_feed, agent_first, list_expirations, whats_broken, did_my_push_land, commit_outcome, claim_break, confirm_fix, list_projects, project_status, list_jobs, list_findings, list_services, list_connections, list_alert_channels, job_history, recent_activity, open_items, fix_history, list_agents, list_mutes, export_data, help. Write keys get thirty-two more: next_finding, report_finding, record_service, create_job, update_job, retire_job, restore_job, clear_notice, restore_notice, mute, unmute, ignore_break, unignore_break, set_suggestion_status, add_expiration, update_expiration, set_vendor_scope, recompute_spend_findings, read_billing_mail, set_public_feed, set_agent_first, sync_connection, add_alert_channel, update_alert_channel, remove_alert_channel, test_alert_channel, send_test_alert, delete_job, delete_expiration, dismiss_check, restore_check, revoke_connection. Full control keys get seven more: list_api_keys, create_api_key, revoke_api_key, approve_agent_sign_in, delete_account, cancel_account_deletion, account_deletion_status. The controls also have REST endpoints under /api/v1. Setup instructions are at /setup.md. The open skill is at /skill.md.
- Optional Gmail: a read-only inbox for bills and renewals, by request. Google has not finished verifying the app. Spend appears as a column, not a reason to connect.

## Security
- Read-only by default. It never deletes resources in connected accounts.
- Access is recorded in an audit log. Environment variable values are never stored.

## Pages
- [Home](https://spookyparticles.com/)
- [VibeOps](https://spookyparticles.com/vibeops)
- [How the map works](https://spookyparticles.com/how/apps-across-hosts-and-logins)
- [Optional email](https://spookyparticles.com/how/email-into-an-ops-record)
- [Releases](https://spookyparticles.com/releases)
- [Agent setup](https://spookyparticles.com/setup.md)
- [Agent skill](https://spookyparticles.com/skill.md)
- [Privacy policy](https://spookyparticles.com/privacy)
- [Terms of service](https://spookyparticles.com/terms)

Contact: hello@spookyparticles.com
`;

export function GET() {
  return new Response(BODY, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
