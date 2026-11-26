import type { ExternalApiHost } from "@/lib/providers/vercel-query";

export type OutsideApiFinding = {
  host: string;
  kind: "key_or_permission" | "quota_or_rate_limit" | "vendor_down";
  failing: number;
  total: number;
};

export function classifyOutsideApis(hosts: ExternalApiHost[], ownHosts: string[]): OutsideApiFinding[] {
  const own = new Set(ownHosts.map((host) => host.toLowerCase().replace(/\.$/, "")));
  const findings: OutsideApiFinding[] = [];
  for (const entry of hosts) {
    const host = entry.host.toLowerCase().replace(/\.$/, "");
    if (own.has(host) || host.endsWith(".vercel.app")) continue;
    const counts: Record<OutsideApiFinding["kind"], number> = {
      key_or_permission: 0,
      quota_or_rate_limit: 0,
      vendor_down: 0,
    };
    for (const [status, count] of Object.entries(entry.byStatus)) {
      if (status === "401" || status === "403") counts.key_or_permission += count;
      else if (status === "402" || status === "429") counts.quota_or_rate_limit += count;
      else if (/^5\d{2}$/.test(status)) counts.vendor_down += count;
    }
    const [kind, failing] = (Object.entries(counts) as [OutsideApiFinding["kind"], number][]).reduce((best, current) => current[1] > best[1] ? current : best);
    if (failing >= 10 && entry.total > 0 && failing / entry.total >= 0.5) findings.push({ host, kind, failing, total: entry.total });
  }
  return findings.sort((a, b) => b.failing - a.failing || a.host.localeCompare(b.host));
}
