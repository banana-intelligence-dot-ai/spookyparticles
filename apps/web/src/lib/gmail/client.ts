/** Minimal Gmail REST client: list ids by query, fetch headers. No bodies. */
import { METADATA_HEADERS, type GmailMetadataMessage } from "./messages";
import type { GmailFullMessage } from "./body";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailRateLimited extends Error {
  constructor(public retryAfterSeconds: number) {
    super("gmail rate limited");
  }
}

async function gmailGet<T>(token: string, path: string, params: URLSearchParams): Promise<T | null> {
  const res = await fetch(`${BASE}${path}?${params}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null; // message deleted between list and get
  if (res.status === 429 || res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason ?? "";
    if (res.status === 429 || /rateLimitExceeded|userRateLimitExceeded/.test(reason)) {
      throw new GmailRateLimited(Number(res.headers.get("retry-after")) || 30);
    }
    throw new Error(`gmail ${path} ${res.status} ${reason}`.trim());
  }
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}`);
  return (await res.json()) as T;
}

export async function listMessageIds(
  token: string,
  q: string,
  pageToken?: string,
): Promise<{ ids: string[]; nextPageToken?: string; resultSizeEstimate: number | null }> {
  const params = new URLSearchParams({ q, maxResults: "500", includeSpamTrash: "false" });
  if (pageToken) params.set("pageToken", pageToken);
  const body = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string; resultSizeEstimate?: number }>(
    token,
    "/messages",
    params,
  );
  return {
    ids: (body?.messages ?? []).map((m) => m.id),
    nextPageToken: body?.nextPageToken,
    // Gmail's own guess at the match count. Rough (often low on big mailboxes),
    // good enough for "about N messages, M minutes".
    resultSizeEstimate: typeof body?.resultSizeEstimate === "number" ? body.resultSizeEstimate : null,
  };
}

export async function getMessageMetadata(token: string, id: string): Promise<GmailMetadataMessage | null> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of METADATA_HEADERS) params.append("metadataHeaders", h);
  return gmailGet<GmailMetadataMessage>(token, `/messages/${encodeURIComponent(id)}`, params);
}

/**
 * The full message (headers and body parts) for one Tier 0 candidate. Called
 * only by the reading pipeline; the body is held in memory for one step and
 * never stored. Costs 5 quota units like a metadata get.
 */
export async function getMessageFull(token: string, id: string): Promise<GmailFullMessage | null> {
  const params = new URLSearchParams({ format: "full" });
  return gmailGet<GmailFullMessage>(token, `/messages/${encodeURIComponent(id)}`, params);
}
