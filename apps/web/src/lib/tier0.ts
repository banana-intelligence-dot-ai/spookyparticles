/**
 * Tier 0 adapter: the one place the app talks to the Tier 0 filter.
 *
 * The filter lives in packages/tier0 (@spooky/tier0): the maintained sender
 * table, localized receipt and ops terms, the Gmail query builder and the
 * header classifier. This module only maps the app's HeaderView onto the
 * package's Header type and flattens the verdict into a short reason string
 * that is stored on the messages row (tier0_reason).
 */
import { buildGmailQueries as pkgBuildGmailQueries, classifyHeader as pkgClassifyHeader } from "@spooky/tier0";
import type { HeaderView } from "./gmail/messages";

export type Tier0Query = { id: string; q: string };
export type Tier0Verdict = { candidate: boolean; reason: string };

export function buildGmailQueries(): Tier0Query[] {
  return pkgBuildGmailQueries().map((q, i) => ({ id: `q${i + 1}`, q }));
}

export function classifyHeader(h: HeaderView): Tier0Verdict {
  const c = pkgClassifyHeader({
    from: h.from ?? "",
    replyTo: h.replyTo ?? undefined,
    subject: h.subject ?? "",
    listUnsubscribe: h.listUnsubscribe,
    labels: h.labels,
    attachmentNames: h.attachmentNames,
    isSent: h.labels.includes("SENT"),
  });
  const reason = c.skipReason
    ? `skip:${c.skipReason}`
    : c.candidate
      ? c.vendor
        ? `${c.reason}:${c.vendor}`
        : c.reason
      : "skip:no_signal";
  return { candidate: c.candidate, reason };
}
