---
name: spooky-deploy-alerts
description: Make sure someone hears when a Vercel production deploy fails, and fix a failing build as a pull request. Use when asked about failed deploys, broken builds, or deploy alerts.
---

# Failed deploy alerts

Covers Standard item 2: someone hears when a production deploy fails. See [the Standard, Keep it running](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-running).

Spooky reads the deploy results of every connected project and alerts when a production deploy fails. Each failure comes with the line from the build log that names the cause.

## Check

1. If the person uses Spooky, call the MCP tool `list_projects` (or `GET https://spookyparticles.com/api/v1/projects` with `Authorization: Bearer $SPOOKY_API_KEY`, piped in with `curl -H @-` so the key never sits on a command line). The project should be listed with its latest deployment state and time. If it is missing, Spooky is not watching it.
2. Call `GET https://spookyparticles.com/api/v1/alert-channels`. At least one channel should be listed.
3. Call `whats_broken` (or `GET /api/v1/incidents?project=<name>`). It lists failed deployments now, each with the log line that names the failure.
4. Without Spooky: `vercel ls <project> --prod` shows recent production deploys and their state. `vercel inspect <deployment url> --logs` shows a build log.

## Fix

- **Project not listed:** tell the person: "Open spookyparticles.com, sign in with Vercel, and connect the Vercel team that owns this project."
- **No alert channel:** tell the person: "Open spookyparticles.com, Jobs, then Where alerts go, and add email, Slack, Teams or an ntfy topic." The person adds it, never the agent.
- **A production deploy is failing now:** fix the build.
  1. Read the log line from the incident. Reproduce it locally with the project's own build command, usually `npm run build`.
  2. Make the smallest change that fixes it, on a new branch.
  3. Open a pull request. Put the log line and what you changed in the description.
  4. If the fix needs a new environment variable or a new secret, do not create it. Give the person its name and where to add it.

## Prove it is done

- The project is in `list_projects` and at least one alert channel is listed.
- For a build fix: the build passes locally, the preview deploy for the pull request is `READY` (`did_my_push_land` with the repo and commit, or `vercel ls`), and the pull request link is in your report.
- Spooky clears the incident on its own when a production deploy succeeds. Never say it is fixed before that.

## Rules

- Pull requests only. Never merge, never push to the default branch, never turn on auto-merge.
- Never redeploy, roll back or promote a deployment yourself. Suggest it to the person.
- Never print, copy or store a secret's value.
- Never delete a resource, a variable, a deployment or a project.
