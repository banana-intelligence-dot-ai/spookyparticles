# spooky-checkin

Tell [Spooky Particles](https://spookyparticles.com) each time a scheduled job runs. If a run is late or fails, Spooky alerts you.

One file, no dependencies. It works in Vercel functions (Node or Edge), Node 18 and up, Bun and Deno.

## Get it

It's not on npm yet. Copy [`src/index.ts`](src/index.ts) into your project, for example as `lib/spooky-checkin.ts`.

## Set it up

1. In Spooky, open Jobs and add a job. Choose how often it runs.
2. Copy the job's check-in link.
3. In Vercel, open your project, then Settings, then Environment Variables. Add `SPOOKY_PING_URL` with the link as its value, for Production.
4. Treat the link like a password. Anyone who has it can say your job ran. Keep it out of your code and your logs.

## A Vercel cron route

Wrap the route's handler:

```ts
// app/api/cron/nightly/route.ts
import { withCheckin } from "@/lib/spooky-checkin";

export const GET = withCheckin(async (req) => {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await doTheNightlyWork();
  return Response.json({ done: true });
});
```

Each run checks in:

- **ok** when the route answers 2xx or 3xx.
- **fail** when it throws, or answers 4xx or 5xx. The note is the error's name or the status code, never the error message.

Your route's answer and errors pass through unchanged. If Spooky can't be reached, the job still runs as normal.

Only calls from Vercel's scheduler count as runs, so opening the route in a browser doesn't mark the job as run. Pass `{ only: "all" }` to count every call.

Pass `{ start: true }` to also check in when a run starts, so Spooky can catch a run that hangs.

## Any other job

From a script, a worker, or anything else that runs on a schedule:

```ts
import { checkin } from "./spooky-checkin";

await checkin("start");
try {
  await doTheWork();
  await checkin("ok");
} catch (error) {
  await checkin("fail", { note: "import step failed" });
  throw error;
}
```

From a shell, with no code at all:

```bash
curl -fsS -m 10 --retry 3 "$SPOOKY_PING_URL"
```

## Options

| Option | Default | What it does |
|---|---|---|
| `url` | `SPOOKY_PING_URL` | The job's check-in link. |
| `note` | none | A short note kept with the run, up to 500 characters. Never put a secret here. |
| `timeoutMs` | `5000` | How long to wait for Spooky on each try. |
| `retries` | `2` | Extra tries after a network or server error. |
| `start` | `false` | `withCheckin` only. Also check in when the run starts. |
| `only` | `"cron"` | `withCheckin` only. `"all"` counts every call, not just Vercel's scheduler. |
| `failNote` | the error's name | `withCheckin` only. Builds the note sent with a failure. |

`checkin` returns `true` when Spooky recorded the run and `false` otherwise. It never throws. When something is wrong, such as a missing link or a paused job, it prints one warning. It never prints the link.

## License

MIT
