# Vercel deployment error? Find yours in the list

Vercel shows a deployment error in the build log or on the deployment page. The first error line names the cause, such as a missing module, a type error or a bad setting. Match yours to the list, then fix it by hand. When a deploy fails, Spooky passes the first error line to your coding agent.

Use the [Vercel error log guide](/vercel-error-log) to query build and runtime failures.

If the build reaches its time or memory limit, use the [Vercel build timeout and out of memory fixes](/vercel-build-timeout-and-out-of-memory).

Use [Vercel monitoring](/vercel-monitoring) to see the deploy, cron job, uptime and server error signals together.

## How do I find the error in my Vercel deployment?

1. In the Vercel dashboard, open the project and go to **Deployments**.
2. Select the deployment with the error status.
3. Find the red section with the word Error in the log, or read the message shown instead of a log. Some deployments fail before a build starts, so there is no log at all.

The step-by-step version is in [Vercel build failed: causes and fixes](/vercel-build-failed) and [Vercel deployment failed: read the log](/vercel-deployment-failed). If the error line says Module not found, see [Vercel module not found](/vercel-module-not-found).

If a deployed URL returns 404, follow the [Vercel 404 NOT_FOUND fix](/vercel-404-not-found).

When a client-routed page fails only after a reload, use the [refresh 404 fix](/vercel-404-on-refresh).

If Vercel answers 503 and says the deployment is paused, see [DEPLOYMENT_PAUSED](/vercel-deployment-paused).

If a deployed function returns 504, follow the [Vercel function timeout fixes](/vercel-function-timeout).

If a deployed function returns 500, follow the [Vercel 500 internal server error fixes](/vercel-500-internal-server-error).

If a deployed site returns 502 from an external rewrite target, follow the [Vercel 502 bad gateway fixes](/vercel-502-bad-gateway).

## What are the common Vercel deployment errors?

This list comes from Vercel's own [error list](https://vercel.com/docs/errors/error-list). We name each error the way Vercel does and say what to change. Vercel's page has the full text and examples.

### Errors in the build or its settings

- **Missing public directory.** The output directory is missing, empty or not a directory. Check the output directory in project settings, then the build command and the root directory, and run the build locally.
- **Missing build script.** Vercel notes this applies to CLI 16.7.3 and older. A `package.json` with no `api` directory and no `vercel.json` needs a `build` script that writes a static build to `public`.
- **Recursive invocation of commands.** The Build Command runs `vercel build`, or the Development Command runs `vercel dev`. Use your framework's own command instead, or turn off **Override** to use the preset.
- **Pnpm engine unsupported.** `ERR_PNPM_UNSUPPORTED_ENGINE` means `engines.pnpm` in `package.json` does not match the pnpm version running. Fix the `packageManager` value with Corepack turned on, or remove the `engines.pnpm` value.
- **Corepack cannot find matching keyid.** An older Corepack, before 0.31.0, cannot verify newer package manager releases. Install the latest Corepack before the install step.
- **Yarn dynamic require of "util" is not supported.** It happens with Yarn through Corepack and `"type": "module"`. Remove the type field or install Yarn into the project.
- **Oversized Incremental Static Regeneration page.** A pre-rendered response over 20 MB fails the build. Reduce the size of the response.
- **Globally installed `@vercel/speed-insights` or `@vercel/analytics`.** Add the package to `package.json` as a dependency.
- **Invalid Global Config connection string.** An environment variable, usually `GLOBAL_CONFIG` or `EDGE_CONFIG`, holds a string for a deleted store or token. Update or delete it.

### Errors in vercel.json

- **Invalid route source pattern.** The `source` property uses path-to-regexp syntax, not regular expressions, so a negative lookahead must be wrapped in a group.
- **Invalid route destination segment.** A named segment used in `destination` must also appear in `source`.
- **Conflicting functions and builds configuration.** Use `functions` or `builds`, not both.
- **Unmatched function pattern.** A key in `functions` must match function source files, for example under `api/`.
- **Unsupported functions configuration with Next.js.** Only `memory` and `maxDuration` can be set there.

### Errors about Git and access

- **Git author must have access to the project.** The commit author has no Vercel account, or the team turned on **Manual Approval**. A team Owner approves the member, or the author creates an account and links their Git provider. See [Vercel commit author is required](/vercel-commit-author-is-required).
- **Lost Git repository access.** The repository was deleted or archived, or the Vercel app was removed or its permissions were changed.
- **Cannot load project settings.** The `.vercel` folder belongs to a team you are not in. Remove it and link the project again.
- **Production deployment cannot be redeployed.** A newer production deployment exists. Select **Promote** instead.
- **Blocked scopes.** A deployment, project, user or team that breaks Vercel's fair use guidelines or terms can be blocked, and a blocked site returns 451.

## Why does my Vercel deployment fail with no error I recognize?

Find the red Error section of the log and read the lines above the last mention, which Vercel says is often not the useful one. Search the error text on Vercel's error list, then run the same build command on your machine. Vercel's guide to [troubleshooting build errors](https://vercel.com/docs/deployments/troubleshoot-a-build) has the same advice.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

## Price

Free, requires your own coding agent.
