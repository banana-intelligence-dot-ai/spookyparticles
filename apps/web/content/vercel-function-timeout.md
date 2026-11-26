# Vercel function timeout: fixes

A Vercel function times out when it runs longer than its maximum duration, and Vercel returns a 504 with the code FUNCTION_INVOCATION_TIMEOUT. Speed up slow calls, raise maxDuration, or move long work to a background job.

Vercel documents the error at [FUNCTION_INVOCATION_TIMEOUT](https://vercel.com/docs/errors/FUNCTION_INVOCATION_TIMEOUT) and explains the fixes in [How to stop Vercel Functions from timing out](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out).

Use the [runtime log query guide](/vercel-error-log) to find timeouts and related server errors.

## Why does a Vercel function time out?

Vercel names three main reasons: the function runs longer than its configured duration, its own code is inefficient, or an upstream service is slow or unresponsive. Use the matching fix:

| Cause | Fix |
|---|---|
| The function runs longer than its configured duration | Check how long API and database calls take. In the Vercel dashboard, open the project, go to **Settings**, then **Functions**, turn on **Fluid Compute**, select **Save**, and redeploy. Fluid Compute allows longer durations, handles concurrent requests per instance, and supports `waitUntil` or `after` in Next.js to keep working after the response is sent. If needed, set `export const maxDuration = ...` in a Next.js App Router route segment config, up to the limit for your plan. Stream the response so output starts before all work finishes. Move longer work to Vercel Workflow for durable execution. |
| The function's code is inefficient | Use runtime logs and observability to find slow work, then reduce or avoid it. |
| A code path returns no response | Make every code path, including every error branch, return an HTTP response. Otherwise Vercel waits until the maximum duration and then times out. |
| The function has an infinite loop or recursion | Check runtime logs and observability. A function that runs right up to the limit with no output suggests a non-terminating loop. |
| An upstream service is slow, unresponsive, or failing | Verify third-party integrations and database connections. When one fails, return an error response early instead of waiting. |

## What does a 504 mean?

A Vercel 504 gateway timeout with this code appears in the browser as `504 FUNCTION_INVOCATION_TIMEOUT Gateway Timeout`. An unhandled exception is a common cause, so check the application's runtime logs. Also confirm that every success and error path returns an HTTP response.

## Edge functions

To avoid a Vercel Edge function timeout, an Edge runtime function must begin sending a response within a limit and may keep streaming after that. Reply early, stream the response, or move the work to the background. Vercel's [Edge Runtime docs](https://vercel.com/docs/functions/runtimes/edge) explain the runtime behavior.

## What should I ask a coding agent?

Paste this prompt into Claude Code or Codex:

```
My Vercel function returns 504 FUNCTION_INVOCATION_TIMEOUT. Inspect its application logs and observability. Check whether the function exceeds its configured duration, contains inefficient code, waits on a slow API or database, misses an HTTP response on any success or error path, or has an infinite loop or recursion. Check whether Fluid Compute is enabled. Decide whether a higher maxDuration within the plan limit, response streaming, waitUntil or after, or Vercel Workflow is the smallest appropriate change. If this is an Edge runtime function, confirm that it begins sending a response within the required limit. Identify the likely cause and propose the smallest fix. Do not deploy.
```

## See also

If the function returns 500 instead, follow the [Vercel 500 internal server error fixes](/vercel-500-internal-server-error). If the site returns 502 from an external rewrite target, follow the [Vercel 502 bad gateway fixes](/vercel-502-bad-gateway).

## Where does Spooky fit?

Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself.

Give your agent [setup.md](/setup.md), follow the [quickstart](/docs/quickstart), or use [Vercel deployment errors](/vercel-deployment-errors) to match another error to its fix.

## Price

Free, requires your own coding agent.
