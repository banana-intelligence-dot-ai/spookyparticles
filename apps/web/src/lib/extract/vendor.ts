/**
 * Vendor normalization (Tier 4): one name per company so
 * receipts group and findings dedupe. Order of trust:
 * 1. The Tier 0 sender table, when the sending address is a known vendor
 *    (deterministic; the model cannot rename Vercel).
 * 2. The alias table below for names models and vendors write several ways.
 * 3. The model's name with legal suffixes removed.
 */
import { findSender } from "@spooky/tier0";

const ALIASES: Record<string, string> = {
  "fathom analytics": "Fathom",
  "amazon web services": "AWS",
  "amazon web services, inc.": "AWS",
  "google cloud platform": "Google Cloud",
  "google llc": "Google",
  "microsoft azure": "Azure",
  "digitalocean, llc": "DigitalOcean",
  "fly.io": "Fly.io",
  fly: "Fly.io",
  "github, inc.": "GitHub",
  "vercel inc.": "Vercel",
  "vercel inc": "Vercel",
  "supabase inc": "Supabase",
  "cloudflare, inc.": "Cloudflare",
  "openai, llc": "OpenAI",
  "anthropic pbc": "Anthropic",
  "anthropic, pbc": "Anthropic",
  "namecheap, inc.": "Namecheap",
  "godaddy.com, llc": "GoDaddy",
  "stripe, inc.": "Stripe",
};

const LEGAL_SUFFIX = /[,\s]+(inc\.?|llc\.?|ltd\.?|limited|corp\.?|corporation|gmbh|pbc|co\.|s\.a\.|b\.v\.)$/i;

export function cleanVendorName(name: string): string {
  let n = name.trim().replace(/\s+/g, " ");
  const alias = ALIASES[n.toLowerCase()];
  if (alias) return alias;
  for (let i = 0; i < 2; i += 1) n = n.replace(LEGAL_SUFFIX, "").trim();
  return ALIASES[n.toLowerCase()] ?? n;
}

/**
 * The vendor to store. Processor receipts (Stripe on behalf of Loom) arrive
 * from the processor's domain, so the sender table is trusted only when the
 * model agrees it is not a processor receipt, i.e. when the model's own vendor
 * is the processor or unknown.
 */
export function canonicalVendor(input: { modelVendor: string | null; tier1Vendor: string | null; fromAddress: string | null }): string {
  const known = input.fromAddress ? findSender(input.fromAddress) : undefined;
  const model = input.modelVendor && input.modelVendor.toLowerCase() !== "unknown" ? cleanVendorName(input.modelVendor) : null;
  const tier1 = input.tier1Vendor && input.tier1Vendor.toLowerCase() !== "unknown" ? cleanVendorName(input.tier1Vendor) : null;
  if (known) {
    // Platforms that bill on behalf of many products: the model's vendor is the
    // product (Spotify via the App Store, Loom via Stripe), unless it only saw the platform.
    const processor = /^(stripe|paddle|paypal|apple|apple app store connect|app store|google play|google|amazon)$/i.test(known.vendor);
    if (!processor) return known.vendor;
    if (model && model.toLowerCase() !== known.vendor.toLowerCase()) return model;
  }
  return model ?? tier1 ?? known?.vendor ?? "unknown";
}
