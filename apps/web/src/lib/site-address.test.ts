import { describe, expect, it, vi } from "vitest";
vi.mock("@/db", () => ({ getDb: vi.fn(), schema: {} }));
vi.mock("@/lib/alerts/channels", () => ({ deliverToAll: vi.fn() }));
vi.mock("@/lib/connections", () => ({ getAccessToken: vi.fn() }));
import { byPublicName } from "./hosts";
import { siteTargets } from "./vercel-monitor";

describe("picking a project's public address", () => {
  it("puts the owner's domain ahead of Vercel's own name, even when that name sorts first", () => {
    // "spooky-particles.vercel.app" sorts before "spookyparticles.com" by name alone.
    expect(["spookyparticles.com", "spooky-particles.vercel.app"].sort(byPublicName)).toEqual(["spookyparticles.com", "spooky-particles.vercel.app"]);
    expect(["b.com", "a.com"].sort(byPublicName)).toEqual(["a.com", "b.com"]);
  });
  it("siteTargets checks the custom domain, not the vercel.app name", () => {
    const node = (id: string, name: string, attributes: Record<string, unknown> = {}) => ({ id, userId: "u", name, status: "verified", externalKey: id, attributes, lastActivityAt: null });
    const project = { ...node("vercel:project:1", "spooky-particles", { production_url: "https://spooky-particles.vercel.app" }), status: "live" };
    const domains = [node("d1", "spooky-particles.vercel.app"), node("d2", "spookyparticles.com"), node("d3", "www.spookyparticles.com", { redirect_to: "spookyparticles.com" })];
    const links = domains.map((d) => ({ fromNodeId: d.id, toNodeId: project.id }));
    const [target] = siteTargets([project] as never, domains as never, links);
    expect(target.url).toBe("https://spookyparticles.com");
  });
});
