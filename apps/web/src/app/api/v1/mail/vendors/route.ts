/**
 * GET /api/v1/mail/vendors: billing mail by vendor across the user's connected
 * inboxes, from stored headers. Available minutes after the first connect,
 * long before extraction; the honest early result.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { api, json } from "@/lib/http";
import { groupVendors } from "@/lib/mail-vendors";
import { requireActor } from "@/lib/require-actor";

export const GET = api(async (req) => {
  const actor = await requireActor(req);
  const db = getDb();
  // Live inboxes only (active or errored); a revoked inbox's mail is not reported.
  const inboxes = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.userId, actor.userId),
        eq(schema.connections.provider, "gmail"),
        ne(schema.connections.status, "revoked"),
      ),
    );
  if (!inboxes.length) return json({ vendors: [], unmatched: 0, messages: 0, inboxes: 0 });

  const rows = await db
    .select({
      connectionId: schema.messages.connectionId,
      from: schema.messages.from,
      replyTo: schema.messages.replyTo,
      subject: schema.messages.subject,
      date: schema.messages.date,
      listUnsubscribe: schema.messages.listUnsubscribe,
      labels: schema.messages.labels,
      attachmentNames: schema.messages.attachmentNames,
    })
    .from(schema.messages)
    .where(
      inArray(
        schema.messages.connectionId,
        inboxes.map((i) => i.id),
      ),
    );

  return json({ ...groupVendors(rows), inboxes: inboxes.length });
});
