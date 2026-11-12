import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { expirations } from "./expirations";

export async function expirationsFor(userId: string, now = new Date()) {
  const nodes = await getDb().select({ kind: schema.nodes.kind, name: schema.nodes.name, attributes: schema.nodes.attributes }).from(schema.nodes).where(eq(schema.nodes.userId, userId));
  return {
    items: expirations(nodes, now),
    unknownDomains: nodes.filter((n) => n.kind === "domain" && n.attributes.provider === "vercel" && typeof n.attributes.expires_at !== "string")
      .map((n) => ({ name: n.name, reason: n.attributes.registration === "elsewhere" ? "registered elsewhere, date unknown" : "date unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
