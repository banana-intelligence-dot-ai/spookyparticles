---
name: spooky-deps
description: Make a project's dependencies get update pull requests on their own by adding a Dependabot file. Use when a repo has no Dependabot or Renovate setup, or when Spooky reports that nothing keeps dependencies up to date.
---

# Dependency update pull requests

Covers Standard item 9: dependencies get update pull requests on their own. See [the Standard, Keep it current](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#keep-it-current).

Old packages collect known security holes. An update bot opens each update as a pull request, so a person only reviews and merges.

## Check

1. Look for any of these in the repo: `.github/dependabot.yml`, `.github/dependabot.yaml`, `renovate.json`, `renovate.json5`, `.github/renovate.json`, `.renovaterc`, or a `renovate` key in `package.json`. If one exists, the item is met. Do not add a second bot.
2. If the person uses Spooky, call the MCP tool `list_findings` (or `GET https://spookyparticles.com/api/v1/checks` with `Authorization: Bearer $SPOOKY_API_KEY`). The check `deps_not_updated` is `open` when Spooky found no bot file. For a private repo it shows `unknown` with reason `private_repo`, because Spooky does not read files in private repos.

## Fix

On a new branch, add `.github/dependabot.yml`. Match each ecosystem to a file the repo really has:

- `package-lock.json`, `pnpm-lock.yaml` or `yarn.lock`: `npm`
- `bun.lockb` or `bun.lock`: `bun`
- `requirements.txt`, `pyproject.toml` or `uv.lock`: `pip` (or `uv` for `uv.lock`)
- `go.mod`: `gomod`
- `.github/workflows/`: `github-actions`

Add one entry per folder that has its own lock file, for example `apps/web` in a monorepo. A starting point for an npm project with GitHub Actions:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

Open one pull request. Say in the description that updates arrive weekly, at most five open at a time, and that each one should pass the project's checks before it is merged.

Docs: https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates

## Prove it is done

- The file is valid YAML: `npx -y yaml-lint .github/dependabot.yml` or any YAML parser passes.
- Every `directory` in it exists and holds the lock file for its ecosystem.
- After merge, GitHub shows the repo's Dependabot jobs under Insights, Dependency graph, Dependabot. For a public repo, `deps_not_updated` shows `ok` on Spooky's next check.

## Rules

- Never turn on auto-merge for update pull requests. A person merges.
- Never remove an existing Renovate or Dependabot setup.
- Pull requests only. Never merge.
- Never delete anything.
