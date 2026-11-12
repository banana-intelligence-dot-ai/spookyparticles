import { isIP, type LookupFunction } from "node:net";
import { lookup } from "node:dns/promises";
import { request } from "node:https";

/** Only globally routable addresses may back a monitored public site. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    if (lower.includes(".")) return false; // Includes IPv4 mapped addresses.
    const first = parseInt(lower.split(":")[0] || "0", 16);
    return first >= 0x2000 && first <= 0x3fff && !lower.startsWith("2001:db8:");
  }
  return false;
}

/**
 * A lookup that always answers with the one address we already checked, so the
 * connection cannot be pointed somewhere else between the check and the request.
 * Node asks for a list when `all` is set (its default for new connections) and
 * for a single address otherwise; answering in the wrong shape fails every request.
 */
export function pinnedLookup(selected: { address: string; family: number }): LookupFunction {
  return (_hostname, options, callback) => {
    if (options && typeof options === "object" && options.all) callback(null, [selected]);
    else callback(null, selected.address, selected.family);
  };
}

export type PublicAddress = { address: string; family: number };

/** Resolve all answers before connecting, then use only a checked answer. */
export async function resolvePublic(host: string, timeoutMs: number, resolver: (host: string) => Promise<PublicAddress[]> = (name) => lookup(name, { all: true })): Promise<PublicAddress[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([resolver(host), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), Math.max(1, timeoutMs)); })]);
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) throw new Error("address not public");
    return addresses;
  } finally { clearTimeout(timer); }
}

/** One pinned HTTPS GET. The caller decides whether a redirect is allowed. */
export function pinnedGet(url: URL, address: PublicAddress, timeoutMs: number, headers: Record<string, string>, limit = 0): Promise<{ status: number; location?: string; body: string; capped: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0, capped = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (result: { status: number; location?: string; body: string; capped: boolean } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) reject(result); else resolve(result);
    };
    const req = request(url, { method: "GET", headers, lookup: pinnedLookup(address) }, (res) => {
      if (limit === 0) { finish({ status: res.statusCode ?? 0, location: res.headers.location, body: "", capped: false }); res.destroy(); return; }
      res.on("error", (err) => { if (!capped) finish(err); });
      res.on("data", (chunk: Buffer) => {
        if (size + chunk.length > limit) { chunks.push(chunk.subarray(0, Math.max(0, limit - size))); capped = true; res.destroy(); return; }
        chunks.push(chunk); size += chunk.length;
      });
      res.on("end", () => finish({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8"), capped }));
      res.on("close", () => { if (capped) finish({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8"), capped }); else if (!res.complete) finish(new Error("network error")); });
    });
    timer = setTimeout(() => req.destroy(new Error("timeout")), Math.max(1, timeoutMs));
    req.on("error", finish);
    req.end();
  });
}
