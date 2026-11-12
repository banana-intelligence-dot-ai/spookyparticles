import { isIP, type LookupFunction } from "node:net";

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
