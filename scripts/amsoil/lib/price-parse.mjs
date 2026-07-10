// scripts/amsoil/lib/price-parse.mjs
// Parse an amsoil.com product page for {retail, sale}. Prefer JSON-LD Product/offers
// (stable); fall back to a visible price. Built against a live fixture in a later task.
export function parsePrice(html) {
  const out = { retail: null, sale: null };
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    let j; try { j = JSON.parse(b); } catch { continue; }
    const nodes = Array.isArray(j) ? j : (j["@graph"] || [j]);
    for (const n of nodes) {
      if (n && /Product/.test(n["@type"] || "") && n.offers) {
        const offers = Array.isArray(n.offers) ? n.offers : [n.offers];
        const prices = offers.map((o) => parseFloat(o.price)).filter((x) => !isNaN(x));
        if (prices.length) {
          out.retail = Math.max(...prices);
          const lo = Math.min(...prices);
          out.sale = lo < out.retail ? lo : null;
          return out;
        }
      }
    }
  }
  const m = String(html).match(/data-price="([\d.]+)"/) || String(html).match(/\$([\d,]+\.\d{2})/);
  if (m) out.retail = parseFloat(m[1].replace(/,/g, ""));
  return out;
}
