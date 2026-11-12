/**
 * GET /api/v1/spend: recurring spend from verified receipts. Pre-tax, annual
 * plans spread per month, usage as a trailing three-month average, unverified
 * senders counted but never summed. monthlyCents is work only; personal and
 * unknown vendors are listed with their own totals.
 *
 * Filters, repeatable: `?project=owner/repo` (or `project=unlinked` for lines no
 * repo claims) and `?inbox=address` (an inbox the bill arrived at, or the address
 * the vendor billed). The body keeps its shape with every total redone for the
 * matching lines, echoes `filters`, and lists every `projects` and `inboxes` value
 * there is to filter on.
 */
import { loadReceipts, spendFor } from "@/lib/findings";
import { linkSubscriptions } from "@/lib/findings-rules";
import { api, json } from "@/lib/http";
import { repoNodes } from "@/lib/projects";
import { requireActor } from "@/lib/require-actor";
import { parseSpendFilters, spendApiReport } from "@/lib/spend-filter";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const filters = parseSpendFilters(new URL(req.url).searchParams);
  const [receipts, repos] = await Promise.all([loadReceipts(actor.userId), repoNodes(actor.userId)]);
  const s = await spendFor(actor.userId, undefined, receipts);
  return json(spendApiReport(s, linkSubscriptions(s.subscriptions, receipts, repos), filters));
});
