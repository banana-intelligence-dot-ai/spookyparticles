---
name: spooky-previews
description: Make sure a Vercel project's preview links are not open to the world. Gives the person the one Vercel setting as steps. Use when asked about preview protection or deployment protection.
---

# Protect preview links

Covers Standard item 6: preview links are not open to the world. See [the Standard, Close the doors](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#close-the-doors).

Every pull request gets a preview link. Without protection, anyone who has the link can open work that is not released yet. This is one Vercel setting. Only the person changes it.

## Check

1. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`). Look for the check `previews_open`. `open` means previews are public. `unknown` with reason `needs_read_token` means Spooky could not read the setting.
2. Without Spooky, read the project with the Vercel CLI, logged in as the person: `vercel api /v9/projects/<project name>`. Look at `ssoProtection`, `passwordProtection` and `trustedIps`. If all three are null, previews are open.
3. Or open a recent preview link in a private browser window. If it loads without asking you to log in, it is open.

## Fix

A step for the person. Give them this word for word:

"Open Vercel, then this project, then Settings, then Deployment Protection. Turn on Vercel Authentication and choose Standard Protection. Save. Your live site stays public; only preview links ask for a Vercel login."

Docs: https://vercel.com/docs/deployment-protection

If the project needs a preview to be shared with someone outside the team, Vercel has share links and bypass options on the same page. The person picks.

## Prove it is done

- `previews_open` shows `ok` on Spooky's next check, or `ssoProtection` is no longer null.
- A preview link opened in a private window now asks for a login.
- Report it to the person. Spooky's next check decides; never mark it fixed yourself.

## Rules

- Never change Vercel settings yourself. This one is for the person.
- Never create or share a bypass secret or a share link.
- Never delete anything.
