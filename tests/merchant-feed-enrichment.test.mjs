// Listing-quality enrichment in the Google Merchant Center feed generator
// (scripts/build-merchant-feed.mjs): g:product_type taxonomy, structured
// g:product_detail fitment specs, and g:product_highlight bullets on every
// Magnuson item. All values must derive from magnuson-catalog.js — nothing
// fabricated. Titles are asserted UNCHANGED: the 2026-07-29 title rewrites
// are mid-measurement (first honest CTR read 2026-08-05) and churning
// titles would contaminate that experiment.
import test from "node:test";
import assert from "node:assert";
import { buildFeed } from "../scripts/build-merchant-feed.mjs";

const { feed } = buildFeed();
const items = feed.split("<item>").slice(1).map((s) => s.split("</item>")[0]);
const itemBySku = (sku) => items.find((i) => i.includes(`<g:id>${sku}</g:id>`));
const magItems = items.filter((i) => /<g:brand>Magnuson Superchargers<\/g:brand>/.test(i));

test("every Magnuson item carries a g:product_type taxonomy path", () => {
  assert.ok(magItems.length >= 24, `expected >=24 Magnuson items, got ${magItems.length}`);
  for (const item of magItems) {
    assert.match(item, /<g:product_type>Performance Parts &gt; [^<]+ &gt; [^<]+<\/g:product_type>/,
      `missing/malformed product_type in item: ${item.slice(0, 200)}`);
  }
});

test("product_type family is derived from the kit name", () => {
  assert.match(itemBySku("01-26-57-107-BL"),
    /<g:product_type>Performance Parts &gt; Supercharger Systems &gt; Toyota Tundra<\/g:product_type>/);
  assert.match(itemBySku("05-26-57-107-BL"),
    /<g:product_type>Performance Parts &gt; Supercharger Upgrade Kits &gt; Toyota Tundra<\/g:product_type>/);
  assert.match(itemBySku("31-99-34-027-BL"),
    /<g:product_type>Performance Parts &gt; Exhaust &gt; Toyota Tundra<\/g:product_type>/);
  assert.match(itemBySku("31-99-34-005-BL"),
    /<g:product_type>Performance Parts &gt; Air Intakes &gt; Toyota Tundra<\/g:product_type>/);
});

test("structured g:product_detail fitment specs come straight from the catalog", () => {
  const item = itemBySku("01-26-57-107-BL");
  assert.match(item, /<g:product_detail><g:section_name>Fitment<\/g:section_name><g:attribute_name>Vehicle<\/g:attribute_name><g:attribute_value>Toyota Tundra<\/g:attribute_value><\/g:product_detail>/);
  assert.match(item, /<g:attribute_name>Engine<\/g:attribute_name><g:attribute_value>5\.7L 3UR-FE V8<\/g:attribute_value>/);
  assert.match(item, /<g:attribute_name>Model years<\/g:attribute_name><g:attribute_value>2007–2018<\/g:attribute_value>/);
  assert.match(item, /<g:attribute_name>Supercharger<\/g:attribute_name><g:attribute_value>TVS2650<\/g:attribute_value>/);
});

test("a SKU shared across fitments lists every fitment as its own detail", () => {
  const item = itemBySku("05-26-57-107-BL"); // fits 2007–2018 AND 2019–2021 Tundra
  assert.match(item, /<g:attribute_name>Fits<\/g:attribute_name><g:attribute_value>Toyota Tundra 2007–2018 \(5\.7L 3UR-FE V8\)<\/g:attribute_value>/);
  assert.match(item, /<g:attribute_name>Fits<\/g:attribute_name><g:attribute_value>Toyota Tundra 2019–2021 \(5\.7L 3UR-FE V8\)<\/g:attribute_value>/);
});

test("every Magnuson item has 2–10 product_highlights, each 150 chars or less", () => {
  for (const item of magItems) {
    const highlights = [...item.matchAll(/<g:product_highlight>([^<]+)<\/g:product_highlight>/g)].map((m) => m[1]);
    assert.ok(highlights.length >= 2 && highlights.length <= 10,
      `expected 2–10 highlights, got ${highlights.length}: ${item.slice(0, 200)}`);
    for (const h of highlights) assert.ok(h.length <= 150, `highlight over 150 chars: ${h}`);
  }
});

test("highlights include the authorized-dealer claim and surface the catalog note verbatim-derived", () => {
  const item = itemBySku("05-26-57-107-BL");
  assert.match(item, /<g:product_highlight>Genuine Magnuson hardware from an authorized Magnuson dealer<\/g:product_highlight>/);
  // note: "upgrades an existing TRD/TVS1900 blower · reuses your tune"
  assert.match(item, /<g:product_highlight>Upgrades an existing TRD\/TVS1900 blower — reuses your tune<\/g:product_highlight>/);
});

test("titles are byte-identical to the pre-enrichment feed (CTR experiment guard)", () => {
  assert.match(itemBySku("01-26-57-107-BL"),
    /<g:title>Magnuson TVS2650 Magnum Supercharger System — Toyota Tundra 2007–2018 \(5\.7L 3UR-FE V8\)<\/g:title>/);
  assert.match(itemBySku("31-99-34-015"),
    /<g:title>Magnuson Performance Low-Temp Radiator — Toyota Tundra 2022\+ \(3\.4L i-FORCE twin-turbo V6\)<\/g:title>/);
});

test("no fabricated claims: no HP/torque numbers, no emissions/CARB claims", () => {
  for (const item of magItems) {
    const enriched = [
      ...[...item.matchAll(/<g:product_highlight>([^<]+)<\/g:product_highlight>/g)].map((m) => m[1]),
      ...[...item.matchAll(/<g:attribute_value>([^<]+)<\/g:attribute_value>/g)].map((m) => m[1]),
      ...[...item.matchAll(/<g:product_type>([^<]+)<\/g:product_type>/g)].map((m) => m[1]),
    ].join(" ");
    for (const banned of [/\bhp\b/i, /horsepower/i, /lb-?ft/i, /CARB/, /50-state/i, /emissions-legal/i, /\bEO\b/, /get it by/i]) {
      assert.ok(!banned.test(enriched), `fabricated-claim risk "${banned}" in: ${enriched}`);
    }
  }
});

// ── Lead times (owner-sourced, Aaron 2026-08-03) ──────────────────────────────
// Supercharger kits (systems + upgrade systems) are bespoke build-to-order —
// Aaron cautions 3–5 weeks total, encoded as 12–20 business days handling +
// 3–5 transit = 15–25 business days. Everything else is Magnuson drop-ship:
// "ships in 1–3 days, arrives in 3–7", verbatim. No third profile may exist.

const shippingOf = (item) => (item.match(/<g:shipping>.*?<\/g:shipping>/s) || [])[0];

test("bespoke supercharger kits carry the 3–5 week build-to-order lead time", () => {
  for (const sku of ["01-26-57-107-BL", "05-26-57-107-BL", "01-13-34-003-BL"]) {
    const s = shippingOf(itemBySku(sku));
    assert.match(s, /<g:min_handling_time>12<\/g:min_handling_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:max_handling_time>20<\/g:max_handling_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:min_transit_time>3<\/g:min_transit_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:max_transit_time>5<\/g:max_transit_time>/, `${sku}: ${s}`);
    assert.match(itemBySku(sku), /<g:product_highlight>Built to order by Magnuson — allow 3–5 weeks<\/g:product_highlight>/, sku);
  }
});

test("drop-ship parts carry Aaron's 1–3 day handling / 3–7 day transit verbatim", () => {
  for (const sku of ["31-99-34-005-BL", "01-99-34-101", "31-19-57-215", "31-99-34-027-BL"]) {
    const s = shippingOf(itemBySku(sku));
    assert.match(s, /<g:min_handling_time>1<\/g:min_handling_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:max_handling_time>3<\/g:max_handling_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:min_transit_time>3<\/g:min_transit_time>/, `${sku}: ${s}`);
    assert.match(s, /<g:max_transit_time>7<\/g:max_transit_time>/, `${sku}: ${s}`);
    assert.ok(!/Built to order/.test(itemBySku(sku)), `${sku} wrongly marked bespoke`);
  }
});

test("every Magnuson item has exactly one of the two owner-approved lead-time profiles", () => {
  for (const item of magItems) {
    const s = shippingOf(item);
    assert.ok(s, "item missing g:shipping");
    assert.match(s, /<g:price>310\.00 USD<\/g:price>/, "flat $310 freight must survive");
    const bespoke = /<g:min_handling_time>12</.test(s) && /<g:max_transit_time>5</.test(s);
    const dropShip = /<g:min_handling_time>1</.test(s) && /<g:max_transit_time>7</.test(s);
    assert.ok(bespoke !== dropShip, `unknown lead-time profile: ${s}`);
  }
});
