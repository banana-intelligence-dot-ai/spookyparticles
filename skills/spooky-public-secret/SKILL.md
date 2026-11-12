---
name: spooky-public-secret
description: Find a secret that the browser can read (a NEXT_PUBLIC_ or other public variable, or a key in shipped scripts), move its use to the server, and name the key to rotate. Use when a secret may be exposed in front-end code.
---

# No secret the browser can read

Covers Standard item 5: no secret sits in a variable the browser can read. See [the Standard, Close the doors](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#close-the-doors).

Any variable with a public prefix is copied into the scripts every visitor downloads. The prefixes are `NEXT_PUBLIC_`, `PUBLIC_`, `VITE_`, `NUXT_PUBLIC_`, `EXPO_PUBLIC_`, `GATSBY_` and `REACT_APP_`. A secret there is already public.

## Check

1. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`, piped in with `curl -H @-` so the key never sits on a command line). Look for the check `secret_in_public_code` with state `open`. Its evidence names the kind of key and where it was found, never the key.
2. In the repo, list variable names with a public prefix that look secret. Look at names only, never values:

   ```bash
   grep -rhoE "\b(NEXT_PUBLIC_|PUBLIC_|VITE_|NUXT_PUBLIC_|EXPO_PUBLIC_|GATSBY_|REACT_APP_)[A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PRIVATE|API_?KEY|_KEY|SERVICE_ROLE|DATABASE_URL|DSN)[A-Z0-9_]*" --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.vue' --include='*.svelte' --include='.env.example' . | sort -u
   ```

3. Some keys are meant to be public, such as a Stripe publishable key (`pk_`), a Supabase anon key, or an analytics site ID. Leave those alone. A secret key, a service role key, a database URL or a private API key is never safe in the browser.

## Fix

One key per pull request.

1. On a new branch, move every use of the key to server code: a route handler, a server action or a server component. The browser calls your server, and your server calls the provider.
2. Read the key on the server from a name without a public prefix, for example `STRIPE_SECRET_KEY` instead of `NEXT_PUBLIC_STRIPE_SECRET_KEY`. Update `.env.example` with the new name and an empty value.
3. Do not create, copy or move the value. In the pull request description, give the person these steps:
   - "This key was public, so treat it as leaked. Make a new one at <provider> and turn off the old one."
   - "In Vercel, Project, Settings, Environment Variables, add the new key under `<new name>` and mark it Sensitive."
   - "When the new code is live, you can remove the old public variable. That is your call; the agent will not delete it."
4. Report back to Spooky with `report_finding` and the pull request link, if the finding came from Spooky.

## Prove it is done

- The grep in Check step 2 finds the key name no more.
- Build the project and search the browser bundle by file name only, so no value is ever printed: `grep -rlE "<old variable name>" .next/static` (or `dist/` for Vite) returns nothing.
- After the person rotates the key and the change is live, Spooky's next scan of the live site shows `secret_in_public_code` as `ok`. Never mark it fixed yourself.

## Rules

- Never print, copy, store or move a secret's value. Use `grep -l` so only file names show.
- A key that may have leaked is named for rotation, not moved.
- Never delete a variable, a key or a project. The person removes the old variable.
- Pull requests only. Never merge.
