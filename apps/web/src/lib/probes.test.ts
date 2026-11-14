import { describe, expect, it } from "vitest";
import { dueProbeOccurrence, judge, judgePage, pageLinks, todayInTimeZone, validateOutcomeInput } from "./probes";

const schedule = "35 7 * * 1-5";
const zone = "America/New_York";
const date = (s: string) => Date.parse(s);

describe("probe rules", () => {
  it("compares every operator, today and nested paths", () => {
    const body = { date: "2026-11-13", data: { count: 2, items: [{ count: 2 }] }, active: true };
    expect(judge(body, [
      { path: "date", op: "eq", value: "$today" },
      { path: "data.count", op: "gte", value: 2 },
      { path: "data.count", op: "lte", value: 2 },
      { path: "data.count", op: "gt", value: 1 },
      { path: "data.count", op: "lt", value: 3 },
      { path: "active", op: "exists" },
      { path: "data.items.0.count", op: "eq", value: 2 },
    ], "2026-11-13")).toEqual({ ok: true, note: "" });
    expect(todayInTimeZone(date("2026-11-13T02:00:00Z"), zone)).toBe("2026-11-12");
  });
  it("treats exists as has a value, and reads a list's length", () => {
    const body = { audio_url: "", headline: null, chapters: [], gone: [1, 2] };
    expect(judge(body, [
      { path: "audio_url", op: "exists" },
      { path: "headline", op: "exists" },
      { path: "chapters", op: "exists" },
      { path: "chapters.length", op: "gte", value: 1 },
      { path: "gone.length", op: "eq", value: 2 },
    ], "2026-11-13")).toEqual({ ok: false, note: 'audio_url: expected a value, got empty; headline: expected a value, got null; chapters: expected a value, got []; chapters.length: expected >= 1, got 0' });
  });
  it("reports only failed rules and caps values and the note", () => {
    const result = judge({ date: null, sentCount: 0, long: "x".repeat(500) }, [
      { path: "date", op: "eq", value: "$today" },
      { path: "sentCount", op: "gte", value: 1 },
      { path: "missing.path", op: "exists" },
      { path: "long", op: "eq", value: "short" },
    ], "2026-11-13");
    expect(result.ok).toBe(false);
    expect(result.note).toContain("date: expected 2026-11-13, got null");
    expect(result.note).toContain("sentCount: expected >= 1, got 0");
    expect(result.note).toContain("missing.path: expected a value, got missing");
    expect(result.note).not.toContain("x".repeat(61));
    expect(result.note.length).toBeLessThanOrEqual(300);
  });
});

describe("probe scheduling and input", () => {
  const probe = { url: "https://example.com/api/health", expect: [{ path: "sentCount", op: "gte", value: 1 }] };
  it("selects the latest recent unpinged occurrence only", () => {
    const due = date("2026-11-13T12:35:00Z");
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, due + 5 * 60_000)).toBe(due);
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, due, due + 5 * 60_000)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, due + 2 * 60 * 60_000 + 1)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due + 1, null, due + 5 * 60_000)).toBeNull();
    expect(dueProbeOccurrence(schedule, zone, due - 86_400_000, null, date("2026-11-14T12:35:00Z"))).toBeNull();
  });
  it("validates schedules, zones, URLs and rules", () => {
    expect((validateOutcomeInput(schedule, zone, probe).probe as { expect: unknown[] }).expect).toHaveLength(1);
    expect(() => validateOutcomeInput("bad", zone, null)).toThrow("schedule");
    expect(() => validateOutcomeInput(schedule, "Bad/Zone", null)).toThrow("timeZone");
    expect(() => validateOutcomeInput(null, zone, probe)).toThrow("schedule required");
    for (const url of ["http://example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://user@example.com/x", "https://example.com:444/x"]) expect(() => validateOutcomeInput(schedule, zone, { ...probe, url })).toThrow("probe.url");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: Array(11).fill(probe.expect[0]) })).toThrow("1 to 10");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: [{ path: "x", op: "gte", value: "1" }] })).toThrow("numeric");
    expect(() => validateOutcomeInput(schedule, zone, { ...probe, expect: [{ path: "a.*", op: "exists" }] })).toThrow("invalid rule");
  });
});

describe("outcome check safety and a daily email that sent to nobody", () => {
  it("refuses a schedule that never runs", () => {
    expect(() => validateOutcomeInput("0 0 30 2 *", "UTC", null)).toThrow(/never runs/);
  });
  it("fails a weekday with no send and passes a real one", () => {
    const rules = [{ path: "date", op: "eq" as const, value: "$today" }, { path: "sentCount", op: "gte" as const, value: 1 }];
    expect(judge({ date: null, sentCount: 0, lastSentAt: null }, rules, "2026-11-13")).toEqual({ ok: false, note: "date: expected 2026-11-13, got null; sentCount: expected >= 1, got 0" });
    expect(judge({ date: "2026-11-13", sentCount: 1 }, rules, "2026-11-13").ok).toBe(true);
    expect(judge({ date: "2026-11-12", sentCount: 3 }, rules, "2026-11-13").ok).toBe(false);
  });
  it("runs the 7:35 New York check once, at 12:35 UTC in winter", () => {
    const at = Date.parse("2026-11-13T12:37:00Z");
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), null, at)).toBe(Date.parse("2026-11-13T12:35:00Z"));
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), at, Date.parse("2026-11-13T12:42:00Z"))).toBeNull();
    expect(dueProbeOccurrence("35 7 * * 1-5", "America/New_York", Date.parse("2026-11-12T15:00:00Z"), null, Date.parse("2026-11-14T12:37:00Z"))).toBeNull();
  });
});

describe("page checks", () => {
  const html = `<nav><a href="#top">Top</a><a class="btn" href="https://news.substack.com/subscribe">Subscribe</a></nav>
    <a href='https://app.example.com/?ref=home'><span>App</span> one</a>
    <a href=https://app.example.com/?ref=foot>App again</a>
    <a href="https://www.other.dev">Other &amp; more</a>
    <a href="/about">About</a>`;
  const base = "https://www.site.test/";
  const page = { links: [{ text: "Subscribe", hrefStartsWith: "https://news.substack.com" }], answer: ["example.com", "other.dev"] };

  it("reads every link with its visible text, resolved against the page", () => {
    const links = pageLinks(html, base);
    expect(links.map((l) => l.text)).toEqual(["Top", "Subscribe", "App one", "App again", "Other & more", "About"]);
    expect(links.at(-1)!.href).toBe("https://www.site.test/about");
  });

  it("passes when the link rules hold, and lists each site to ask once", () => {
    const { failures, toCheck } = judgePage(pageLinks(html, base), page, base);
    expect(failures).toEqual([]);
    expect(toCheck).toEqual(["https://app.example.com/", "https://www.other.dev/"]);
  });

  it("names a Subscribe link that goes somewhere else, and a site that left the page", () => {
    const broken = html.replace("https://news.substack.com/subscribe", "https://evil.test/subscribe").replace("https://www.other.dev", "/other");
    const { failures } = judgePage(pageLinks(broken, base), page, base);
    expect(failures).toEqual(['"Subscribe" goes to https://evil.test/subscribe, expected https://news.substack.com', "no link to other.dev"]);
  });

  it("fails when the named link is gone", () => {
    expect(judgePage(pageLinks("<a href='/'>Home</a>", base), { links: page.links }, base).failures).toEqual(['no link named "Subscribe"']);
  });

  it("accepts a page check and refuses a bad one", () => {
    const ok = validateOutcomeInput("*/5 * * * *", "UTC", { url: "https://www.site.test/", page });
    expect(ok.probe).toEqual({ url: "https://www.site.test/", page });
    const bad = (p: unknown) => () => validateOutcomeInput("*/5 * * * *", "UTC", { url: "https://www.site.test/", page: p });
    expect(bad({})).toThrow("links or answer required");
    expect(bad({ answer: ["not a host"] })).toThrow("host names required");
    expect(bad({ links: [{ text: "x", hrefStartsWith: "javascript:alert(1)" }] })).toThrow("hrefStartsWith");
    expect(bad({ answer: Array.from({ length: 11 }, (_, i) => `a${i}.com`) })).toThrow("1 to 10 hosts");
    expect(() => validateOutcomeInput("*/5 * * * *", "UTC", { url: "https://www.site.test/", page, expect: [{ path: "ok", op: "exists" }] })).toThrow("not both");
  });
});
