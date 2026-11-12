/**
 * Gmail backfill (Tier 0). Two phases:
 *
 * 1. search: server-side Gmail queries from Tier 0 return candidates in seconds,
 *    so the first findings can show within a minute.
 * 2. exhaustive: every header from the last 24 months, under the per-user rate
 *    limiter, adding anything the search missed.
 *
 * Durable and resumable: a crashed run continues from its last completed step.
 * Only ids and connection references cross step boundaries, never bodies or tokens.
 */
import { failRun, fetchAndStore, finishRun, getSearchQueries, listPage, setProgress, setTotalEstimate, startReading } from "./steps/gmail";
import { runErrorMessage } from "./steps/run-error";

export type BackfillInput = {
  connectionId: string;
  syncRunId: string;
  /** Run the exhaustive header scan after the search phase. Default true. */
  exhaustive?: boolean;
  /** Stop condition for the exhaustive pass. Default 150,000 messages. */
  maxMessages?: number;
};

const BATCH = 100;
const EXHAUSTIVE_QUERY = "newer_than:2y -in:chats";

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function backfillGmail(input: BackfillInput) {
  "use workflow";
  const { connectionId, syncRunId } = input;
  const maxMessages = input.maxMessages ?? 150_000;
  let scanned = 0;

  try {
    await setProgress(syncRunId, "search", 0);
    const queries = await getSearchQueries();
    for (const query of queries) {
      let pageToken: string | undefined;
      do {
        const page = await listPage(connectionId, query.q, pageToken);
        for (const ids of chunks(page.ids, BATCH)) {
          scanned += ids.length;
          await fetchAndStore({ connectionId, syncRunId, ids, mode: "search", reason: `query:${query.id}`, scannedAfter: scanned });
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    }

    // The search phase found the obvious billing mail; start reading it now.
    await startReading(connectionId);

    if (input.exhaustive !== false) {
      await setProgress(syncRunId, "exhaustive", scanned);
      let pageToken: string | undefined;
      let seen = 0;
      let estimated = false;
      do {
        const page = await listPage(connectionId, EXHAUSTIVE_QUERY, pageToken);
        if (!estimated) {
          // Gmail's estimate for the whole query, on top of what the search phase scanned.
          estimated = true;
          const total = Math.min(page.resultSizeEstimate ?? 0, maxMessages);
          if (total > 0) await setTotalEstimate(syncRunId, scanned + total);
        }
        for (const ids of chunks(page.ids, BATCH)) {
          seen += ids.length;
          scanned += ids.length;
          await fetchAndStore({ connectionId, syncRunId, ids, mode: "exhaustive", reason: "exhaustive", scannedAfter: scanned });
        }
        pageToken = page.nextPageToken;
      } while (pageToken && seen < maxMessages);
    }

    await finishRun(syncRunId, connectionId, scanned);
    // Anything the full scan added gets read too.
    await startReading(connectionId);
    return { syncRunId, scanned };
  } catch (err) {
    await failRun(syncRunId, runErrorMessage(err, "backfill failed"));
    throw err;
  }
}
