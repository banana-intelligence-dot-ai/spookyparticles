import { describe, expect, it } from "vitest";
import { providerFromCreator, providerFromUrl, providerOf } from "./hosts";
import { moveDecision, moveHome } from "./move-home";

describe("off-Vercel host detection", () => {
  it.each([
    ["https://site.netlify.app", "Netlify"],
    ["https://site.onrender.com", "Render"],
    ["https://site.up.railway.app", "Railway"],
    ["https://site.fly.dev", "Fly.io"],
    ["https://site.herokuapp.com", "Heroku"],
    ["https://site.pages.dev", "Cloudflare"],
    ["https://owner.github.io/site", "GitHub Pages"],
    ["https://site.amplifyapp.com", "AWS"],
    ["https://site.us-east-1.elasticbeanstalk.com", "AWS"],
  ])("detects %s", (url, host) => expect(providerFromUrl(url)).toBe(host));
  it.each([
    ["netlify[bot]", "Netlify"], ["render[bot]", "Render"], ["railway-app[bot]", "Railway"],
    ["fly-apps[bot]", "Fly.io"], ["heroku[bot]", "Heroku"], ["cloudflare-pages[bot]", "Cloudflare"],
    ["github-pages[bot]", "GitHub Pages"], ["aws-amplify[bot]", "AWS"],
  ])("detects creator %s", (creator, host) => expect(providerFromCreator(creator)).toBe(host));
  it("uses a deployment URL when GitHub Actions created the deploy", () => expect(providerOf("https://site.netlify.app", "github-actions")).toBe("Netlify"));
});

describe("moveHome", () => {
  const repo = { repoFullName: "octocat/site", repoUrl: "https://github.com/octocat/site" };
  it.each([
    ["Netlify", "https://vercel.com/kb/migrations"],
    ["Render", "https://vercel.com/kb/guide/migrate-render-to-vercel"],
    ["Railway", "https://vercel.com/kb/guide/migrate-railway-to-vercel"],
    ["Fly.io", "https://vercel.com/kb/guide/migrate-fly-io-to-vercel"],
    ["Heroku", "https://vercel.com/kb/migrations"],
    ["Cloudflare", "https://vercel.com/kb/migrations"],
    ["AWS", "https://vercel.com/kb/migrations"],
    ["GitHub Pages", "https://vercel.com/kb/migrations"],
  ])("offers an import and guide for %s", (host, guideUrl) => {
    const result = moveHome({ ...repo, host });
    expect(result?.importUrl).toBe("https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Foctocat%2Fsite");
    expect(result?.guide?.url).toBe(guideUrl);
    expect(result?.notes).toEqual([]);
  });
  it("adds only observed notes", () => expect(moveHome({ ...repo, host: "Netlify", creator: "github-actions" })?.notes).toEqual(["Deploys from GitHub Actions today"]));
  it("uses Heroku's Python guide only for a known Python app", () => expect(moveHome({ ...repo, host: "Heroku", language: "Python" })?.guide?.url).toBe("https://vercel.com/kb/guide/migrate-a-python-api-from-heroku-to-vercel"));
  it("skips Vercel, unknown hosts, and non-GitHub URLs", () => {
    expect(moveHome({ ...repo, host: "Vercel" })).toBeNull();
    expect(moveHome({ ...repo, host: "Unknown" })).toBeNull();
    expect(moveHome({ ...repo, host: "Render", repoUrl: "https://other.example/repo" })).toBeNull();
  });
});

describe("production move decision", () => {
  const deploy = (provider: string, at: string, environment = "production") => [{ environment, provider, state: "success", at }];
  it("remembers elsewhere and records the first Vercel success once", () => {
    expect(moveDecision(null, null, deploy("Render", "2026-11-01"))).toEqual({ kind: "remember", host: "Render", at: "2026-11-01" });
    expect(moveDecision("Render", null, deploy("Vercel", "2026-11-02"))).toEqual({ kind: "moved", host: "Render", at: "2026-11-02" });
    expect(moveDecision("Render", "2026-11-02", deploy("Vercel", "2026-11-03"))).toBeNull();
  });
  it("does not count an always-Vercel repo", () => expect(moveDecision(null, null, deploy("Vercel", "2026-11-02"))).toBeNull());
  it("uses an older observed production deploy when no host snapshot was saved", () => {
    expect(moveDecision(null, null, [...deploy("Vercel", "2026-11-02"), ...deploy("Netlify", "2026-11-01")])).toEqual({ kind: "moved", host: "Netlify", at: "2026-11-02" });
  });
  it("does not count a repo still elsewhere or a Vercel preview", () => {
    expect(moveDecision("Render", null, deploy("Render", "2026-11-02"))).toBeNull();
    expect(moveDecision("Render", null, deploy("Vercel", "2026-11-02", "preview"))).toBeNull();
  });
});
