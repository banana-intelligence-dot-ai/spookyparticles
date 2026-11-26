---
title: Vercel 404 on refresh: cause and fix
description: Fix a Vercel 404 on refresh by adding the right single page app rewrite or using your framework's routing, then redeploying.
published: 2026-11-24
checked: 2026-11-24
spooky: no
---

# Vercel 404 not found on refresh: why it happens and the fix

A 404 on refresh usually means the app routes pages in the browser and Vercel has no file at that address. Add a rewrite that sends every path to `index.html` (for a single page app), or use your framework's own routing, then redeploy.

## Why does my Vercel app show 404 when I refresh the page?

A client-side router changes the address in the browser, but a refresh sends that address to Vercel. Vercel looks for a file at the path, and a single page app has none there, so it returns 404 NOT_FOUND.

## How do I fix it?

For a Vite single page app, Vercel's Vite guide says in [Using Vite to make SPAs](https://vercel.com/docs/frameworks/frontend/vite#using-vite-to-make-spas) that deep links do not work by default. Create `vercel.json` at the project root with this rewrite:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

If `cleanUrls` is `true`, the same guide says to leave off the file extension, so the destination becomes `/` instead of `/index.html`. See the [vercel.json rewrites reference](https://vercel.com/docs/project-configuration/vercel-json) for the project configuration format. Then redeploy.

## What if I use Next.js or another framework?

The Vite guide says framework-based projects such as SvelteKit should prefer their framework's own method. Use the framework's routing and check that the page or route file exists.

For any framework, Vercel's [NOT_FOUND page](https://vercel.com/docs/errors/NOT_FOUND) lists checking the URL for typos, confirming that the deployment exists, reviewing the deployment logs, and checking permissions. The [Vercel 404 NOT_FOUND guide](/vercel-404-not-found) walks through those checks.

## What can I paste into my coding agent?

```text
Find which router or framework this app uses and check whether the project has a vercel.json file. Propose the minimal rewrite or framework routing fix for a 404 that appears on page refresh. Do not change any other files and do not redeploy. I will review the fix and redeploy.
```

## Related

For other missing-page causes, see [Vercel 404 NOT_FOUND](/vercel-404-not-found). The [Vercel deployment errors](/vercel-deployment-errors) list and [Vercel deployment failed](/vercel-deployment-failed) guide cover wider deployment problems. [Automate fixes](/automate-fixes) explains the coding-agent workflow, and [VibeOps](/vibeops) covers keeping shipped apps running.
