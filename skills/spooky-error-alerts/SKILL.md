---
name: spooky-error-alerts
description: Make sure someone hears when a Vercel project's server errors spike. Use when asked about 500 errors, error alerts, or "know when the site is throwing errors".
---

# Server error alerts

Covers Standard item 3: someone hears when server errors spike. See [the Standard, Keep it running](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-running).

Spooky alerts when a project has 10 or more server errors (5xx) and they are 20% or more of production traffic over 15 minutes. It alerts again on recovery. To read traffic it needs a read token for the Vercel team.

## Check

1. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`, piped in with `curl -H @-` so the key never sits on a command line). If checks for this project show the reason `needs_read_token`, Spooky cannot read its traffic, so error spikes are not watched.
2. Call `GET https://spookyparticles.com/api/v1/alert-channels`. At least one channel should be listed.
3. In the code, look for errors that are swallowed. A route that catches every error and answers 200 hides failures from any monitor. Search for `catch` blocks in route handlers that return a success status.

## Fix

- **`needs_read_token`:** a step for the person. Tell them: "Open spookyparticles.com, Connections. Next to this Vercel team, add a read token. Make it in Vercel, Account Settings, Tokens, scoped to this team. Paste it into Spooky, not into chat." The agent never makes, sees or pastes the token.
- **No alert channel:** tell the person: "Open spookyparticles.com, Jobs, then Where alerts go, and add email, Slack, Teams or an ntfy topic."
- **Swallowed errors:** on a new branch, make each route that fails answer with a 5xx status and log the error. Keep the message to the visitor short and free of internal details. Open one pull request.

## Prove it is done

- No check for this project shows `needs_read_token`.
- At least one alert channel is listed.
- For a code fix: a test or a local request that forces the failure gets a 5xx status. Put the pull request link in your report.

## Rules

- Never ask for, print, copy or store a token or a secret.
- Pull requests only. Never merge.
- Never delete anything.
