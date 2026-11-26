# Vercel "A commit author is required" error: cause and fix

Vercel shows this error when it cannot match a commit's author to a user with access to the project. Set your git email to one on your GitHub account, confirm your Vercel account is linked to it, then push a new commit. Spooky can pass the failing deploy to your coding agent.

## Why does Vercel say a commit author is required?

For a private repository, a deployment can fail when Vercel cannot identify the commit author, or when your team requires approval before adding the committer. Vercel's guide to [troubleshooting project collaboration](https://vercel.com/docs/deployments/troubleshoot-project-collaboration) gives the checks. Work through them in this order.

1. **Your git email does not match your git provider account.** A git provider matches a commit to a user by the commit email. Run `git config user.email` on the machine that made the commit and check that it is a verified email on your GitHub, GitLab or Bitbucket account.
2. **Your Vercel account is not linked to your git provider.** Open your Vercel account settings, go to Login Connections and connect the provider. If you use more than one email for commits, add and verify each one in your Vercel account email settings.
3. **On a Hobby team, the author is not the team owner.** Vercel says a Hobby team does not support collaboration on private repositories, and a commit deploys only when its author is the owner of that team. Upgrade to Pro if others need to push.
4. **On a Pro or Enterprise team, the author is not a team member.** Vercel says the commit author must be a member of the team that holds the project. If the team uses manual approval, approve the pending member first. After approval the committer must redeploy.

Collaboration is free for public repositories, according to the same guide.

## How do I fix it?

Set the email, then make a new commit so Vercel sees the corrected author. Replace the address with one on your git provider account.

```
git config user.email "you@example.com"
git commit --allow-empty -m "Trigger deploy"
git push
```

Commits already made keep their old author. A new commit with the right email is what Vercel checks.

## What if the commit came from a bot or an agent?

Vercel's guide says to make sure bot commits are configured properly by the git provider and clearly identified as automated. If a coding agent commits for you, check which email it used with `git log -1 --format=%ae`.

## Where does Spooky fit?

Spooky Particles watches your Vercel projects, and when a production deploy fails it alerts you on ntfy or email and passes the error line to your coding agent, Claude Code or Codex. The agent proposes the fix, for example a pull request. Spooky never changes your code itself.

You can paste this into your coding agent when the error appears:

```
My Vercel deploy failed with "A commit author is required". Run git log -1 --format=%ae to show the author email, compare it with the verified emails on my GitHub account, and tell me what to change.
```

To turn Spooky on, give your agent [setup.md](/setup.md). The [quickstart](/docs/quickstart) has the same steps, and [automate fixes](/automate-fixes) shows how a failed deploy becomes a pull request. For other deploy errors see [Vercel deployment errors](/vercel-deployment-errors) and [Vercel deployment failed from GitHub](/vercel-deployment-failed-github).

## Price

Free, requires your own coding agent.
