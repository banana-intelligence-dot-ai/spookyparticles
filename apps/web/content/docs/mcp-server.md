# MCP server

The Spooky MCP server is at `https://spookyparticles.com/api/mcp`. It takes the same key as the REST API.

## Connect Claude Code

```bash
claude mcp add --transport http spooky https://spookyparticles.com/api/mcp --header "Authorization: Bearer $SPOOKY_API_KEY"
```

Cursor and Codex can use the server too. Read the key from `SPOOKY_API_KEY` in their environment. Never copy it into their config.

## What each key can do

- A read key can look at account data.
- A write key can also change and remove Spooky records, such as jobs, expirations, alert channels, findings and connections.
- A full control key adds key management, agent sign-in approval and account deletion.

Every change is recorded in the audit log. Call `help` to see the tools your key gets.

## Tools by purpose

**What is broken**
- `whats_broken`, `open_items`, `did_my_push_land`, `commit_outcome`
- After a push, `did_my_push_land` with `sha` and `expectText` (and `path`, default `/`) says whether the commit is live and the production page shows the text. `live` is true only when both pass. REST: `GET /api/v1/push-check`.
- `claim_break` and `confirm_fix`: claim a break so a second session leaves it alone, then ask Spooky to check production.

**Projects and jobs**
- `list_projects`, `project_status`, `list_jobs`, `job_history`, `recent_activity`, `fix_history`
- Write: `create_job`, `update_job`, `retire_job`, `restore_job`

**Alarm checks**
- `list_alarms`, and write tools `mark_alarm` and `unmark_alarm`. See [Alarm checks](/docs/alarms).

**Alerts and noise**
- `list_alert_channels`, `list_mutes`
- Write: `add_alert_channel`, `update_alert_channel`, `remove_alert_channel`, `test_alert_channel`, `send_test_alert`, `mute`, `unmute`

**Findings and services**
- `list_findings`, `list_services`, `list_expirations`, `agent_view` (what an AI agent gets from each site)
- Write: `next_finding`, `report_finding`, `record_service`, `add_expiration`

**Keys and account**
- `list_agents`, `list_connections`, `export_data`
- Full control: `list_api_keys`, `create_api_key`, `revoke_api_key`, `approve_agent_sign_in`

This is a short list. `help` has the full one.
