// scripts/amsoil/scout-new-products.mjs
// One-off scout for catalog expansion: fetch amsoil.com product pages (fresh
// browser context per product — a reused session gets CF-fingerprinted) and dump
// each page's JSON-LD Product node (name/sku/offers) + og:image, so new
// site/amsoil-garage.json entries carry REAL prices, stock numbers and images.
// Run: node scripts/amsoil/scout-new-products.mjs
import { withBrowser, fetchProductHtml } from "./lib/browser-fetch.mjs";
import { parsePrice } from "./lib/price-parse.mjs";

const URLS = [
  "https://www.amsoil.com/p/amsoil-signature-series-5w-40-100-synthetic-max-duty-diesel-oil-deo/",
  "https://www.amsoil.com/p/amsoil-5w-40-heavy-duty-100-synthetic-diesel-oil-ado/",
  "https://www.amsoil.com/p/amsoil-p-i-performance-improver-gasoline-additive-api/",
  "https://www.amsoil.com/p/amsoil-upper-cylinder-lubricant-corrosion-inhibitor-ucl/",
  "https://www.amsoil.com/p/amsoil-passenger-car-light-truck-antifreeze-coolant-antpc/",
  "https://www.amsoil.com/p/amsoil-heavy-duty-antifreeze-coolant-anthd/",
];

for (const u of URLS) {
  await withBrowser(async (page) => {
    const r = await fetchProductHtml(page, u);
    if (r.blocked) { console.log(JSON.stringify({ url: u, blocked: true, status: r.status })); return; }
    const out = { url: u, title: r.title, products: [], og: null };
    const blocks = [...r.html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    for (const b of blocks) {
      let j; try { j = JSON.parse(b); } catch { continue; }
      const nodes = Array.isArray(j) ? j : (j["@graph"] || [j]);
      for (const n of nodes) {
        if (n && /Product/.test(n["@type"] || "")) {
          out.products.push({ name: n.name, sku: n.sku, mpn: n.mpn, image: n.image,
            offers: (Array.isArray(n.offers) ? n.offers : [n.offers]).filter(Boolean)
              .map((o) => ({ sku: o.sku, price: o.price, name: o.name, itemOffered: o.itemOffered && o.itemOffered.name })) });
        }
      }
    }
    const og = r.html.match(/property="og:image" content="([^"]+)"/);
    out.og = og && og[1];
    out.parsed = parsePrice(r.html);
    out.dataPrices = [...r.html.matchAll(/data-price="([\d.]+)"/g)].map((m) => m[1]).slice(0, 6);
    out.visible = [...r.html.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) => m[1]).slice(0, 8);
    console.log(JSON.stringify(out));
  });
}
