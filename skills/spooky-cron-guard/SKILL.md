---
name: spooky-cron-guard
description: Make every Vercel scheduled route refuse callers who do not send the CRON_SECRET. Use when a project has crons in vercel.json, or when Spooky reports that anyone can trigger a scheduled job.
---

# Guard scheduled routes

Covers Standard item 7: scheduled routes refuse callers without the cron secret. See [the Standard, Close the doors](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#close-the-doors).

A Vercel cron job is a public web address that Vercel calls on a schedule. Anyone who finds the address can call it too. When a variable named `CRON_SECRET` is set, Vercel sends it with each run as the header `Authorization: Bearer <secret>`. The route must compare it.

## Check

1. Read `crons` in `vercel.json`. Each entry has a `path`. Find the route file for each path, for example `app/api/cron/daily/route.ts` for `/api/cron/daily`.
2. Each route should answer 401 unless the `Authorization` header equals `Bearer ` plus `process.env.CRON_SECRET`, and should refuse every request when `CRON_SECRET` is not set.
3. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`). The check `cron_unguarded` is `open` when the project has schedules and no `CRON_SECRET` for production. Spooky cannot see the code, so it checks the variable only.

## Fix

On a new branch, add the guard to the top of each scheduled route. For a Next.js route handler:

```ts
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  // An unset secret must never match, so refuse everything until it is set.
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // ... the job
}
```

If several routes share a helper, put the check there once. Use the project's own style and framework.

Open one pull request. Put this in its description, because merging without it stops every run:

"Before merging: open Vercel, this project, Settings, Environment Variables. Add `CRON_SECRET` for Production, mark it Sensitive, and give it a long random value. One way to make one, in your own terminal: `openssl rand -hex 32`."

## Prove it is done

- Run the app locally and call a scheduled route with no header. It answers 401:

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/<route>
  ```

- A test that calls the handler without the header, with a wrong header, and with `CRON_SECRET` unset gets 401 each time.
- After the person adds the variable and merges, `cron_unguarded` shows `ok` on Spooky's next check, and the next scheduled run succeeds (`whats_broken` shows no failed scheduled run).

## Rules

- Never create, read, print or guess the secret. The person sets it.
- Never remove or change a schedule.
- Pull requests only. Never merge.
- Never delete anything.
