# Vercel 500 internal server error: fixes

A Vercel 500 means your function failed. The error code, such as FUNCTION_INVOCATION_FAILED, names the kind and the function logs show the cause. Check environment variables and unhandled errors first. The exception is INTERNAL_UNEXPECTED_ERROR, a general error that Vercel says to report to its support.

Vercel documents these HTTP 500 errors at [FUNCTION_INVOCATION_FAILED](https://vercel.com/docs/errors/FUNCTION_INVOCATION_FAILED) and [INTERNAL_UNEXPECTED_ERROR](https://vercel.com/docs/errors/internal_unexpected_error).

Use the [production error log commands](/vercel-error-log) to filter 5xx requests and runtime messages.

## What does a Vercel 500 mean?

Vercel says `FUNCTION_INVOCATION_FAILED` means the invocation failed, possibly because of an error in the function or its environment. Use the matching fix from Vercel's documentation:

| Cause | Fix |
|---|---|
| The runtime process, such as Node.js, Bun, or Python, crashed | Check the application logs in the Vercel Logs tab. Review the code for errors or infinite loops and wrap code in `try/catch`. |
| Node.js or Bun threw an unhandled rejection or uncaught exception | Look for unhandled exceptions and fix the code that throws them. |
| The function configuration has a problem | Verify the function configuration, including environment variables and other settings. |

## INTERNAL_UNEXPECTED_ERROR

According to [Vercel's documentation](https://vercel.com/docs/errors/internal_unexpected_error), `INTERNAL_UNEXPECTED_ERROR` is an HTTP 500 code for a general unexpected error. Vercel lists system faults, unhandled exceptions, and unforeseen application issues as possible causes. Vercel says to contact [Vercel support](https://vercel.com/help) through the help page and include your deployment ID.

## What should I ask a coding agent?

Paste this prompt into Claude Code or Codex:

```
My Vercel function returns HTTP 500. Inspect the application logs in the Vercel Logs tab and identify the error code. If it is FUNCTION_INVOCATION_FAILED, check whether the runtime process, such as Node.js, Bun, or Python, crashed; whether Node.js or Bun threw an unhandled rejection or uncaught exception; whether the code contains errors or infinite loops; and whether the function configuration, including environment variables and other settings, is correct. Wrap code in try/catch where appropriate and propose the smallest fix. If it is INTERNAL_UNEXPECTED_ERROR, give me the deployment ID to send to Vercel support through the help page. Do not deploy.
```

## See also

If the function returns 504 instead, follow the [Vercel function timeout fixes](/vercel-function-timeout). If the site returns 502 from an external rewrite target, follow the [Vercel 502 bad gateway fixes](/vercel-502-bad-gateway). For other codes, use [Vercel deployment errors](/vercel-deployment-errors).

## Where does Spooky fit?

Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself.

Give your agent [setup.md](/setup.md), follow the [quickstart](/docs/quickstart), or use [Vercel deployment errors](/vercel-deployment-errors) to match another error to its fix.

## Price

Free, requires your own coding agent.
