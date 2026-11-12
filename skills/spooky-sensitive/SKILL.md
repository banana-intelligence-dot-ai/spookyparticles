---
name: spooky-sensitive
description: Find secret-looking Vercel environment variables that can be read back, and give the person the steps to re-add each one as Sensitive. Use when asked to lock down environment variables or when Spooky reports a secret that can be read back.
---

# Mark secrets Sensitive

Covers Standard item 8: secrets are marked sensitive, so nobody can read them back. See [the Standard, Close the doors](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#close-the-doors).

A plain or encrypted Vercel variable can be read back by anyone on the team or by any token with access. A Sensitive variable can never be read back, only replaced. Vercel lets a variable be Sensitive in Production and Preview, not in Development.

## Check

1. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`). The check `secret_not_sensitive` is `open` when a secret-looking variable is stored as plain or encrypted in Production or Preview. Its evidence `names` lists the variable names, never values.
2. Without Spooky, list variable names and types with the Vercel CLI, logged in as the person:

   ```bash
   vercel api "/v10/projects/<project name>/env"
   ```

   Read only `key`, `type` and `target`. Never add `decrypt=true`. A secret-looking name (`SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `API_KEY`, `_KEY`, `SERVICE_ROLE`, `DATABASE_URL`, `DSN`) with type `plain` or `encrypted` in `production` or `preview` should be Sensitive.

## Fix

A step for the person. Only they can re-enter a value. Give them this, with the names filled in:

"Open Vercel, then this project, then Settings, then Environment Variables. For each of these: <names>. Edit it, turn on Sensitive, and enter the value again. If you do not have the value, make a new one at the provider and turn off the old one. Then redeploy production so the new setting is used."

Docs: https://vercel.com/docs/environment-variables/sensitive-environment-variables

If the code reads one of these in the browser (a public prefix such as `NEXT_PUBLIC_`), use the `spooky-public-secret` skill first.

## Prove it is done

- `secret_not_sensitive` shows `ok` on Spooky's next check, or every listed name now has type `sensitive`.
- Report the names you passed on and say they are waiting on the person. Never mark it fixed yourself.

## Rules

- Never read, decrypt, print, copy or store a value.
- Never change Vercel settings yourself.
- Never delete a variable. Re-adding is the person's job.
