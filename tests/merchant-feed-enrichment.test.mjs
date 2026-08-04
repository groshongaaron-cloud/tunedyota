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

test("no fabricated claims: no HP/torque numbers, no emissions/CARB claims, no delivery promises", () => {
  for (const item of magItems) {
    const enriched = [
      ...[...item.matchAll(/<g:product_highlight>([^<]+)<\/g:product_highlight>/g)].map((m) => m[1]),
      ...[...item.matchAll(/<g:attribute_value>([^<]+)<\/g:attribute_value>/g)].map((m) => m[1]),
      ...[...item.matchAll(/<g:product_type>([^<]+)<\/g:product_type>/g)].map((m) => m[1]),
    ].join(" ");
    for (const banned of [/\bhp\b/i, /horsepower/i, /lb-?ft/i, /CARB/, /50-state/i, /emissions-legal/i, /\bEO\b/, /delivery/i, /arrives/i, /get it by/i]) {
      assert.ok(!banned.test(enriched), `fabricated-claim risk "${banned}" in: ${enriched}`);
    }
  }
});
