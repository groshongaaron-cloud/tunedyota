// tests/seo-data.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
// ESM module under test, loaded from CJS test via dynamic import:
let M;
test.before(async () => { M = await import("../scripts/lib/seo-data.mjs"); });

test("extractMeta decodes entities so OG tags aren't double-encoded", () => {
  const m = M.extractMeta('<title>Cost &amp; Pricing</title>\n<meta name="description" content="A &amp; B">\n<link rel="canonical" href="https://tunedyota.com/x">');
  assert.equal(m.title, "Cost & Pricing");
  const og = M.buildOgTags(m);
  assert.ok(og.includes('og:title" content="Cost &amp; Pricing"'), "single-encoded");
  assert.ok(!og.includes("&amp;amp;"), "no double-encoding");
});

test("extractMeta pulls title, description, canonical", () => {
  const html = `<title>Foo | Tuned Yota</title>
<meta name="description" content="Bar baz.">
<link rel="canonical" href="https://tunedyota.com/foo">`;
  const m = M.extractMeta(html);
  assert.equal(m.title, "Foo | Tuned Yota");
  assert.equal(m.description, "Bar baz.");
  assert.equal(m.canonical, "https://tunedyota.com/foo");
});

test("buildOgTags emits og + twitter tags from meta", () => {
  const tags = M.buildOgTags({ title: "Foo", description: "Bar", canonical: "https://tunedyota.com/foo" });
  for (const n of ['og:title" content="Foo', 'og:description" content="Bar',
       'og:url" content="https://tunedyota.com/foo', 'og:type" content="website',
       'og:image" content="https://tunedyota.com/og-image.png',
       'twitter:card" content="summary_large_image']) {
    assert.ok(tags.includes(n), `missing ${n}`);
  }
});

test("buildEventsJsonLd makes one Event per active dated city with state", () => {
  const events = { "fargo": { dateISO: "2026-07-03", active: true, event: "Fargo OTT Event" },
                   "old":   { dateISO: "2026-01-01", active: false, event: "Old" } };
  const states = { "fargo": "ND" };
  const json = JSON.parse(M.buildEventsJsonLd(events, states));
  assert.equal(json["@type"], "ItemList");
  assert.equal(json.itemListElement.length, 1);
  const ev = json.itemListElement[0].item;
  assert.equal(ev["@type"], "Event");
  assert.equal(ev.startDate, "2026-07-03");
  assert.equal(ev.location.address.addressRegion, "ND");
  assert.equal(ev.organizer["@id"], "https://tunedyota.com/#business");
});

test("buildSitemap lists each page once with given lastmod", () => {
  const xml = M.buildSitemap([{ loc: "https://tunedyota.com/", priority: "1.0" }], "2026-06-18");
  assert.ok(xml.includes("<loc>https://tunedyota.com/</loc>"));
  assert.ok(xml.includes("<lastmod>2026-06-18</lastmod>"));
  assert.ok(xml.trim().startsWith("<?xml"));
});

test("BUSINESS_STUB is valid JSON with the canonical @id", () => {
  const b = JSON.parse(M.BUSINESS_STUB);
  assert.equal(b["@id"], "https://tunedyota.com/#business");
  assert.equal(b.logo["@type"], "ImageObject");
});
