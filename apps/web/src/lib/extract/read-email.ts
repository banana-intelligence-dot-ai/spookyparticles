/**
 * One email through Tiers 2 and 3, cheapest path first:
 *
 * 1. Recipe (no model): if this template has an active recipe, apply it and run
 *    the checks. Clean result: done. Otherwise the recipe is marked broken.
 * 2. Cheap extractor (Haiku), then the checks in code, then a second read by
 *    the escalation model only when the checks fail or confidence is low.
 * 3. Recipe building: after a model read of a template with no active recipe,
 *    one call writes the anchors; stored only if they reproduce this record and
 *    carry no values. The next email of the template takes path 1.
 *
 * Used by the pipeline and by the eval, so the gate measures production.
 */
import type { EmailText } from "../gmail/body";
import type { ModelStage } from "../model-usage";
import { ESCALATE_MODEL, EXTRACT_MODEL, extractReceipt, type ModelUsage } from "./claude";
import { applyRecipe, buildRecipe, getRecipe, recipeReproduces, recordRecipeHit, recordRecipeMiss, saveRecipe } from "./recipes";
import type { Tier2 } from "./schemas";
import { normalizePlan, validateReceipt, type ValidatedReceipt } from "./validate";
import { canonicalVendor } from "./vendor";

/** Below this, or with any failed check on a money record, the escalation model reads the email again. */
export const ESCALATE_BELOW = 0.75;

export type ReadEmailResult =
  | {
      ok: true;
      record: Tier2;
      validated: ValidatedReceipt;
      vendor: string;
      plan: string | null;
      /** Model that produced the record, or "recipe:v<n>" when no model ran. */
      model: string;
      escalated: boolean;
      viaRecipe: boolean;
      recipeBuilt: boolean;
      usage: ModelUsage[];
    }
  | { ok: false; reason: string; usage: ModelUsage[] };

export type ReadEmailOptions = {
  extractModel?: string;
  escalateModel?: string | null;
  /** Template key; recipes are looked up and written under it. Null disables recipes. */
  fingerprint?: string | null;
  /** Build a recipe after a model read (default true when a fingerprint is given). */
  buildRecipes?: boolean;
  /** Test seam: in-memory recipes instead of the database. */
  store?: RecipeStore;
  /** Production accounting hooks; omitted by the offline eval. */
  beforeModelCall?: () => Promise<void>;
  onModelUsage?: (stage: ModelStage, usage: ModelUsage) => Promise<void>;
};

export type RecipeStore = {
  get: (fingerprint: string) => Promise<{ anchors: Parameters<typeof applyRecipe>[0]["anchors"]; defaults: Parameters<typeof applyRecipe>[0]["defaults"]; version: number; status: "active" | "broken" } | null>;
  save: (input: { fingerprint: string; vendor: string; anchors: Parameters<typeof applyRecipe>[0]["anchors"]; defaults: Parameters<typeof applyRecipe>[0]["defaults"]; model: string }) => Promise<{ version: number }>;
  hit: (fingerprint: string) => Promise<void>;
  miss: (fingerprint: string) => Promise<void>;
};

const dbStore: RecipeStore = {
  get: async (f) => {
    const r = await getRecipe(f);
    return r ? { anchors: r.anchors, defaults: r.defaults, version: r.version, status: r.status } : null;
  },
  save: async (input) => ({ version: (await saveRecipe(input)).version }),
  hit: recordRecipeHit,
  miss: recordRecipeMiss,
};

function needsEscalation(rec: Tier2, v: ValidatedReceipt): boolean {
  if (v.confidence < ESCALATE_BELOW) return true;
  const money = rec.type === "receipt" || rec.type === "payment_failed" || rec.type === "renewal_notice" || rec.type === "trial_notice";
  return money && v.checks.failed.length > 0;
}

/** Deterministic post-rules the models get right only most of the time. */
function touchUp(rec: Tier2): Tier2 {
  if (rec.type === "renewal_notice" && rec.domain_names.length) return { ...rec, type: "domain_or_dns" };
  return rec;
}

export async function readEmail(e: EmailText, opts: ReadEmailOptions = {}): Promise<ReadEmailResult> {
  const usage: ModelUsage[] = [];
  const store = opts.store ?? dbStore;
  const fingerprint = opts.fingerprint ?? null;
  const ctx = { emailDate: e.date, tier1Confidence: null, senderVerified: e.auth.verified };

  // 1. Recipe.
  let recipeWasActive = false;
  if (fingerprint) {
    const recipe = await store.get(fingerprint);
    if (recipe && recipe.status === "active") {
      recipeWasActive = true;
      const rec = applyRecipe(recipe, e.text);
      const v = rec ? validateReceipt(rec, ctx) : null;
      const money = rec && (rec.type === "receipt" || rec.type === "payment_failed");
      if (rec && v && v.checks.failed.length === 0 && (!money || v.amountCents !== null)) {
        await store.hit(fingerprint);
        const final = touchUp(rec);
        const vendor = canonicalVendor({ modelVendor: final.vendor, tier1Vendor: null, fromAddress: e.fromAddress });
        return { ok: true, record: final, validated: v, vendor, plan: normalizePlan(final.plan, vendor), model: `recipe:v${recipe.version}`, escalated: false, viaRecipe: true, recipeBuilt: false, usage };
      }
      await store.miss(fingerprint);
    }
  }

  // 2. Model, with escalation.
  const extractModel = opts.extractModel ?? EXTRACT_MODEL;
  await opts.beforeModelCall?.();
  const first = await extractReceipt(e, extractModel);
  if (first.usage) await opts.onModelUsage?.("extract_cheap", first.usage);
  if (!first.ok) return { ok: false, reason: first.reason, usage: first.usage ? [first.usage] : [] };
  usage.push(first.usage);
  let rec = first.value;
  let v = validateReceipt(rec, ctx);
  let model = first.usage.model;
  let escalated = false;

  const escalateModel = opts.escalateModel === undefined ? ESCALATE_MODEL : opts.escalateModel;
  if (escalateModel && escalateModel !== extractModel && needsEscalation(rec, v)) {
    await opts.beforeModelCall?.();
    const second = await extractReceipt(e, escalateModel);
    if (second.usage) await opts.onModelUsage?.("extract_escalate", second.usage);
    if (second.ok) {
      usage.push(second.usage);
      const v2 = validateReceipt(second.value, ctx);
      if (v2.checks.failed.length <= v.checks.failed.length) {
        rec = second.value;
        v = v2;
        model = second.usage.model;
        escalated = true;
      }
    }
  }
  rec = touchUp(rec);
  const vendor = canonicalVendor({ modelVendor: rec.vendor, tier1Vendor: null, fromAddress: e.fromAddress });

  // 3. Recipe building: only for money and notice templates worth remembering, and only from clean reads.
  let recipeBuilt = false;
  const worthIt = rec.type !== "other" && v.checks.failed.length === 0 && (rec.amount !== null || rec.due_at !== null);
  if (fingerprint && (opts.buildRecipes ?? true) && worthIt && (!recipeWasActive || true)) {
    await opts.beforeModelCall?.();
    const built = await buildRecipe(e, { ...rec, vendor });
    if (built.usage) await opts.onModelUsage?.("recipe_build", built.usage);
    if (built.usage) usage.push(built.usage);
    if (built.ok && recipeReproduces({ anchors: built.anchors, defaults: built.defaults }, e.text, { ...rec, vendor })) {
      await store.save({ fingerprint, vendor, anchors: built.anchors, defaults: built.defaults, model: built.usage.model });
      recipeBuilt = true;
    }
  }

  return { ok: true, record: rec, validated: v, vendor, plan: normalizePlan(rec.plan, vendor), model, escalated, viaRecipe: false, recipeBuilt, usage };
}
