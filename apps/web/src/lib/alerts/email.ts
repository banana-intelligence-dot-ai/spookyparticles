/**
 * Outbound email through Resend's HTTP API. The one place the app sends mail.
 * No key, no sending: `sendEmail` returns { ok: false, reason: "not_configured" }
 * and the caller records that instead of failing a sync.
 */

export type OutboundEmail = { to: string; subject: string; text: string; html: string };
export type SendResult = { ok: true; id: string | null } | { ok: false; reason: string; status?: number };

export function mailerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.SP_ALERT_FROM);
}

export async function sendEmail(mail: OutboundEmail, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  const key = env.RESEND_API_KEY;
  const from = env.SP_ALERT_FROM;
  if (!key || !from) return { ok: false, reason: "not_configured" };
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}`.slice(0, 200) };
  }
  if (!res.ok) return { ok: false, reason: `resend ${res.status}`, status: res.status };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: body.id ?? null };
}
