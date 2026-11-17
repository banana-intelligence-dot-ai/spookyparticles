# REST API

The API lives under `https://spookyparticles.com/api/v1`. It is the same API the web app uses.

## Keys

Send a key as a bearer token. Keys start with `sp_`. A person makes keys under `/app/agents`.

```bash
printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -s -H @- https://spookyparticles.com/api/v1/incidents
```

This form keeps the key out of your shell history and process list.

- **Read** keys can look at account data.
- **Write** keys can also create, change and remove Spooky records.
- **Full control** keys add key management, agent sign-in approval and account deletion.

## Endpoints

| Path | What it is |
|---|---|
| `/incidents` | What is broken now, with the log line that says why. |
| `/checkins` | Scheduled jobs and whether they checked in. See [Check-ins](/docs/check-ins). |
| `/alarms` | Alarm checks. See [Alarm checks](/docs/alarms). |
| `/mutes` | What is muted. POST to mute, DELETE to watch again. Needs write. |
| `/projects` | Your projects. |
| `/projects/{owner}/{repo}` | One project. |
| `/activity` | Recent activity. |
| `/spend` | Spend by project. |
| `/findings` | Check findings. |
| `/expirations` | Known Vercel dates and domains with unknown dates. |
| `/inventory` | What Spooky found. |
| `/graph` | The map. |
| `/connections` | Connected accounts. |

GET reads. Changing anything needs a write key.

## Errors

Errors share one shape.

```json
{ "error": { "code": "insufficient_scope", "message": "This key lacks the \"write\" scope" } }
```

| Status | Code | Meaning |
|---|---|---|
| 401 | `invalid_api_key` | The key is unknown, revoked or expired, or the header is not `Bearer sp_...`. |
| 403 | `insufficient_scope` | The key lacks the scope this call needs. |
| 404 | `not_found` | No such record. |
| 400 | varies | The body failed a check. The message says which field. |
