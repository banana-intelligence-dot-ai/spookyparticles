/**
 * Where an alert goes: ntfy (a phone), Slack or Microsoft Teams (a webhook), or email.
 * Each delivery is one HTTP call with a timeout; nothing here throws. Targets are the
 * user's own topic, webhook URL or address, encrypted at rest and shown masked.
 */
import { and, eq } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getDb, schema } from "@/db";
import { appendAudit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { sendEmail } from "./email";

export type ChannelKind = "ntfy" | "slack" | "teams" | "email";
export type Notice = { subject: string; text: string; html?: string; link?: string | null; priority?: "high" | "default" | "low" };
export type DeliveryResult = { kind: ChannelKind; label: string; ok: boolean; reason?: string };

const TIMEOUT_MS = 8_000;
const ADDRESS_REJECTED = "This address is no longer accepted. Remove it and add it again.";

/** True for addresses that must never be an alert destination. */
export function isRestrictedAddress(address: string): boolean {
  if (address.includes(":")) {
    const value = address.toLowerCase().split("%", 1)[0];
    if (isIP(value) !== 6) return true;
    const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(value);
    const expanded = dotted ? value.replace(dotted[1], (() => {
      const octets = dotted[1].split(".").map(Number);
      return `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    })()) : value;
    const halves = expanded.split("::");
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const words = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right].map((word) => parseInt(word, 16));
    const first = words[0];
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      const n = words[6] * 65536 + words[7];
      return isRestrictedAddress(`${n >>> 24}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`);
    }
    return words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1 ||
      (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
  }
  if (isIP(address) !== 4) return true;
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

function allowedUrl(kind: Exclude<ChannelKind, "email">, value: string, legacyTopic = false): URL | null {
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.hash) return null;
  if (kind === "slack") return u.hostname === "hooks.slack.com" && /^\/(services|workflows)\/[A-Za-z0-9/_-]+$/.test(u.pathname) && !u.search ? u : null;
  if (kind === "teams") return (u.hostname.endsWith(".webhook.office.com") || u.hostname.endsWith(".logic.azure.com")) ? u : null;
  const host = u.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (isIP(host) || host === "localhost" || [".local", ".internal", ".localhost", ".lan"].some((suffix) => host.endsWith(suffix))) return null;
  const topic = u.pathname.slice(1);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(topic) && !(legacyTopic && /^[A-Za-z0-9_-]{3,64}$/.test(topic))) return null;
  return !u.search ? u : null;
}

/** Accept and normalize a target for a kind, or say why not. Never returns the raw secret in the error. */
export function validateTarget(kind: ChannelKind, raw: string): { ok: true; target: string; label: string } | { ok: false; reason: string } {
  const v = raw.trim();
  switch (kind) {
    case "ntfy": {
      // A bare topic on ntfy.sh, or a full URL to a topic on any ntfy server.
      if (/^[A-Za-z0-9_-]{20,64}$/.test(v)) return { ok: true, target: `https://ntfy.sh/${v}`, label: `ntfy.sh/${v.slice(0, 3)}…` };
      const u = allowedUrl("ntfy", v);
      return u ? { ok: true, target: u.toString(), label: `${u.hostname}/${u.pathname.slice(1, 4)}…` } : { ok: false, reason: "ntfy needs a topic of 20 to 64 letters, digits, hyphens or underscores, or a safe https topic URL" };
    }
    case "slack": {
      if (!allowedUrl("slack", v)) return { ok: false, reason: "Slack needs an incoming webhook URL from hooks.slack.com" };
      return { ok: true, target: v, label: "Slack webhook" };
    }
    case "teams": {
      if (!allowedUrl("teams", v)) return { ok: false, reason: "Teams needs the https URL of a Workflows or Incoming Webhook" };
      return { ok: true, target: v, label: "Teams webhook" };
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 200) return { ok: false, reason: "That is not an email address" };
      const [user, host] = v.toLowerCase().split("@");
      return { ok: true, target: v.toLowerCase(), label: `${user.slice(0, 2)}…@${host}` };
    }
  }
}

async function post(url: string, init: RequestInit): Promise<{ ok: boolean; reason?: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, redirect: "error", signal: ctl.signal });
    return res.ok ? { ok: true } : { ok: false, reason: `http ${res.status}` };
  } catch (err) {
    return { ok: false, reason: (err as Error).name === "AbortError" ? "timeout" : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** One delivery. The target is already decrypted by the caller and never logged. */
export async function deliverTo(kind: ChannelKind, target: string, n: Notice): Promise<{ ok: boolean; reason?: string }> {
  if (kind !== "email") {
    const url = allowedUrl(kind, target, true);
    if (!url) return { ok: false, reason: ADDRESS_REJECTED };
    if (kind === "ntfy") {
      try {
        const addresses = await lookup(url.hostname, { all: true });
        if (!addresses.length || addresses.some((entry) => isRestrictedAddress(entry.address))) return { ok: false, reason: ADDRESS_REJECTED };
      } catch { return { ok: false, reason: ADDRESS_REJECTED }; }
    }
  }
  const body = n.link ? `${n.text}\n${n.link}` : n.text;
  switch (kind) {
    case "ntfy":
      return post(target, {
        method: "POST",
        headers: {
          Title: n.subject.replace(/[^\x20-\x7e]/g, "").slice(0, 200),
          Priority: n.priority === "high" ? "high" : n.priority === "low" ? "low" : "default",
          Tags: n.priority === "high" ? "rotating_light" : "white_check_mark",
          ...(n.link ? { Click: n.link } : {}),
          "Content-Type": "text/plain; charset=utf-8",
        },
        body: n.text,
      });
    case "slack":
      return post(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: `*${n.subject}*\n${body}` }) });
    case "teams":
      return post(target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  { type: "TextBlock", text: n.subject, weight: "Bolder", wrap: true },
                  { type: "TextBlock", text: n.text, wrap: true },
                ],
                actions: n.link ? [{ type: "Action.OpenUrl", title: "Open", url: n.link }] : [],
              },
            },
          ],
        }),
      });
    case "email": {
      const r = await sendEmail({ to: target, subject: n.subject, text: body, html: n.html ?? `<pre style="font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</pre>` });
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    }
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export type ChannelView = { id: string; kind: ChannelKind; label: string; project: string | null; enabled: boolean; lastOkAt: string | null; lastError: string | null; createdAt: string };

export function cleanChannelProject(raw: unknown): string | null {
  return typeof raw === "string" ? raw.trim().slice(0, 120) || null : null;
}

export function matchesProject(channelProject: string, alertProject: string | null | undefined): boolean {
  const channel = channelProject.trim().toLowerCase();
  const alert = alertProject?.trim().toLowerCase();
  if (!channel || !alert) return false;
  if (channel === alert) return true;
  const a = channel.split("/");
  const b = alert.split("/");
  return a.length === 2 && b.length === 1 && a[1] === b[0] || b.length === 2 && a.length === 1 && b[1] === a[0];
}

export async function listChannels(userId: string): Promise<ChannelView[]> {
  const rows = await getDb().select().from(schema.alertChannels).where(eq(schema.alertChannels.userId, userId)).orderBy(schema.alertChannels.createdAt);
  return rows.map((r) => ({ id: r.id, kind: r.kind, label: r.label, project: r.project, enabled: r.enabled, lastOkAt: r.lastOkAt?.toISOString() ?? null, lastError: r.lastError, createdAt: r.createdAt.toISOString() }));
}

export async function addChannel(userId: string, kind: ChannelKind, raw: string, project: string | null = null): Promise<{ ok: true; channel: ChannelView } | { ok: false; reason: string }> {
  const v = validateTarget(kind, raw);
  if (!v.ok) return v;
  const sealed = encrypt(v.target);
  const [row] = await getDb()
    .insert(schema.alertChannels)
    .values({ userId, kind, label: v.label, project, encryptedTarget: sealed.ciphertext, keyId: sealed.keyId })
    .returning();
  // Audit the channel id and kind only, never the secret address.
  await appendAudit({ actor: `user:${userId}`, userId, action: "alert_channel.added", target: `alert_channel:${row.id}`, after: { kind: row.kind } });
  return { ok: true, channel: { id: row.id, kind: row.kind, label: row.label, project: row.project, enabled: row.enabled, lastOkAt: null, lastError: null, createdAt: row.createdAt.toISOString() } };
}

export async function updateChannelProject(userId: string, id: string, project: string | null): Promise<ChannelView | null> {
  const [row] = await getDb().update(schema.alertChannels).set({ project }).where(and(eq(schema.alertChannels.userId, userId), eq(schema.alertChannels.id, id))).returning();
  if (!row) return null;
  await appendAudit({ actor: `user:${userId}`, userId, action: "alert_channel.updated", target: `alert_channel:${id}`, after: { project } });
  return { id: row.id, kind: row.kind, label: row.label, project: row.project, enabled: row.enabled, lastOkAt: row.lastOkAt?.toISOString() ?? null, lastError: row.lastError, createdAt: row.createdAt.toISOString() };
}

export async function removeChannel(userId: string, id: string): Promise<boolean> {
  const r = await getDb().delete(schema.alertChannels).where(and(eq(schema.alertChannels.userId, userId), eq(schema.alertChannels.id, id))).returning({ id: schema.alertChannels.id });
  if (r.length > 0) await appendAudit({ actor: `user:${userId}`, userId, action: "alert_channel.removed", target: `alert_channel:${id}` });
  return r.length > 0;
}

/**
 * Send to every enabled channel the user has. With none, email the account address, so an
 * alert never has nowhere to go. Returns one result per channel for the alerts row.
 */
export async function deliverToAll(userId: string, n: Notice, project?: string | null): Promise<DeliveryResult[]> {
  const db = getDb();
  const channels = (await db.select().from(schema.alertChannels).where(and(eq(schema.alertChannels.userId, userId), eq(schema.alertChannels.enabled, true))))
    .filter((c) => c.project === null || matchesProject(c.project, project));
  const results: DeliveryResult[] = [];
  if (!channels.length) {
    const [u] = await db.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, userId)).limit(1);
    if (u?.email) {
      const r = await deliverTo("email", u.email, n);
      results.push({ kind: "email", label: "account email", ok: r.ok, reason: r.reason });
    }
    return results;
  }
  for (const c of channels) {
    let target: string;
    try {
      target = decrypt(c.encryptedTarget);
    } catch {
      results.push({ kind: c.kind, label: c.label, ok: false, reason: "could not read target" });
      continue;
    }
    const r = await deliverTo(c.kind, target, n);
    results.push({ kind: c.kind, label: c.label, ok: r.ok, reason: r.reason });
    await db
      .update(schema.alertChannels)
      .set(r.ok ? { lastOkAt: new Date(), lastError: null } : { lastError: (r.reason ?? "failed").slice(0, 120) })
      .where(eq(schema.alertChannels.id, c.id));
  }
  return results;
}
