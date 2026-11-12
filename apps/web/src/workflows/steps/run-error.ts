/**
 * Turn whatever a workflow step threw into the short line a sync run records.
 *
 * Inside a "use workflow" function the runtime rethrows step failures from
 * another realm, so `err instanceof Error` is false and a naive fallback hid
 * the real reason behind "backfill failed". Also keeps query parameters (mail
 * subjects, senders) out of the UI and audit log: a failed write becomes
 * "database write failed", plus the column name when Postgres gives one.
 */
export function runErrorMessage(err: unknown, fallback: string): string {
  const raw =
    typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
      ? (err as { message: string }).message
      : typeof err === "string"
        ? err
        : "";
  let line = raw.split("\n")[0].trim();
  if (!line) return fallback;
  const retried = /^Step "([^"]+)" failed after (\d+) retr(?:y|ies): (.*)$/.exec(line);
  let step = "";
  let suffix = "";
  if (retried) {
    step = retried[1].split("//").pop() ?? "";
    suffix = ` (${step}, ${retried[2]} retries)`;
    line = retried[3];
  }
  if (/^Failed query:/i.test(line)) {
    const col = /column "([^"]+)" of relation "([^"]+)" does not exist/.exec(raw);
    line = col ? `database write failed: ${col[2]}.${col[1]} missing` : "database write failed";
  }
  return (line + suffix).slice(0, 160);
}
