# Vercel deployment failed from GitHub? Find the cause and fix it

When a Vercel deploy started from GitHub fails, the cause is usually in the build log on Vercel, not on GitHub. Open the failed deployment, read the error in its log, fix it in the repo, and push a new commit. If it is a build error, Spooky can pass that line to your coding agent.

## Why does a GitHub push show a failed Vercel deployment?

Vercel for GitHub deploys every push by default, including pushes and pull requests on other branches. Each commit gets a GitHub commit status that says whether its Vercel deployment succeeded, failed or was skipped. A red mark on the commit or pull request means the deployment itself failed, so the reason sits with Vercel.

1. Click **Details** on the Vercel status, or open the project in the Vercel dashboard and go to **Deployments**.
2. Select the deployment with the error status and expand the **Building** accordion to open the build log.
3. Find the red section that names the error. Vercel notes the last mention is often not the useful one, and the log may not hold the error at all. Our guide to [reading a failed Vercel deployment](/vercel-deployment-failed) shows where the useful line usually sits.
4. Fix it in the repo, commit, and push. A new commit starts a new deployment.

Source: Vercel's [GitHub integration documentation](https://vercel.com/docs/git/vercel-for-github) and its guide to [troubleshooting build errors](https://vercel.com/docs/deployments/troubleshoot-a-build).

## What if there is no build log, or no deployment at all?

Some deployments fail before a build starts, so Vercel shows the error in an overlay instead of a log. A push can also produce no deployment, because Vercel cannot see the repository. Vercel's documentation points to these causes:

- **The commit author has no access.** Vercel lists a commit from someone who is not a team member as a cause of a failure before the build starts.
- **The repository is not connected, or the Vercel GitHub App cannot see it.** The app only sees repositories you granted it. Under the app's **Repository access** setting, add the repository or choose **All repositories**.
- **Your role on the repository is too low.** On a personal repository you must be the Owner to connect it. On an organization repository you need to be an Owner, or a Member with the Write, Maintain or Admin role on the repository.
- **The pull request came from a fork.** Vercel asks you or a team member to authorize deployments from forks, so a secret from your project is not exposed.
- **An invalid `vercel.json` or an Ignored Build Step is set.** Either can stop the deployment before a build begins.

Fix the named cause, then redeploy or push again.

## Can GitHub Actions see a failed Vercel deploy?

Yes. Vercel sends `repository_dispatch` events to GitHub when a deployment changes state, including `vercel.deployment.error` and `vercel.deployment.failed`. A workflow can listen for them. Vercel notes that GitHub only runs such a workflow if the workflow file exists on the default branch.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line from the build log to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself. It cannot grant the Vercel GitHub App access to a repository or change a role for you. You do that in GitHub and Vercel.

To turn it on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request, and [VibeOps](/vibeops) is the wider practice of keeping shipped apps running.

If the error says a commit author is required, see [Vercel commit author is required](/vercel-commit-author-is-required).

To read Vercel logs from Claude Code yourself, see [Claude Code with Vercel](/claude-code-vercel).

## Price

Free, requires your own coding agent.
