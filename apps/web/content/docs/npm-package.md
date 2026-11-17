# spooky-checkin on npm

A small package that checks in with Spooky each time a scheduled job runs. One file, no dependencies. It works in Vercel functions (Node or Edge), Node 18 and up, Bun and Deno.

```bash
npm i spooky-checkin
```

## Set it up

1. Create the job. See [Check-ins](/docs/check-ins).
2. In Vercel, open your project, then Settings, then Environment Variables. Add `SPOOKY_PING_URL` with the ping link as its value, for Production.
3. Keep the link out of your code and your logs.

## A Vercel cron route

Wrap the route's handler.

```ts
// app/api/cron/nightly/route.ts
import { withCheckin } from "spooky-checkin";

export const GET = withCheckin(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await doTheNightlyWork();
  return Response.json({ done: true });
});
```

- A 2xx or 3xx answer checks in ok.
- A throw, or a 4xx or 5xx answer, checks in as a failure. The note is the error's name or the status code, never the message.
- Your route's answer and errors pass through unchanged. If Spooky can't be reached, the job still runs.
- Calls from Vercel's scheduler count as runs; others do not. Pass `{ only: "all" }` to count every call.
- Pass `{ start: true }` to also check in when a run starts.

## Any other job

```ts
import { checkin } from "spooky-checkin";

await checkin("start");
try {
  await doTheWork();
  await checkin("ok", { count: 12 });
} catch (error) {
  await checkin("fail", { note: "import step failed" });
  throw error;
}
```

`checkin` returns `true` when Spooky recorded the run and `false` otherwise. It never throws.

## Options

| Option | Default | What it does |
|---|---|---|
| `url` | `SPOOKY_PING_URL` | The job's ping link. |
| `note` | none | A short note, up to 500 characters. Never put a secret here. |
| `count` | none | A non-negative whole number of items processed. |
| `timeoutMs` | `5000` | How long to wait for Spooky on each try. |
| `retries` | `2` | Extra tries after a network or server error. |
| `start` | `false` | For `withCheckin`. Also check in when the run starts. |
| `only` | `"cron"` | For `withCheckin`. `"all"` counts every call. |
| `failNote` | the error's name | For `withCheckin`. Builds the note sent with a failure. |

## Check that it worked

```bash
curl -fsS "$SPOOKY_PING_URL/status"
```

It shows the job's name, status, last check-in and when the next one is due. It never records a run.
