/**
 * Product email consent. The account email already exists (it comes from sign-in); this only
 * records whether its owner said yes to occasional emails about new features. Off by default.
 * Kept as two timestamps on the user row so the latest answer wins and the first yes is kept.
 * Both null means never asked. Every change is audited. Nothing here sends email.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { auditInsert } from "./audit";
import { ApiError } from "./http";

export const MARKETING_OPT_IN = "account.marketing_opt_in";
export const MARKETING_OPT_OUT = "account.marketing_opt_out";

export type MarketingTimes = { optInAt: Date | null; optOutAt: Date | null };
export type MarketingState = { email: string; optedIn: boolean; answered: boolean; optInAt: string | null; optOutAt: string | null };

/** Pure: opted in only when a yes exists and no later no. A tie counts as no. */
export function marketingOptedIn({ optInAt, optOutAt }: MarketingTimes): boolean {
  if (!optInAt) return false;
  return !optOutAt || optOutAt.getTime() < optInAt.getTime();
}

/** Pure: whether the owner has ever answered, so the one-time ask stays away after any answer. */
export function marketingAnswered({ optInAt, optOutAt }: MarketingTimes): boolean {
  return Boolean(optInAt || optOutAt);
}

/** Pure: the columns to write for an answer, or null when nothing changes. A repeat yes keeps the first yes. */
export function marketingChange(times: MarketingTimes, optIn: boolean, now: Date): Partial<{ marketingOptInAt: Date; marketingOptOutAt: Date }> | null {
  const on = marketingOptedIn(times);
  if (optIn) return on ? null : { marketingOptInAt: now };
  // A first "no thanks" is recorded even though the state is already off, so the ask never returns.
  return !on && times.optOutAt ? null : { marketingOptOutAt: now };
}

function view(row: { email: string } & MarketingTimes): MarketingState {
  return {
    email: row.email,
    optedIn: marketingOptedIn(row),
    answered: marketingAnswered(row),
    optInAt: row.optInAt?.toISOString() ?? null,
    optOutAt: row.optOutAt?.toISOString() ?? null,
  };
}

async function load(userId: string) {
  const [row] = await getDb()
    .select({ email: schema.user.email, optInAt: schema.user.marketingOptInAt, optOutAt: schema.user.marketingOptOutAt })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!row) throw new ApiError(404, "not_found", "User not found");
  return row;
}

/** The signed-in account's own consent. Never anyone else's. */
export async function marketingFor(userId: string): Promise<MarketingState> {
  return view(await load(userId));
}

export async function setMarketing(actor: { userId: string; label: string }, optIn: boolean, now = new Date()): Promise<MarketingState> {
  const row = await load(actor.userId);
  const change = marketingChange(row, optIn, now);
  if (!change) return view(row);
  // One transaction: consent never changes without its audit row, and never the other way round.
  const db = getDb();
  await db.batch([
    db.update(schema.user).set(change).where(eq(schema.user.id, actor.userId)),
    auditInsert({
      actor: actor.label,
      userId: actor.userId,
      action: optIn ? MARKETING_OPT_IN : MARKETING_OPT_OUT,
      target: "account:marketing_emails",
      before: { optedIn: marketingOptedIn(row) },
      after: { optedIn: optIn },
    }),
  ]);
  const next = {
    ...row,
    optInAt: change.marketingOptInAt ?? row.optInAt,
    optOutAt: change.marketingOptOutAt ?? row.optOutAt,
  };
  return view(next);
}
