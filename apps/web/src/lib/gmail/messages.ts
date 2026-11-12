/**
 * Gmail metadata (headers only) to `messages` rows. Pure functions, unit tested.
 * We request format=metadata, so bodies never reach this code.
 */
import type { MessageInsert } from "@/db/schema";

export const METADATA_HEADERS = ["From", "Reply-To", "Subject", "Date", "List-Unsubscribe"] as const;

export type GmailPart = {
  filename?: string;
  mimeType?: string;
  headers?: { name: string; value: string }[];
  parts?: GmailPart[];
};

export type GmailMetadataMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};

/** What Tier 0 looks at. Derived from headers only. */
export type HeaderView = {
  from: string | null;
  replyTo: string | null;
  subject: string | null;
  date: Date | null;
  listUnsubscribe: boolean;
  labels: string[];
  attachmentNames: string[];
};

function header(msg: GmailMetadataMessage, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const v = h?.value?.trim();
  return v ? v : null;
}

function attachmentNames(part: GmailPart | undefined, out: string[] = []): string[] {
  if (!part) return out;
  if (part.filename) out.push(part.filename);
  for (const p of part.parts ?? []) attachmentNames(p, out);
  return out;
}

function parseDate(msg: GmailMetadataMessage): Date | null {
  const raw = header(msg, "Date");
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // Fall back to Gmail's receive time (ms since epoch as a string).
  if (msg.internalDate && /^\d+$/.test(msg.internalDate)) return new Date(Number(msg.internalDate));
  return null;
}

export function toHeaderView(msg: GmailMetadataMessage): HeaderView {
  return {
    from: header(msg, "From"),
    replyTo: header(msg, "Reply-To"),
    subject: header(msg, "Subject"),
    date: parseDate(msg),
    listUnsubscribe: header(msg, "List-Unsubscribe") !== null,
    labels: msg.labelIds ?? [],
    // TODO: format=metadata does not return MIME parts, so this stays empty until
    // we decide how to get filenames without pulling bodies (format=full returns
    // inline body data). Kept in the mapping so the column fills when we do.
    attachmentNames: attachmentNames(msg.payload),
  };
}

export function toMessageRow(
  msg: GmailMetadataMessage,
  connectionId: string,
  tier0Reason: string,
): MessageInsert {
  const v = toHeaderView(msg);
  return {
    connectionId,
    gmailMessageId: msg.id,
    threadId: msg.threadId,
    from: v.from,
    replyTo: v.replyTo,
    subject: v.subject,
    date: v.date,
    listUnsubscribe: v.listUnsubscribe,
    labels: v.labels,
    attachmentNames: v.attachmentNames,
    tier0Reason,
  };
}
