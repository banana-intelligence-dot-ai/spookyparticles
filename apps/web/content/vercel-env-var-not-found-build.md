# Vercel environment variable not found during build? Fix it

A Vercel build cannot see a variable that is not enabled for the environment it builds in, or that was added after the deployment was made. Set the variable for that environment, then redeploy. If the build fails, Spooky passes the error line to your coding agent.

## Why can't my Vercel build find an environment variable?

Check these causes in order. Each comes from Vercel's own documentation.

1. **The variable is not set for this environment.** Each variable is applied to one or more environments: Production, Preview, Development or a custom environment. A variable set only for Production is not there when a Preview deployment builds. Open the project's settings, find the variable, and tick the environment that is building.
2. **You added it after the deployment was built.** Vercel says changes to environment variables are not applied to previous deployments, only to new ones. Redeploy the project after you save.
3. **A Preview branch has its own value.** A branch-specific Preview variable overrides other Preview variables with the same name, so check for one that hides the value you expect.
4. **The name differs in code.** The key in settings must match the key your code reads, so compare them letter for letter.
5. **A Next.js `NEXT_PUBLIC_` variable is read dynamically.** Vercel notes that Next.js inlines these variables into the client bundle at build time, and a lookup such as `process.env[name]` is not inlined. Use the full name, make sure it is set for the environment you build, and redeploy.
6. **A Turborepo build reuses an older result.** Vercel says Turborepo leaves variables out of its cache key unless `turbo.json` lists them, so it can reuse a build made with different values. List them in `env` for the task or in `globalEnv`.

Source: Vercel's [environment variables documentation](https://vercel.com/docs/environment-variables), including its troubleshooting table.

## How do I add or change a variable and rebuild?

1. In the Vercel dashboard, open the project and go to its settings, then **Environment Variables**.
2. Add the variable, or edit it, and choose every environment that needs it.
3. Save, then redeploy. A push to the Production Branch makes a Production deployment, and a push to any other branch makes a Preview deployment. You can also redeploy an existing deployment from the **Deployments** tab.

From a terminal, `vercel env add` adds a variable and `vercel env pull` writes your Development variables to a local `.env.local` file, which lets you run the build on your own machine with the same values.

## Is it really a build problem?

Often it is not. A variable that is missing may only break the app when a request runs, not when the build runs. The build then passes, and the failure shows up later as a server error or a blank value in the page. The build log will not show it, so look at the deployment's runtime logs for that case.

If the build itself failed, read the build log first. Our guide to [reading a failed Vercel deployment](/vercel-deployment-failed) shows where the error line sits, and the [Root Directory fix](/vercel-root-directory-does-not-exist) covers a different build error that is easy to confuse with a missing variable.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request that corrects a variable name in code. Spooky never changes your code itself, and it cannot add a value to your Vercel settings for you. You still set the variable yourself.

To turn it on, give your agent [setup.md](/setup.md). [Automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
