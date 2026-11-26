import { describe, expect, it } from "vitest";
import { X_POST_BANNED_PATTERNS } from "./private-terms";
import { xKeysShape, lineChecks, nearIdentical, oauthHeader, parsePostedLog, planXPost, QUEUE, X_FIRST_POST_DAY, X_POSTING_DAILY, xPostingOn, xRefusal } from "./plan";

const base = { on: true, keysPresent: true, queue: QUEUE, posted: [] as string[], others: [] as string[] | null };

describe("x posts", () => {
  it("posts daily now that the first post went out clean (Nov 21)", () => {
    expect(X_POSTING_DAILY).toBe(true);
    const day = Date.parse(`${X_FIRST_POST_DAY}T17:05:00Z`);
    expect(xPostingOn(day)).toBe(true);
    expect(xPostingOn(day + 86_400_000)).toBe(true);
    expect(xPostingOn(day + 30 * 86_400_000)).toBe(true);
    expect(planXPost({ ...base, on: false })).toMatchObject({ action: "skip", reason: "off" });
  });

  it("every queued line passes its own checks", () => {
    for (const l of QUEUE) expect(lineChecks(l.text).filter((c) => !c.ok)).toEqual([]);
  });

  it("posts the top line, then the next, and nothing once all are posted", () => {
    expect(planXPost(base)).toMatchObject({ action: "post", text: QUEUE[0].text });
    expect(planXPost({ ...base, posted: [QUEUE[0].text] })).toMatchObject({ action: "post", text: QUEUE[1].text });
    expect(planXPost({ ...base, posted: QUEUE.map((l) => l.text) })).toMatchObject({ action: "skip", reason: "empty" });
  });

  it("skips when a key is missing", () => {
    expect(planXPost({ ...base, keysPresent: false })).toMatchObject({ action: "skip", reason: "keys_missing" });
  });

  it("refuses links, mentions, dashes and second lines", () => {
    const bad = ["See spookyparticles.com today.", "Read https://x.co now", "Thanks @vercel for this", "Fast — and calm", "Line one\nLine two"];
    for (const text of bad) expect(lineChecks(text).some((c) => !c.ok)).toBe(true);
    const queue = [{ text: bad[0], checked: "2026-11-19", source: "test" }];
    expect(planXPost({ ...base, queue })).toMatchObject({ action: "skip", reason: "check_failed" });
  });

  it.skipIf(X_POST_BANNED_PATTERNS.length === 0)("refuses banned words", () => {
    expect(lineChecks(X_POST_BANNED_PATTERNS[1]).some((c) => !c.ok)).toBe(true);
  });

  it("refuses a line near-identical to an earlier post or an Artifact News post", () => {
    const reworded = QUEUE[0].text.replace("names the cause", "names the cause,").toUpperCase();
    expect(nearIdentical(reworded, QUEUE[0].text)).toBe(true);
    expect(nearIdentical(QUEUE[0].text, QUEUE[1].text)).toBe(false);
    const queue = [{ text: QUEUE[0].text, checked: "2026-11-19", source: "test" }, { text: reworded, checked: "2026-11-19", source: "test" }];
    expect(planXPost({ ...base, queue, posted: [QUEUE[0].text] })).toMatchObject({ action: "skip", reason: "check_failed" });
    expect(planXPost({ ...base, others: [reworded] })).toMatchObject({ action: "skip", reason: "check_failed" });
  });

  it("fails closed when the Artifact News log cannot be read", () => {
    expect(planXPost({ ...base, others: null })).toMatchObject({ action: "skip", reason: "check_failed" });
  });

  it("reads the shared list shape and rejects anything else", () => {
    expect(parsePostedLog(["a", "b"])).toEqual(["a", "b"]);
    expect(parsePostedLog([{ text: "a" }])).toEqual(["a"]);
    expect(parsePostedLog([])).toEqual([]);
    expect(parsePostedLog({ posts: [] })).toBeNull();
    expect(parsePostedLog(["a", 3])).toBeNull();
  });

  it("queued lines are not near-copies of each other", () => {
    for (const a of QUEUE) for (const b of QUEUE) if (a !== b) expect(nearIdentical(a.text, b.text)).toBe(false);
  });

  it("refuses a line with no check record", () => {
    const queue = [{ text: "Spooky Particles reads build logs.", checked: "", source: "" }];
    expect(planXPost({ ...base, queue })).toMatchObject({ action: "skip", reason: "check_failed" });
  });

  it("signs OAuth 1.0a the way X's published example does", () => {
    // X's "Creating a signature" example values (public test keys from its docs).
    const header = oauthHeader(
      "POST",
      "https://api.twitter.com/1.1/statuses/update.json",
      { apiKey: "xvz1evFS4wEEPTGEFPHBog", apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", accessTokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" },
      { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
      "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
      "1318622958",
    );
    expect(header).toContain('oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"');
  });
});

describe("X refusal text", () => {
  it("keeps X's title, detail and error codes, and nothing else", () => {
    expect(xRefusal(401, { title: "Unauthorized", detail: "Unauthorized", type: "about:blank" } as never)).toBe("X answered 401: Unauthorized");
    expect(xRefusal(401, { errors: [{ code: 32, message: "Could not authenticate you." }] })).toBe("X answered 401: 32 Could not authenticate you.");
    expect(xRefusal(403, { title: "Forbidden", detail: "You are not permitted to perform this action." })).toBe("X answered 403: Forbidden; You are not permitted to perform this action.");
    expect(xRefusal(500, null)).toBe("X answered 500");
  });
});

describe("X key shape", () => {
  const good = { apiKey: "a".repeat(25), apiSecret: "b".repeat(50), accessToken: "1234567890-" + "c".repeat(39), accessTokenSecret: "d".repeat(45) };
  it("accepts an OAuth 1.0a set and refuses the wrong kind before any call", () => {
    expect(xKeysShape(good)).toBe("ok");
    expect(xKeysShape(null)).toBe("missing");
    expect(xKeysShape({ ...good, accessToken: "e".repeat(91) })).toBe("wrong_kind");
    expect(xKeysShape({ ...good, accessTokenSecret: "f".repeat(91) })).toBe("wrong_kind");
    expect(xKeysShape({ ...good, accessToken: "12345-ab cd" })).toBe("wrong_kind");
    expect(xKeysShape({ ...good, apiKey: "x" })).toBe("wrong_kind");
    expect(xKeysShape({ ...good, apiSecret: "b".repeat(49) + "!" })).toBe("wrong_kind");
    expect(planXPost({ ...base, keysWrongKind: true })).toMatchObject({ action: "skip", reason: "keys_wrong_kind" });
  });
});

describe("posting hour and day in Pacific", () => {
  it("is 9am Pacific in winter and summer, and the day stays today until Pacific midnight", async () => {
    const { pacificHour, pacificDay, X_POST_HOUR_PT } = await import("./plan");
    expect(X_POST_HOUR_PT).toBe(9);
    expect(pacificHour(Date.parse("2026-11-23T17:05:00Z"))).toBe(9); // PST
    expect(pacificHour(Date.parse("2026-07-01T16:05:00Z"))).toBe(9); // PDT
    expect(pacificHour(Date.parse("2026-07-01T17:05:00Z"))).toBe(10);
    expect(pacificDay(Date.parse("2026-11-24T02:00:00Z"))).toBe("2026-11-23"); // 6pm PST
    expect(pacificDay(Date.parse("2026-11-24T08:30:00Z"))).toBe("2026-11-24");
  });
});
