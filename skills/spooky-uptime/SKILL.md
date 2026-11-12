---
name: spooky-uptime
description: Make sure someone hears within 10 minutes when a Vercel project's live site stops answering. Use when asked to set up uptime alerts or "know when the site is down".
---

# Uptime alerts

Covers Standard item 1: someone hears within 10 minutes when the live site stops answering. See [the Standard, Keep it running](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-running).

Spooky fetches each connected project's production address every 5 minutes. It alerts after two failures in a row, and again when the site recovers. Nothing needs to change in the code. This skill makes sure the watch is on and the alert reaches a person.

## Check

1. Find the production address. Run `vercel project ls` or read the project's domains in the Vercel dashboard. Note it down.
2. Fetch it the way a visitor would: `curl -s -o /dev/null -w "%{http_code}\n" https://<production address>`. A 200 is good. A 401 or a login page means the live site is behind a login, so no outside check can read it.
3. If the person uses Spooky, call `GET https://spookyparticles.com/api/v1/projects` with `Authorization: Bearer $SPOOKY_API_KEY`, piped in with `curl -H @-` so the key never sits on a command line (or the MCP tool `list_projects`). Find the project. Read `uptime`:
   - `uptime.state` is `up`, `down`, `protected` or `unknown`.
   - `uptime.lastCheckedAt` should be within the last 10 minutes.
   - `uptime` is null when Spooky has not watched this project yet.
4. Call `GET https://spookyparticles.com/api/v1/alert-channels`. At least one channel should be listed. With none, an alert has nowhere to go.

## Fix

Everything here is a step for the person. Give them these steps word for word.

- **Project not watched (`uptime` is null):** "Open spookyparticles.com, sign in with Vercel, and connect the Vercel team that owns this project. The first check runs within 5 minutes."
- **No alert channel:** "Open spookyparticles.com, Jobs, then Where alerts go. Add email, Slack, Teams or an ntfy topic." An agent never adds a channel. A webhook address is a credential, so the person pastes it.
- **`uptime.state` is `protected`:** the production site asks for a login. Tell the person: "Your live site is behind a login, so nobody outside can check that it answers. If the public should see it, open Vercel, Project, Settings, Deployment Protection, and make sure production is not protected. If it is meant to be private, this is fine as it is."
- **`uptime.state` is `down`:** the site is down now. Tell the person first. Then call `GET /api/v1/incidents` to see if a failed deploy caused it, and use the `spooky-deploy-alerts` skill.

## Prove it is done

- `uptime.state` is `up` and `uptime.lastCheckedAt` is less than 10 minutes old.
- `GET /api/v1/alert-channels` lists at least one channel.
- Report both lines to the person. Do not say "fixed". Spooky's next check decides.

## Rules

- Read only. This skill changes no code and no settings.
- Never print, copy or store a secret, a token or a webhook address.
- Never delete anything.
