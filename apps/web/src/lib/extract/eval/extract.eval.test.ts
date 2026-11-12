/**
 * The extraction gate: 95% field accuracy overall, 99% on
 * amount and vendor. Calls the real models, so it runs only with EVAL=1 and a
 * key present:  EVAL=1 npx vitest run src/lib/extract/eval
 * Cost: about 17 emails through Haiku and Opus, well under a dollar.
 */
import { describe, expect, it } from "vitest";
import { templateFingerprint } from "@/lib/gmail/body";
import { readEmail, type RecipeStore } from "../read-email";
import { EVAL_CASES } from "./fixtures";

/** In-memory recipes for the eval: built on the model pass, exercised on a second pass. */
function memoryStore(): RecipeStore & { size: () => number } {
  const map = new Map<string, { anchors: Parameters<RecipeStore["save"]>[0]["anchors"]; defaults: Parameters<RecipeStore["save"]>[0]["defaults"]; version: number; status: "active" | "broken" }>();
  return {
    get: async (f) => map.get(f) ?? null,
    save: async (i) => {
      const prev = map.get(i.fingerprint);
      const version = (prev?.version ?? 0) + 1;
      map.set(i.fingerprint, { anchors: i.anchors, defaults: i.defaults, version, status: "active" });
      return { version };
    },
    hit: async () => {},
    miss: async (f) => {
      const r = map.get(f);
      if (r) r.status = "broken";
    },
    size: () => map.size,
  };
}

const RUN = process.env.EVAL === "1" && Boolean(process.env.SP_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);

type Field = "type" | "vendor" | "amount" | "currency" | "billedAt" | "dueAt" | "plan" | "cadence" | "projectNames" | "domainNames" | "invoiceId";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9.]/g, "");

describe.skipIf(!RUN)("extraction gate", () => {
  it(
    "clears 95% overall and 99% on amount and vendor",
    async () => {
      const perField = new Map<Field, { right: number; total: number }>();
      const miss: string[] = [];
      const hit = (f: Field, ok: boolean, id: string, got: unknown, want: unknown) => {
        const e = perField.get(f) ?? { right: 0, total: 0 };
        e.total += 1;
        if (ok) e.right += 1;
        else miss.push(`${id}.${f}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
        perField.set(f, e);
      };

      let inputTokens = 0;
      let outputTokens = 0;
      let escalations = 0;
      let recipesBuilt = 0;
      const byModel = new Map<string, number>();
      const store = memoryStore();
      await Promise.all(
        EVAL_CASES.map(async (c) => {
          const fingerprint = templateFingerprint(c.email.fromAddress, c.email.html, c.email.subject);
          const r = await readEmail(c.email, { fingerprint, store });
          if (r.ok && r.recipeBuilt) recipesBuilt += 1;
          expect(r.ok, `${c.id}: read ${r.ok ? "" : r.reason}`).toBe(true);
          if (!r.ok) return;
          for (const u of r.usage) {
            inputTokens += u.inputTokens;
            outputTokens += u.outputTokens;
            byModel.set(u.model, (byModel.get(u.model) ?? 0) + 1);
          }
          if (r.escalated) escalations += 1;
          const { record: rec, validated: v } = r;
          hit("type", rec.type === c.expect.type, c.id, rec.type, c.expect.type);
          hit("vendor", norm(r.vendor) === norm(c.expect.vendor), c.id, r.vendor, c.expect.vendor);
          hit("amount", v.amountCents === c.expect.amountCents, c.id, v.amountCents, c.expect.amountCents);
          hit("currency", (v.currency ?? null) === (c.expect.currency ?? null), c.id, v.currency, c.expect.currency);
          if (c.expect.billedAt !== undefined) hit("billedAt", (v.billedAt?.toISOString().slice(0, 10) ?? null) === c.expect.billedAt, c.id, v.billedAt, c.expect.billedAt);
          if (c.expect.dueAt !== undefined) hit("dueAt", (v.dueAt?.toISOString().slice(0, 10) ?? null) === c.expect.dueAt, c.id, v.dueAt, c.expect.dueAt);
          if (c.expect.plan !== undefined) hit("plan", norm(r.plan) === norm(c.expect.plan), c.id, r.plan, c.expect.plan);
          if (c.expect.cadence !== undefined) hit("cadence", v.cadence === c.expect.cadence, c.id, v.cadence, c.expect.cadence);
          if (c.expect.projectNames !== undefined) {
            const got = rec.project_names.map(norm);
            hit("projectNames", c.expect.projectNames.every((p) => got.includes(norm(p))), c.id, rec.project_names, c.expect.projectNames);
          }
          if (c.expect.domainNames !== undefined) {
            const got = rec.domain_names.map(norm);
            hit("domainNames", c.expect.domainNames.every((p) => got.includes(norm(p))), c.id, rec.domain_names, c.expect.domainNames);
          }
          if (c.expect.invoiceId !== undefined) hit("invoiceId", norm(rec.invoice_id) === norm(c.expect.invoiceId), c.id, rec.invoice_id, c.expect.invoiceId);
        }),
      );

      // Second pass: the same emails again must now read by recipe, with the same money answer.
      let recipeReads = 0;
      let recipeAgree = 0;
      const moneyCases = EVAL_CASES.filter((c) => c.expect.amountCents !== null || c.expect.dueAt);
      await Promise.all(
        moneyCases.map(async (c) => {
          const fingerprint = templateFingerprint(c.email.fromAddress, c.email.html, c.email.subject);
          const stored = fingerprint ? await store.get(fingerprint) : null;
          if (!stored || stored.status !== "active") return;
          const r = await readEmail(c.email, { fingerprint, store, escalateModel: null, buildRecipes: false });
          if (!r.ok || !r.viaRecipe) return;
          recipeReads += 1;
          if (r.validated.amountCents === c.expect.amountCents && norm(r.vendor) === norm(c.expect.vendor)) recipeAgree += 1;
        }),
      );
      console.log(`recipes: built ${recipesBuilt} of ${moneyCases.length} money or notice templates; second pass read ${recipeReads} by recipe, ${recipeAgree} agreeing on amount and vendor`);
      expect(recipeAgree, "recipe reads must agree with the labels").toBe(recipeReads);
      expect(recipesBuilt / moneyCases.length, "share of templates that got a recipe").toBeGreaterThanOrEqual(0.7);

      let right = 0;
      let total = 0;
      const lines: string[] = [];
      for (const [f, e] of perField) {
        right += e.right;
        total += e.total;
        lines.push(`${f}: ${e.right}/${e.total}`);
      }
      const overall = right / total;
      const amount = perField.get("amount")!;
      const vendor = perField.get("vendor")!;
      console.log(`\nextraction gate: ${(overall * 100).toFixed(1)}% overall (${right}/${total}); ${lines.join(", ")}`);
      console.log(`tokens: ${inputTokens} in, ${outputTokens} out; escalations ${escalations}; calls by model ${[...byModel].map(([m, n]) => `${m}=${n}`).join(", ")}`);
      if (miss.length) console.log(`misses:\n  ${miss.join("\n  ")}`);

      expect(overall, "overall field accuracy").toBeGreaterThanOrEqual(0.95);
      expect(amount.right / amount.total, "amount accuracy").toBeGreaterThanOrEqual(0.99);
      expect(vendor.right / vendor.total, "vendor accuracy").toBeGreaterThanOrEqual(0.99);
    },
    600_000,
  );
});
