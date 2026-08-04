// shippingDetails in the static Product JSON-LD on the vehicle supercharger
// pages (scripts/build-product-schema.mjs) — same $310 flat rate and the same
// two owner-sourced lead-time profiles as the merchant feed and the store
// pages, classified by the same magFamily rule. Google cross-references a SKU
// across surfaces; every surface must tell the identical story.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.join(__dirname, "..", "site");

const schemaPages = fs.readdirSync(SITE).filter((f) =>
  f.endsWith(".html") && fs.readFileSync(path.join(SITE, f), "utf8").includes("magnuson-schema.js"));

function staticProducts(html) {
  const m = html.match(/<script type="application\/ld\+json" data-magnuson="static">([\s\S]*?)<\/script>/);
  if (!m) return null;
  const ld = JSON.parse(m[1]);
  return ld["@type"] === "ItemList" ? ld.itemListElement.map((e) => e.item) : [ld];
}

test("every static Product offer carries shippingDetails with the $310 rate and a valid profile", () => {
  assert.ok(schemaPages.length >= 8, `expected 8+ schema pages, found ${schemaPages.length}`);
  let offers = 0;
  for (const f of schemaPages) {
    const products = staticProducts(fs.readFileSync(path.join(SITE, f), "utf8"));
    assert.ok(products && products.length, `${f}: no static Product block`);
    for (const p of products) {
      const sd = p.offers?.shippingDetails;
      assert.ok(sd, `${f} ${p.sku}: offer missing shippingDetails`);
      assert.strictEqual(sd.shippingRate?.value, 310, `${f} ${p.sku}: wrong shippingRate`);
      assert.strictEqual(sd.shippingDestination?.addressCountry, "US", `${f} ${p.sku}: wrong destination`);
      const h = sd.deliveryTime?.handlingTime, t = sd.deliveryTime?.transitTime;
      const bespoke = h?.minValue === 12 && h?.maxValue === 20 && t?.minValue === 3 && t?.maxValue === 5;
      const dropShip = h?.minValue === 1 && h?.maxValue === 3 && t?.minValue === 3 && t?.maxValue === 7;
      assert.ok(bespoke !== dropShip && (bespoke || dropShip), `${f} ${p.sku}: unknown lead-time profile`);
      offers++;
    }
  }
  assert.ok(offers >= 20, `expected 20+ offers checked, got ${offers}`);
});

test("vehicle-page profile agrees with the merchant feed profile for every SKU", () => {
  const feed = fs.readFileSync(path.join(SITE, "merchant-feed.xml"), "utf8");
  const feedBespoke = new Map(feed.split("<item>").slice(1).map((item) => [
    (item.match(/<g:id>([^<]+)<\/g:id>/) || [])[1],
    /<g:min_handling_time>12</.test(item),
  ]));
  let checked = 0;
  for (const f of schemaPages) {
    for (const p of staticProducts(fs.readFileSync(path.join(SITE, f), "utf8")) || []) {
      if (!feedBespoke.has(p.sku)) continue;
      const pageBespoke = p.offers.shippingDetails.deliveryTime.handlingTime.minValue === 12;
      assert.strictEqual(pageBespoke, feedBespoke.get(p.sku), `${f} ${p.sku}: feed/page profile mismatch`);
      checked++;
    }
  }
  assert.ok(checked >= 20, `expected 20+ cross-checked offers, got ${checked}`);
});

test("the client-side injector stays in lockstep (renders shippingDetails too)", () => {
  const js = fs.readFileSync(path.join(SITE, "magnuson-schema.js"), "utf8");
  assert.ok(js.includes("shippingDetails"), "site/magnuson-schema.js missing shippingDetails — lockstep broken");
  assert.ok(js.includes("OfferShippingDetails"), "client injector missing OfferShippingDetails type");
});
