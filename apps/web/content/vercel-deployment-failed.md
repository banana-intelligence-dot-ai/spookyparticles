# Vercel deployment failed? How to read the log and fix it

A failed Vercel deploy usually leaves a build log, and the line that names the cause is often a few lines above the last error. Read it, fix what it names, and push again. Spooky can hand that line to your coding agent.

If the deployment is queued or initializing instead, use the [Vercel deployment stuck fixes](/vercel-deployment-stuck).

To choose where Vercel sends failure alerts, set up [Vercel deployment notifications](/vercel-deployment-notifications).

For alerts on running projects, see [Vercel Alerts](/vercel-alerts).

Use the [Vercel error log commands](/vercel-error-log) to inspect related build and runtime output.

If a route works until the browser reloads it, follow the [page refresh 404 steps](/vercel-404-on-refresh).

If the site answers 503 DEPLOYMENT_PAUSED instead, use the [deployment paused checks](/vercel-deployment-paused).

## How do I find out why my Vercel deployment failed?

1. In the Vercel dashboard, open the project, then **Deployments**, and select the deployment with the error status.
2. Expand the **Building** accordion to open the build log.
3. Scroll to the red section that contains the word "Error". Vercel's own guide warns that the last mention is often not the useful one. A line such as `yarn run build exited with 1` only says the build command stopped. The lines above it often point to the real problem, though Vercel notes an error may not appear there at all.
4. Run the same build command on your own machine. Vercel recommends this, because it catches problems in your code or dependencies before you deploy again.
5. Fix what the log names, commit, and push. A new commit starts a new deployment. If the log says the Root Directory does not exist, see [fixing the Root Directory error](/vercel-root-directory-does-not-exist).

Source: Vercel's guide to [troubleshooting build errors](https://vercel.com/docs/deployments/troubleshoot-a-build).

## What if there is no build log?

Some deployments fail before a build starts, so there is nothing to expand. Vercel then shows the error in an overlay instead. Its guide lists these causes:

- An invalid `vercel.json` was committed.
- An Ignored Build Step is set.
- The commit came from someone who is not a team member.
- A Marketplace integration resource failed to provision before the build began.

Fix the named cause and redeploy.

## What are some documented reasons a deploy fails?

- **A module not found.** Vercel describes this as a static import that cannot find the file at the declared path.
- **A missing development dependency.** If `NODE_ENV` is set to `production`, some package managers skip `devDependencies`, and a build that needs `typescript` can fail.
- **A build that runs out of memory or time.** Vercel cancels a build that exceeds its machine's memory or disk, and one that runs longer than 45 minutes.
- **A failed integration resource.** A Marketplace integration that cannot provision stops the deployment before the build starts.

To match an error line to a cause, use the [list of common Vercel deployment errors](/vercel-deployment-errors). If the failure is in the build step, see [Vercel build failed: causes and fixes](/vercel-build-failed). If the deploy started from a GitHub push and no build began, see [Vercel deployment failed from GitHub](/vercel-deployment-failed-github).

## Where does Spooky fit?

Spooky Particles watches your Vercel projects for you, and when a production deploy fails it alerts you on ntfy or email. It also passes the build log line to your coding agent, Claude Code or Codex, so the agent starts with the likely cause, when Spooky can find it, instead of a vague "it failed". The agent writes the fix. Spooky never changes your code itself and never merges anything.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, and [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request. This is one part of [VibeOps](/vibeops), the work of keeping shipped apps running.

## Price

Free, requires your own coding agent.
