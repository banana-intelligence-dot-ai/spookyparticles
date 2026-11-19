# Vercel build failed? Find the failing step and fix it

A Vercel build usually fails because the build command exits with an error, though limits and missing preconditions can stop one too. Read the build log, check above the last Error line for the cause, run the build locally, then push again. Spooky can pass a failed deploy's error line to your coding agent.

## Why did my Vercel build fail?

Start with the build log, then check the causes Vercel's own guide lists.

1. In the Vercel dashboard, open the project, go to **Deployments**, and select the deployment with the error status.
2. Expand the **Building** accordion and scroll to the red section that contains the word "Error". Vercel notes the last mention is often not the useful one. A line such as `yarn run build exited with 1` only says the build command stopped, and the real cause is usually a few lines above it.
3. Run the same build command on your own machine. Vercel recommends this first, because it catches problems in your code or your dependencies before you deploy again. The command depends on the project, for a Next.js app it is usually `npm run build`.
4. Fix the cause, commit, and push. A new commit starts a new build.

Source: Vercel's guide to [troubleshooting build errors](https://vercel.com/docs/deployments/troubleshoot-a-build). Our guide to [reading a failed Vercel deployment](/vercel-deployment-failed) covers the same log in more detail.

## What are the common reasons a Vercel build fails?

Vercel's guide names these:

- **A missing development dependency.** The build can fail even though a package, such as `typescript`, is listed in `devDependencies`. Vercel installs `devDependencies` by default, but if your project sets `NODE_ENV` to `production`, some package managers skip them.
- **A module that cannot be found.** Vercel describes this as a static import that cannot find the file at the declared path.
- **A missing build script.** Vercel lists "Missing Build script" among its build-specific errors.
- **A build that runs out of memory or disk.** Vercel cancels a build that exceeds its machine's limits, and prints a system report in the log when that happens.
- **A build that runs too long.** A build can last for a maximum of 45 minutes. After that the deployment is canceled.

## Why does my build fail on Vercel but work on my machine?

Often the cause is `NODE_ENV`. Vercel's guide gives this table for what happens when `NODE_ENV=production` is set:

| Package manager | Skips `devDependencies` | Install Command that keeps them |
| --- | --- | --- |
| npm | Yes | `npm install --include=dev` |
| pnpm 9 and earlier | Yes | `pnpm install --prod=false` |
| pnpm 10 and later | No | Not needed |
| Yarn 1 | Yes | `yarn install --production=false` |

You have two fixes. Delete `NODE_ENV` from the project's environment variables and redeploy, since frameworks such as Next.js set it themselves when they build. Or turn on **Override** for the Install Command in the project's Build and Deployment settings, enter the command from the table, and redeploy.

A build can also read stale files from the build cache. To skip it, redeploy from the deployment's page and leave **Use existing Build Cache** unchecked, or run `vercel --force` with the Vercel CLI.

## What if the build failed but there is no build log?

Some builds fail before they start, so Vercel shows the error in an overlay instead of a log. Vercel lists an invalid `vercel.json`, an Ignored Build Step, a commit from someone who is not a team member, and a Marketplace integration resource that failed to provision. Fix the named cause and redeploy.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
