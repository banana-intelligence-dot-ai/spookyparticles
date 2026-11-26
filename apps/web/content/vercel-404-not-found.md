# Vercel 404 NOT_FOUND: causes and fix

A Vercel 404 NOT_FOUND means nothing was found at that address. Check the route or file name, the build's output directory, and that the domain points at the right project, then redeploy.

## What does Vercel 404 NOT_FOUND mean?

Vercel returns this error when it cannot find the requested resource. The resource may have moved or been deleted, or the URL may contain a typo. Vercel's [NOT_FOUND reference](https://vercel.com/docs/errors/NOT_FOUND) identifies it as error code 404, named Not Found. For other messages, use the [Vercel deployment errors](/vercel-deployment-errors) list.

If the error appears only after refreshing a client-routed page, use the [404 on refresh guide](/vercel-404-on-refresh).

A 503 DEPLOYMENT_PAUSED is a different error; see [Vercel deployment paused](/vercel-deployment-paused).

## How do I fix Vercel 404 NOT_FOUND?

Work through the four checks on Vercel's troubleshooting page:

1. Check the deployment URL for a typo or incorrect path.
2. Confirm the deployment still exists and was not deleted. Vercel explains how to [manage deployments](https://vercel.com/docs/deployments/managing-deployments).
3. If it exists, review the [deployment logs](https://vercel.com/docs/deployments/logs).
4. Confirm that your account has the required [team permissions](https://vercel.com/docs/accounts/team-members-and-roles).

Those are the checks Vercel lists. The route, file-name, output-directory, and domain checks in the opening answer are general practical checks, not quotes from that page. Confirm the requested route matches the file name, the build writes to the configured output directory, and the domain points to the intended project. If the build itself failed, start with [Vercel build failed](/vercel-build-failed).

## What should I ask a coding agent?

Paste this prompt into Claude Code or Codex:

```
My Vercel deployment returns 404 NOT_FOUND. Check the requested URL for typos, confirm the deployment still exists, inspect its deployment logs, and identify whether I have permission to view it. Then inspect the route or file name, build output directory, and domain-to-project mapping. Tell me the likely cause and propose the smallest fix. Do not deploy.
```

## Can I show a custom 404 page?

Yes. Vercel documents how to add a [custom 404 page](https://vercel.com/docs/routing/custom-404-pages) for a URL that does not exist in a deployment. That changes what visitors see, but it does not make a missing resource exist.

## Where does Spooky fit?

Spooky checks your live Vercel site every 5 minutes and counts a 404 as down. It waits for two failed checks in a row, then alerts on ntfy or email and passes the error to your own coding agent, Claude Code or Codex, which proposes a fix. Spooky never changes your code itself.

To turn it on, give your agent [setup.md](/setup.md) or follow the [quickstart](/docs/quickstart). Read more about [uptime monitoring for Vercel](/vercel-uptime-monitoring).

## Price

Free, requires your own coding agent.
