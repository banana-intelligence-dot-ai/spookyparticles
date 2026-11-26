# Vercel deployment stuck in queued: fixes

A stuck Vercel deployment is usually queued behind another build, skipped by a build setting, or caught in a Vercel incident. Check the status page, the deployment list and vercel.json.

Vercel documents the queue and its controls in [Managing Builds](https://vercel.com/docs/builds/managing-builds). Its [project settings](https://vercel.com/docs/project-configuration/project-settings) include the Ignored Build Step.

## Why is my Vercel deployment stuck in queued?

A queued deployment is waiting behind another build because the available concurrency is in use. Hobby permits one concurrent deployment, so later builds run sequentially. Vercel's Managing Builds page lists production builds stuck behind preview builds as a case it has a fix for.

Check **Settings**, then **Build and Deployment**. Under **On-Demand Concurrent Builds**, a project can run all builds immediately or limit work to one active build per branch. When on-demand concurrency is enabled for a project, its queued builds can proceed.

A deployment that seems to never build may also be skipped on purpose. If the project's **Ignored Build Step** command exits with code 0, Vercel aborts that build immediately. Exit code 1 lets the build continue.

## Stuck on initializing

Check [Vercel's status page](https://www.vercel-status.com). A deployment that does not progress can be part of a Vercel incident.

## How do I start a queued build now?

1. In the Vercel dashboard, open the project, then **Deployments**.
2. Find the queued deployment. Use the status filter if needed.
3. Open the three dots beside it and select **Start Building Now**. You can also open the deployment and select **Start Building Now** there.
4. Confirm the action.

Vercel says this starts the build regardless of why it was queued.

## What should I ask a coding agent?

Paste this prompt into Claude Code or Codex:

```
My Vercel deployment is stuck in queued or initializing. Do not deploy or change Vercel settings. Check the Vercel status page. Inspect the deployment list and vercel.json. Check whether another deployment is using the available concurrency, including a preview build ahead of a production build. Check the project's Build and Deployment settings, including On-Demand Concurrent Builds and Ignored Build Step. If the ignored command exits 0, report that it aborts the build. Tell me whether Start Building Now is the smallest next step. Cite the evidence and propose the smallest fix.
```

## See also

If the deployment starts but then fails, follow [Vercel deployment failed: how to read the log and fix it](/vercel-deployment-failed).
