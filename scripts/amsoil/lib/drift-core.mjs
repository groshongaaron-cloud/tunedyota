// scripts/amsoil/lib/drift-core.mjs
// Pure drift logic shared by the sentinel detector (price-drift-check.mjs) and
// the full-catalog triage sweep (drift-triage-sweep.mjs). No I/O, no network —
// this is the single source of truth for "what counts as price drift", so both
// the weekly tripwire and the on-drift damage report agree by construction.

export const TOLERANCE = 0.01; // dollars — anything past a rounding hair is drift

// Every per-SKU offer price found anywhere in the page's JSON-LD, keyed by
// uppercased sku. amsoil.com's shape (2026-08): ProductGroup → hasVariant[] →
// Product{sku, offers:{price}} — walked generically so template drift (Offer[],
// AggregateOffer.offers, @graph, price directly on the node) still parses.
export function parseOfferPrices(html) {
  const bySku = new Map();
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const priceOf = (n) => {
    if (n.price != null) return parseFloat(n.price);
    const offers = Array.isArray(n.offers) ? n.offers : n.offers ? [n.offers] : [];
    for (const o of offers) if (o && o.price != null) return parseFloat(o.price);
    return NaN;
  };
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.sku) {
      const price = priceOf(n);
      if (!isNaN(price)) bySku.set(String(n.sku).toUpperCase().trim(), price);
    }
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b)); } catch { /* non-JSON block */ }
  }
  return bySku;
}

// Given a catalog product and a live sku→price map, return the variants whose
// live price differs from catalog retail beyond tolerance. Handles pages that
// list the sold-each sku without its -EA suffix.
export function driftedVariants(product, livePrices, tolerance = TOLERANCE) {
  const out = [];
  for (const v of product.variants) {
    const sku = v.stockNo.toUpperCase();
    const live = livePrices.get(sku) ?? (sku.endsWith("-EA") ? livePrices.get(sku.slice(0, -3)) : undefined);
    if (live == null) continue;
    if (Math.abs(live - v.retail) > tolerance) {
      out.push({ stockNo: v.stockNo, category: product.category, catalog: v.retail, live });
    }
  }
  return out;
}
