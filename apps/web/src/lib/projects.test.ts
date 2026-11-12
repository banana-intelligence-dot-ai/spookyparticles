import { describe, expect, it } from "vitest";
import { providerFromUrl } from "./projects";

describe("providerFromUrl", () => {
  it("names the host from well-known deployment domains", () => {
    expect(providerFromUrl("https://spooky-particles-git-main-banana.vercel.app")).toBe("Vercel");
    expect(providerFromUrl("https://docs-site.netlify.app/")).toBe("Netlify");
    expect(providerFromUrl("https://api.onrender.com")).toBe("Render");
    expect(providerFromUrl("https://app.fly.dev")).toBe("Fly.io");
    expect(providerFromUrl("https://web-production.up.railway.app")).toBe("Railway");
    expect(providerFromUrl("https://site.pages.dev")).toBe("Cloudflare");
    expect(providerFromUrl("https://github.com/octocat/hello-world/actions/runs/23971222911/job/69920706382")).toBe("GitHub Actions");
    expect(providerFromUrl("https://github.com/octocat/hello-world")).toBeNull();
    expect(providerFromUrl("https://spookyparticles.com")).toBeNull();
    expect(providerFromUrl(null)).toBeNull();
    expect(providerFromUrl("not a url")).toBeNull();
  });
});

import { dedupeDeployments } from "./projects";

describe("dedupeDeployments", () => {
  const vercel = (env: string, at: string) => ({ environment: env, label: env, state: "success", url: "https://x.vercel.app", at, provider: "Vercel", creator: "vercel" });
  const github = (env: string, at: string) => ({ environment: env, label: env, state: "success", url: "https://x.vercel.app", at, provider: "Vercel", creator: "vercel[bot]" });
  it("drops the GitHub copy of a build the host already reports, case-insensitively", () => {
    const out = dedupeDeployments([vercel("production", "2026-11-04T07:21:56Z"), github("Production", "2026-11-03T23:24:16Z"), github("Preview", "2026-11-03T23:10:30Z"), vercel("preview", "2026-11-04T07:19:12Z")]);
    expect(out.map((d) => d.environment)).toEqual(["production", "preview"]);
  });
  it("keeps GitHub rows when the host has not reported that environment, and everything when no host rows exist", () => {
    expect(dedupeDeployments([vercel("production", "2026-11-04T07:21:56Z"), github("Staging", "2026-11-03T23:24:16Z")]).map((d) => d.environment)).toEqual(["production", "Staging"]);
    expect(dedupeDeployments([github("Production", "1"), github("Preview", "2")]).length).toBe(2);
  });
});
