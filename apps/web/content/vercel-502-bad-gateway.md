# Vercel 502 bad gateway: fixes

A 502 on Vercel with a ROUTER_EXTERNAL_TARGET code means Vercel's router could not get a good answer from an outside server you route to. Read the error code, then check your routing configuration, the outside server, firewall rules and the deployment logs.

Vercel documents these errors at [ROUTER_EXTERNAL_TARGET_ERROR](https://vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_ERROR), [ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR](https://vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR) and [ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR](https://vercel.com/docs/errors/ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR).

## What does a Vercel 502 mean?

Vercel says `ROUTER_EXTERNAL_TARGET_ERROR` means its router hit an error while routing a request to an external target. Vercel lists incorrect routing configuration and an invalid response from the target as causes. If the external server does not respond within 120 seconds, you see this error.

| Code | What Vercel says happened | What to check |
|---|---|---|
| `ROUTER_EXTERNAL_TARGET_ERROR` | The router failed while routing to an external target | Your routing configuration, whether the target is online, errors on the target, firewall rules, deployment logs |
| `ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR` | The router could not connect to the external target | Network connectivity, whether the target answers a direct request, the destination URL in your rewrite, firewall rules on both sides |
| `ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR` | The router could not finish the SSL handshake, or the request timed out | The target's SSL certificate and cipher suite, connectivity, response times against the 120 second limit |

Vercel has other 502 codes. For example, [NO_RESPONSE_FROM_FUNCTION](https://vercel.com/docs/errors/NO_RESPONSE_FROM_FUNCTION) means a function finished without returning a response, which can happen because of an uncaught exception, an unhandled promise rejection or a syntax error in the deployment. This page covers the three router codes above.

## How do I fix a Vercel 502?

1. Open the failing request in the deployment's logs and read the error code.
2. Check your routing configuration, such as the rewrite in `vercel.json` or your framework config. Confirm it points to the right external destination.
3. Request the external target directly, for example with `curl -I https://your-target.example.com`. It must be online and reachable from the internet.
4. Look for crashes or errors on the external target.
5. Check that no firewall rule or IP allowlist blocks Vercel's connections.
6. If the code is `ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR`, check the target's SSL certificate. Also check whether the target takes longer than 120 seconds to answer.

## What should I ask a coding agent?

Paste this prompt into Claude Code or Codex:

```
My Vercel site returns HTTP 502. Do not deploy or change Vercel settings. Inspect the deployment logs and identify the error code: ROUTER_EXTERNAL_TARGET_ERROR, ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR or ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR. Check the routing configuration in vercel.json and the framework config for the external destination. Tell me which external target the failing request goes to and whether it is reachable. Check for firewall rules, SSL certificate problems and responses slower than 120 seconds. Cite the evidence and propose the smallest fix.
```

## See also

If the function returns 500 instead, follow the [Vercel 500 internal server error fixes](/vercel-500-internal-server-error). If it returns 504, follow the [Vercel function timeout fixes](/vercel-function-timeout). For other codes, use [Vercel deployment errors](/vercel-deployment-errors).

## Where does Spooky fit?

Spooky can tell your coding agent when a site's server errors rise, if it can read that project's request history on Vercel. Spooky tells your own coding agent, Claude Code or Codex, what broke, and the agent proposes the fix. Spooky never changes your code itself.

Give your agent [setup.md](/setup.md), follow the [quickstart](/docs/quickstart), or use [Vercel deployment errors](/vercel-deployment-errors) to match another error to its fix.

## Price

Free, requires your own coding agent.
