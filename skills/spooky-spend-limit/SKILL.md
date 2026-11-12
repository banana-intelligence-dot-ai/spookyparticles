---
name: spooky-spend-limit
description: Make sure a Vercel team has a spend limit, so a traffic spike cannot become a surprise bill. Gives the person the steps. Use when asked about surprise bills, spend caps or spend management.
---

# Set a spend limit

Covers Standard item 12: a spend limit is set, so a traffic spike cannot become a surprise bill. See [the Standard, Know what you run](https://github.com/banana-intelligence-dot-ai/spookyparticles/blob/main/docs/standard/STANDARD.md#know-what-you-run).

Spooky does not check this item yet. Until it does, the person confirms it.

## Check

1. Ask the person which Vercel plan the team is on. The plan name is shown in the Vercel dashboard next to the team name.
2. **Hobby (free):** there is no bill to run up. When a free limit is reached, Vercel pauses the feature instead of charging. The item is met. Say so and stop.
3. **Pro or above:** ask the person to open Vercel, the team, Settings, Billing, and look for Spend Management. If it is on with an amount, the item is met.
4. If the person uses Spooky, `bill` in `GET https://spookyparticles.com/api/v1/services` (or the MCP tool `list_services`) shows the last 30 days of the Vercel bill per project and product. Use it to suggest a sensible amount.

## Fix

A step for the person. Money settings are never changed by an agent. Give them this, with a suggested amount:

"Open Vercel, then your team, then Settings, then Billing. Find Spend Management and turn it on. Set the amount to about <suggested amount> a month. That is roughly twice what you spent in the last 30 days. Turn on the email or webhook notices. Choose whether projects pause when the amount is reached: pausing stops the bill, and it also takes the sites offline until you raise the limit or the month ends."

Docs: https://vercel.com/docs/spend-management

Let the person choose the amount and whether to pause. Name both costs plainly: a site that goes offline, or a bill that keeps growing.

## Prove it is done

- The person confirms Spend Management is on, with the amount they chose.
- Report the amount and whether projects pause. Do not claim it is checked; Spooky does not read this setting yet.

## Rules

- Never change billing, plans, payment methods or spend settings.
- Never pause, delete or change a project.
- Never print or store payment details.
