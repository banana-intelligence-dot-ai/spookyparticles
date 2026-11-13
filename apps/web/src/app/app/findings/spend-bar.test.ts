import { describe, expect, it } from "vitest";
import { spendParts } from "./spend-bar";
import type { Finding, Subscription } from "../data-model";

const sub = (id: string, cents: number | null, receiptIds: string[]) => ({ id, vendor: id, monthlyCents: cents, receiptIds }) as unknown as Subscription;
const find = (receiptIds: string[], amountCents: number | null) => ({ id: "f", title: "t", amountCents, evidence: { receiptIds } }) as unknown as Finding;

describe("spendParts", () => {
  it("sorts largest first, drops zero vendors, and caps the can-go part at the vendor's cost", () => {
    const parts = spendParts([sub("a", 1000, ["r1"]), sub("b", 5000, ["r2"]), sub("c", 0, []), sub("d", null, [])], [find(["r1"], 4000), find(["r2"], 1200)]);
    expect(parts.map((p) => p.s.id)).toEqual(["b", "a"]);
    expect(parts.map((p) => p.goCents)).toEqual([1200, 1000]);
  });
  it("leaves a vendor solid when no finding rests on its receipts", () => {
    expect(spendParts([sub("a", 1000, ["r1"])], [find(["r9"], 500)])[0]).toMatchObject({ going: null, goCents: 0 });
  });
});
