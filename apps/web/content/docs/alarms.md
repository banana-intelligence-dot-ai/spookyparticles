# Alarm checks

Some checks are built to fail when something in the real world needs attention. An example is a GitHub Actions workflow that fails on purpose when image coverage drops under a floor.

Mark that check as an alarm. Then a failure reads as an alarm, not "deploy failed". Any fix job is told to fix what the check measures, and never to weaken the check.

You can mark a GitHub Actions workflow, or a check-in job, on a project.

## Mark one

Marking needs a write key. The `check` is the workflow name, the workflow file, or the job name. `note` is optional and says what it watches.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X POST -H @- -H "content-type: application/json" \
  -d '{"project":"owner/repo","check":"Watch visual coverage","note":"image coverage floor"}' \
  https://spookyparticles.com/api/v1/alarms
```

## List them

Listing needs a read key.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -H @- https://spookyparticles.com/api/v1/alarms
```

## Unmark one

Send the same `project` and `check` with DELETE.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -X DELETE -H @- -H "content-type: application/json" \
  -d '{"project":"owner/repo","check":"Watch visual coverage"}' \
  https://spookyparticles.com/api/v1/alarms
```

Every change is recorded in the audit log.

## MCP tools

Your agent can do the same over MCP. See [MCP server](/docs/mcp-server).

| Tool | Key | What it does |
|---|---|---|
| `list_alarms` | read | Lists alarm checks. |
| `mark_alarm` | write | Marks a check as an alarm. |
| `unmark_alarm` | write | Clears the mark. |
