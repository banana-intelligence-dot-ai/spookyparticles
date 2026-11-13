import { describe, expect, it } from "vitest";
import { ledger } from "./catch-log";

describe("ledger", () => {
  it("says nothing when every catch was fixed", () => {
    expect(ledger({ caught: 4, fixed: 4, open: 0, waiting: 0, closed: 0, medianFixMinutes: 10 })).toBeNull();
  });
  it("accounts for every catch that was not fixed", () => {
    expect(ledger({ caught: 21, fixed: 17, open: 2, waiting: 1, closed: 1, medianFixMinutes: 150 })).toBe("Of 21: 17 fixed, 2 still open, 1 waiting on its next run, 1 closed without a fix.");
  });
});
