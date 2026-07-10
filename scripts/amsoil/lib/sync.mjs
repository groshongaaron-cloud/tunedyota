// scripts/amsoil/lib/sync.mjs
// Pure decision: what to do with a freshly-parsed price vs the catalog's current one.
export const GUARDRAIL = 0.40; // reject changes beyond ±40% — almost always a parse error

// Returns { action: "apply"|"hold"|"noop", from, to, reason }.
export function decide(current, parsed, guardrail = GUARDRAIL) {
  const to = parsed && (parsed.sale != null ? parsed.sale : parsed.retail);
  if (to == null || isNaN(to) || to <= 0) return { action: "hold", from: null, to: null, reason: "no price parsed" };
  const from = current && (current.salePrice != null ? current.salePrice : current.retailPrice);
  if (from == null) return { action: "apply", from: null, to, reason: "no prior price" };
  if (to === from) return { action: "noop", from, to, reason: "unchanged" };
  const delta = Math.abs(to - from) / from;
  if (delta > guardrail) return { action: "hold", from, to, reason: `Δ${(delta * 100).toFixed(0)}% exceeds ±${guardrail * 100}% guardrail` };
  return { action: "apply", from, to, reason: `Δ${(delta * 100).toFixed(0)}%` };
}

// Apply a decision to a product record (mutates + returns it). Sets salePrice when the
// parsed sale is present, else clears it; always stamps priceVerifiedAt.
export function applyToProduct(product, parsed, todayISO) {
  product.retailPrice = parsed.retail != null ? parsed.retail : product.retailPrice;
  product.salePrice = parsed.sale != null ? parsed.sale : null;
  product.priceVerifiedAt = todayISO;
  return product;
}
