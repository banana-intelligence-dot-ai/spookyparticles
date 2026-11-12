import { describe, expect, it, vi } from "vitest";
import { scanPublicSite, scanText, type ScanDeps } from "./public-scan";

const secret = "sk_live_" + "A".repeat(25);
const hosts = new Set(["example.com"]);
const resolve: NonNullable<ScanDeps["resolve"]> = async () => [{ address: "93.184.215.14", family: 4 }];
const page = (body: string, status = 200, location?: string) => ({ status, location, body, capped: false });

describe("public scan", () => {
  it("reports names and paths without returning or logging secret text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await scanPublicSite("https://example.com/?secret=" + secret, hosts, { resolve, get: async () => page(`<script>${secret}</script>`) });
    expect(result).toMatchObject({ state: "open", hits: [{ pattern: "Stripe live secret key", path: "/" }] });
    expect(JSON.stringify(result) + JSON.stringify(log.mock.calls)).not.toContain(secret);
    log.mockRestore();
  });
  it("refuses off-list redirects and private DNS destinations", async () => {
    expect(await scanPublicSite("https://example.com", hosts, { resolve, get: async () => page("", 302, "https://other.com/") })).toMatchObject({ state: "unknown", reason: "no_production_site" });
    const get = vi.fn(async () => page(secret));
    expect(await scanPublicSite("https://example.com", hosts, { resolve: async () => [{ address: "127.0.0.1", family: 4 }], get })).toMatchObject({ state: "unknown" });
    expect(get).not.toHaveBeenCalled();
  });
  it("follows at most three allowed redirects", async () => {
    const get = vi.fn(async () => page("", 302, "/again"));
    expect(await scanPublicSite("https://example.com", hosts, { resolve, get })).toMatchObject({ state: "unknown" });
    expect(get).toHaveBeenCalledTimes(4);
  });
  it("marks protected and unreachable sites unknown", async () => {
    expect(await scanPublicSite("https://example.com", hosts, { resolve, get: async () => page("", 403) })).toMatchObject({ state: "unknown", reason: "site_protected" });
    expect(await scanPublicSite("https://example.com", hosts, { resolve, get: async () => page("", 500) })).toMatchObject({ state: "unknown", reason: "no_production_site" });
    expect(await scanPublicSite(null, hosts, { resolve, get: async () => page(secret) })).toMatchObject({ state: "unknown", reason: "no_production_site" });
  });
  it("caps scripts at thirty files and ten hits", async () => {
    const html = Array.from({ length: 40 }, (_, i) => `<script src="/s${i}.js"></script>`).join("");
    const get = vi.fn(async (url: URL) => page(url.pathname === "/" ? html : secret));
    const result = await scanPublicSite("https://example.com", hosts, { resolve, get });
    expect(result.hits).toHaveLength(10);
    expect(get.mock.calls.length).toBeLessThanOrEqual(31);
  });
  it("limits HTML to 2 MB, each script to 3 MB, and all scripts to 20 MB", async () => {
    const largeHtml = "a".repeat(2 * 1024 * 1024 + 1);
    const limited = await scanPublicSite("https://example.com", hosts, { resolve, get: async () => page(largeHtml) });
    expect(limited).toMatchObject({ state: "unknown", reason: "scan_limited" });
    const html = Array.from({ length: 12 }, (_, i) => `<script src="/s${i}.js"></script>`).join("");
    const limits: number[] = [];
    const get: NonNullable<ScanDeps["get"]> = async (url, _address, _family, bytes) => {
      limits.push(bytes);
      return page(url.pathname === "/" ? html : "x".repeat(3 * 1024 * 1024 + 1));
    };
    const result = await scanPublicSite("https://example.com", hosts, { resolve, get });
    expect(result).toMatchObject({ state: "unknown", reason: "scan_limited" });
    expect(limits[0]).toBe(2 * 1024 * 1024);
    expect(limits.slice(1).every((n) => n <= 3 * 1024 * 1024)).toBe(true);
    expect(limits.length).toBeLessThan(13);
  });
  it("ignores publishable patterns and detects only service-role JWTs", () => {
    expect(scanText("pk_live_" + "A".repeat(25) + " AIza" + "a".repeat(35) + " phc_foo", "/")).toEqual([]);
    const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(scanText(token, "/app")).toMatchObject([{ pattern: "Supabase service role key", path: "/app" }]);
  });
  it("does not flag a bare private-key header, which crypto libraries carry, but flags a real key", () => {
    expect(scanText('const header = "-----BEGIN PRIVATE KEY-----"; const footer = "-----END PRIVATE KEY-----";', "/lib.js")).toEqual([]);
    expect(scanText('key: "-----BEGIN PRIVATE KEY-----\\n' + "M".repeat(64) + '\\n-----END PRIVATE KEY-----"', "/app.js")).toMatchObject([{ pattern: "Private key" }]);
    expect(scanText("-----BEGIN RSA PRIVATE KEY-----\n" + "M".repeat(64), "/app.js")).toMatchObject([{ pattern: "Private key" }]);
  });
  it("does not flag example connection strings, but flags one with a real password and host", () => {
    for (const example of ["postgres://user:password@localhost:5432/db", "postgresql://user:${PASSWORD}@db.example.com/app", "mysql://root:<password>@host/db", "postgres://postgres:yourpassword@db.abc.supabase.co/postgres", "redis://default:changeme@127.0.0.1:6379"]) expect(scanText(example, "/docs.js")).toEqual([]);
    const real = "postgres://app:" + "q8Zr2LmW9x" + "@ep-cool-pond-123456.us-east-2.aws.neon.tech/neondb";
    const hits = scanText(real, "/chunk.js");
    expect(hits).toEqual([{ kind: "found", pattern: "Database address with password", path: "/chunk.js" }]);
    expect(JSON.stringify(hits)).not.toContain("q8Zr2LmW9x");
  });
});
