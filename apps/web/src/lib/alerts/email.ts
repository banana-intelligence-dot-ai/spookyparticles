/**
 * Outbound email through Resend's HTTP API. The one place the app sends mail.
 * No key, no sending: `sendEmail` returns { ok: false, reason: "not_configured" }
 * and the caller records that instead of failing a sync.
 */

export type OutboundEmail = { to: string; subject: string; text: string; html: string };
export type SendResult = { ok: true; id: string | null } | { ok: false; reason: string; status?: number };

/** Banana Intelligence's one public postal address (its registered agent), on every email. */
export const POSTAL_ADDRESS = "Banana Intelligence LLC, 131 Continental Dr, Suite 305, Newark, DE 19713, US";

/** Every email ends with the sender's postal address, in text and HTML alike. */
export function withPostalFooter(mail: OutboundEmail): OutboundEmail {
  const footer = `<p style="margin:16px 0 0;color:#6f7177;font-size:12px">${POSTAL_ADDRESS}</p>`;
  const html = /<\/body>/i.test(mail.html) ? mail.html.replace(/<\/body>/i, `${footer}</body>`) : mail.html + footer;
  return { ...mail, text: `${mail.text}\n\n${POSTAL_ADDRESS}`, html };
}

export function mailerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.SP_ALERT_FROM);
}

export async function sendEmail(mail: OutboundEmail, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
  const key = env.RESEND_API_KEY;
  const from = env.SP_ALERT_FROM;
  if (!key || !from) return { ok: false, reason: "not_configured" };
  const out = withPostalFooter(mail);
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [out.to], subject: out.subject, text: out.text, html: out.html }),
    });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}`.slice(0, 200) };
  }
  if (!res.ok) return { ok: false, reason: `resend ${res.status}`, status: res.status };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: body.id ?? null };
}
