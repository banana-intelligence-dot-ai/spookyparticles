---
name: spooky-service
description: Make sure every outside service a Vercel project depends on is listed with its cost and whether it is still used. Records a sign-up the moment the agent makes it. Use after signing a project up for any outside service, or when asked what a project depends on.
---

# List every outside service

Covers Standard item 11: every outside service the project depends on is listed, with what it costs and whether it is still used. See [the Standard, Know what you run](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#know-what-you-run).

Spooky finds services from environment variable names and Vercel Marketplace installs, and reads cost from the Vercel bill. A service the agent signs up for directly, outside Vercel, is invisible until someone records it.

## Check

1. If the person uses Spooky, call the MCP tool `list_services` (or `GET https://spookyparticles.com/api/v1/services` with `Authorization: Bearer $SPOOKY_API_KEY`, piped in with `curl -H @-` so the key never sits on a command line). For each service, read:
   - `projects`: which projects use it.
   - `monthlyCostUsd` and `costSource` (`vercel billing`, `recorded by you` or `recorded by agent`), or `costNote` when the cost is unknown.
   - `usage.state`: `in_use`, `idle` or `unknown`, with `usage.basis` saying why.
   - `shared`: true when two or more projects use it. `shares` lists where two projects could use one service of the same kind.
   - `bill`: the whole Vercel bill for the last 30 days, per project and per product.
2. In the repo, list the outside services the code really calls: SDKs in `package.json`, variable names in `.env.example`, and webhook routes. Names only, never values.
3. A service the code uses that is missing from `list_services` is not listed.

## Fix

- **Right after the agent signs a project up for a service,** record it. This needs a Spooky key with the write scope. Use the MCP tool `record_service`, or:

  ```bash
  printf 'Authorization: Bearer %s\n' "$SPOOKY_API_KEY" | curl -fsS -X POST https://spookyparticles.com/api/v1/services \
    -H @- -H "Content-Type: application/json" \
    -d '{"project":"<vercel project>","service":"<service name>","monthlyCostUsd":0,"note":"free plan, signed up for email sending"}'
  ```

  Give `project` (the Vercel project name or the linked GitHub owner/repo) and `service`. Add `monthlyCostUsd` only when you know it. Keep `note` short.
- **A service found in step 2 but not listed:** record it the same way, and say in the note that it was found in the code.
- **A service with `usage.state` `idle`:** tell the person, with the basis. Never cancel it, delete it or remove its variables. Stopping a service is the person's call.
- Without Spooky: keep a "Services" table in the repo's README with name, what it is for, plan and monthly cost.

## Prove it is done

- Every service from step 2 appears in `list_services` with this project in `projects`.
- Report what you recorded and any idle services you passed to the person.

## Rules

- Never put a key, token, password or any secret value in `note` or anywhere else.
- Recording writes to Spooky only. It never changes the provider.
- Never cancel, downgrade or delete a service, a variable or a project.
