/**
 * One status signal for a connection: a word, colored only when it needs the user.
 * Healthy reads as a fact ("Synced 3 hours ago"), never as a green dot.
 */
import { isRunning, isSynced, type Connection } from "./connection-model";
import { absoluteTime, relativeTime } from "./data-model";

export function ConnectionState({ c, now }: { c: Connection; now: number }) {
  const base = "text-[14px] whitespace-nowrap";
  if (c.status === "errored") return <span className={`${base} text-amber`}>Needs attention</span>;
  if (c.status === "revoked") return <span className={`${base} text-fg-3`}>Revoked</span>;
  if (c.sync?.paused) return <span className={`${base} text-amber`}>Paused</span>;
  if (c.sync?.error) return <span className={`${base} text-amber`}>Stopped</span>;
  if (isRunning(c.sync)) return <span className={`${base} text-fg`}>Syncing</span>;
  if (isSynced(c) && c.lastSyncedAt) {
    return (
      <span className={`${base} text-fg-2`} title={absoluteTime(c.lastSyncedAt)}>
        Synced {relativeTime(c.lastSyncedAt, now)}
      </span>
    );
  }
  return <span className={`${base} text-fg-2`}>Connected</span>;
}
