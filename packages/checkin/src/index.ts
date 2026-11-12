/**
 * spooky-checkin: tell Spooky Particles each time a scheduled job runs.
 *
 * Spooky gives each job a check-in link. When a run is late, or reports a failure,
 * Spooky alerts. The link is the only credential, so this file never logs it.
 * A check-in never throws and never changes what your job returns.
 */

export type CheckinStatus = "ok" | "start" | "fail";

export type CheckinOptions = {
  /** The job's check-in link. Defaults to the SPOOKY_PING_URL environment variable. */
  url?: string;
  /** A short note kept with the run, at most 500 characters. Never put a secret here. */
  note?: string;
  /** How long to wait for Spooky on each try. Default 5000. */
  timeoutMs?: number;
  /** Extra tries after a network error or a server error. Default 2. */
  retries?: number;
  /** For tests. */
  fetch?: typeof fetch;
};

export type WithCheckinOptions = CheckinOptions & {
  /** Also send a check-in when the run starts, so Spooky can tell a run that hangs. Default false. */
  start?: boolean;
  /**
   * Which requests count as a run. "cron" (default) counts only calls from Vercel's scheduler,
   * so opening the route in a browser does not mark the job as run. "all" counts every call.
   */
  only?: "cron" | "all";
  /** The note sent with a failure. Default: the error's name only, never its message. */
  failNote?: (error: unknown) => string;
};

const NOTE_MAX = 500;
const warned = new Set<string>();

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[spooky-checkin] ${message}`);
}

function envUrl(): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.SPOOKY_PING_URL;
}

function pingUrl(raw: string | undefined, status: CheckinStatus): URL | null {
  if (!raw) {
    warnOnce("missing", "SPOOKY_PING_URL is not set, so no check-in was sent.");
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    warnOnce("invalid", "SPOOKY_PING_URL is not a valid link, so no check-in was sent.");
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    warnOnce("insecure", "SPOOKY_PING_URL must start with https://, so no check-in was sent.");
    return null;
  }
  url.searchParams.set("status", status);
  return url;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send one check-in. Resolves true when Spooky recorded it, false otherwise. Never throws.
 *
 *   await checkin();                      // the run finished
 *   await checkin("fail", { note: "…" }); // the run failed
 */
export async function checkin(status: CheckinStatus = "ok", options: CheckinOptions = {}): Promise<boolean> {
  const url = pingUrl(options.url ?? envUrl(), status);
  if (!url) return false;
  const send = options.fetch ?? globalThis.fetch;
  const tries = 1 + Math.max(0, Math.floor(options.retries ?? 2));
  const body = options.note ? options.note.slice(0, NOTE_MAX) : "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await send(url, {
        method: "POST",
        body,
        headers: { "content-type": "text/plain" },
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
      });
      if (res.status >= 500) throw new Error(`server ${res.status}`);
      if (!res.ok) {
        warnOnce(`http${res.status}`, `Spooky answered ${res.status}, so the check-in was not recorded.`);
        return false;
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (data?.ok) return true;
      warnOnce(
        `reason:${data?.reason ?? "unknown"}`,
        data?.reason === "paused"
          ? "This job is paused in Spooky, so the check-in was not recorded."
          : "Spooky did not recognize this check-in link. Copy it again from the Jobs page.",
      );
      return false;
    } catch {
      if (attempt < tries) await sleep(250 * attempt);
    }
  }
  warnOnce("unreachable", "Could not reach Spooky, so the check-in was not sent. The job itself was not affected.");
  return false;
}

function isScheduler(req: Request): boolean {
  return (req.headers.get("user-agent") ?? "").toLowerCase().startsWith("vercel-cron/");
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "Error";
}

/**
 * Wrap a cron route so each run checks in: ok when it answers 2xx or 3xx, fail when it throws
 * or answers 4xx or 5xx. The route's answer and errors pass through unchanged.
 *
 *   export const GET = withCheckin(async (req) => { …; return Response.json({ done: true }); });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withCheckin<H extends (req: Request, ...rest: any[]) => Response | Promise<Response>>(
  handler: H,
  options: WithCheckinOptions = {},
): H {
  const { start = false, only = "cron", failNote = errorName, ...send } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrapped = async (req: Request, ...rest: any[]): Promise<Response> => {
    const counts = only === "all" || isScheduler(req);
    if (counts && start) await checkin("start", send);
    let res: Response;
    try {
      res = await handler(req, ...rest);
    } catch (error) {
      if (counts) await checkin("fail", { ...send, note: safeNote(failNote, error) });
      throw error;
    }
    if (counts) {
      if (res.status >= 400) await checkin("fail", { ...send, note: `HTTP ${res.status}` });
      else await checkin("ok", send);
    }
    return res;
  };
  return wrapped as unknown as H;
}

function safeNote(failNote: (error: unknown) => string, error: unknown): string {
  try {
    return String(failNote(error)).slice(0, NOTE_MAX);
  } catch {
    return "Error";
  }
}
