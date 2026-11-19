---
title: Vercel "Root Directory does not exist" error and fix
description: What the Vercel Root Directory error means, where the setting lives, how to fix the path, and a prompt to paste into your coding agent.
published: 2026-11-18
checked: 2026-11-18
spooky: deploy
---

# The specified Root Directory does not exist on Vercel: what it means and how to fix it

This Vercel build error means the Root Directory in your project settings points at a folder your repository does not have. Open Project Settings, find Root Directory under Build and Deployment, set it to the folder that holds your app (or clear it if the app sits at the top of the repo), save, and redeploy.

## What does "The specified Root Directory does not exist" mean?

Vercel lets a project name a Root Directory: the folder inside your Git repository that holds the app to build. Vercel's own page on this setting describes it for repositories where the top-level folder is not the app, such as a repo with a `front-end` folder that holds a stand-alone Next.js app. The error appears when the path saved in that setting does not match a folder in the code Vercel just pulled.

Vercel has no docs page for this exact message. The fix below is what its settings documentation describes for the Root Directory setting, not an official fix for this error.

## How do I fix it?

1. Open your project in the Vercel dashboard and go to **Settings**.
2. Open **Build and Deployment**, then scroll down to **Root Directory**.
3. Compare the saved path with your repository. Check spelling, capital letters and slashes. If the app sits at the top of the repo, clear the field. If it lives in a folder, such as `apps/web`, enter that path.
4. Click **Save**.
5. Redeploy. Vercel says a changed root directory applies on your next deployment, so the failed deployment will not fix itself.

Source: Vercel's guide to [configuring a build](https://vercel.com/docs/builds/configure-a-build#root-directory), and its page on [monorepos](https://vercel.com/docs/monorepos).

## Why would the folder be missing?

The setting only holds a path. It does not follow your code when the code changes. Some ways the two drift apart:

- The folder was renamed or moved in a commit, and the setting still has the old name.
- The path has a typo or the wrong capital letters.
- The project was imported from a monorepo and the setting points at a different app's folder.
- The branch being deployed does not contain the folder, because the change that created it is on another branch.

Open the failed deployment, note which commit it built, and look at that commit in GitHub. If the folder is not there, the setting is wrong for that commit.

## Does it matter if I use a monorepo?

Yes. In a monorepo, each Vercel project should set its Root Directory to the folder of the app it deploys. Vercel's monorepo page says that when you import a repo you click **Edit** next to the Root Directory setting to pick the folder for that project. If you moved an app to a new folder later, update the setting to match.

Vercel's Root Directory settings also include a switch for whether the build can read files outside that folder. If a shared package goes missing after you change the path, check that switch and Vercel's [monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq).

## What can I paste into my coding agent?

Your agent can compare the repo with the setting faster than you can scroll. Paste this, and fill in the setting you see in the dashboard:

```text
My Vercel deployment failed with "The specified Root Directory does not exist".
The Root Directory saved in my Vercel project settings is: <paste it here>.
List the top-level folders in this repository and find where the app's package.json lives.
Tell me the exact path I should set as the Root Directory (or say to leave it empty),
and whether any recent commit renamed or moved that folder. Do not change any files.
```

Then set the path yourself under **Build and Deployment**, save, and redeploy.

## Related

Failed builds have many causes. The [Vercel deployment failed](/vercel-deployment-failed) page covers how to read the build log, and [a variable the build cannot find](/vercel-env-var-not-found-build) is another common cause. [Automate fixes](/automate-fixes) covers handing failures to a coding agent. This is part of [VibeOps](/vibeops), the work of keeping shipped apps running.
