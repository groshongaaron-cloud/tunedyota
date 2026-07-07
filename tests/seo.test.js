// tests/seo.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SITE_DIR = path.join(__dirname, "..", "site");
let SD;
test.before(async () => { SD = await import("../scripts/lib/seo-data.mjs"); });

const read = (f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8");
function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
}

test("every managed page: JSON-LD parses, has canonical + OG + business stub", () => {
  for (const f of SD.HEAD_PAGES) {
    const html = read(f);
    assert.match(html, /<link rel="canonical"/, `${f} canonical`);
    assert.ok(html.includes('property="og:title"'), `${f} og:title`);
    assert.ok(html.includes('name="twitter:card"'), `${f} twitter:card`);
    const blocks = ldBlocks(html);
    assert.ok(blocks.length, `${f} has JSON-LD`);
    for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b), `${f} JSON-LD parses`);
    assert.ok(blocks.some((b) => b.includes(SD.BIZ_ID)), `${f} business @id present`);
  }
});

test("each page defines #business exactly once (no duplicate @id)", () => {
  for (const f of SD.HEAD_PAGES) {
    let defs = 0;
    for (const b of ldBlocks(read(f))) {
      let j; try { j = JSON.parse(b); } catch { continue; }
      const nodes = Array.isArray(j) ? j : (j["@graph"] || [j]);
      for (const n of nodes) {
        if (n && n["@id"] === SD.BIZ_ID && /Business|Organization/.test(n["@type"] || "")) defs++;
      }
    }
    assert.equal(defs, 1, `${f} has ${defs} #business definitions (want exactly 1)`);
  }
});

test("no breadcrumb points at a non-existent page", () => {
  for (const f of SD.HEAD_PAGES) {
    for (const b of ldBlocks(read(f))) {
      const j = JSON.parse(b);
      if (j["@type"] !== "BreadcrumbList") continue;
      for (const li of j.itemListElement || []) {
        const url = li.item && (li.item["@id"] || li.item);
        if (typeof url !== "string" || !url.startsWith(SD.SITE)) continue;
        const slug = url.replace(SD.SITE, "").replace(/^\//, "").replace(/\/$/, "");
        const file = slug === "" ? "index.html" : `${slug}.html`;
        assert.ok(fs.existsSync(path.join(SITE_DIR, file)), `${f} breadcrumb -> missing ${file}`);
      }
    }
  }
});

test("find-your-exact-tune carries Event schema matching events-data.js", async () => {
  const events = require("../netlify/functions/lib/events-data.js");
  const { MARKETS } = require("../netlify/functions/lib/markets.js");
  const states = Object.fromEntries(MARKETS.map((m) => [m.city.toLowerCase(), m.state]));
  const expected = JSON.parse(SD.buildEventsJsonLd(events, states));
  const blocks = ldBlocks(read("find-your-exact-tune.html")).map((b) => JSON.parse(b));
  const got = blocks.find((b) => b["@type"] === "ItemList" && /Events/.test(b.name || ""));
  assert.ok(got, "Event ItemList present");
  assert.equal(got.itemListElement.length, expected.itemListElement.length, "event count drift");
  assert.deepEqual(got.itemListElement.map((x) => x.item.startDate).sort(),
                   expected.itemListElement.map((x) => x.item.startDate).sort(), "event dates drift");
});

test("sitemap covers exactly the indexable page set", () => {
  const xml = read("sitemap.xml");
  const expected = SD.HEAD_PAGES.filter((f) => !SD.SITEMAP_EXCLUDE.has(f)).map(SD.locFor).sort();
  const got = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  assert.deepEqual(got, expected);
  assert.ok(!/<lastmod>2026-06-12<\/lastmod>/.test(xml), "sitemap lastmod refreshed");
});

test("generated image assets exist", () => {
  for (const f of ["logo.png", "og-image.png"]) {
    assert.ok(fs.existsSync(path.join(SITE_DIR, f)), `${f} exists`);
  }
});

test("buildEventsJsonLd emits one Event per active date, including a city's second date", async () => {
  const { buildEventsJsonLd } = await import("../scripts/lib/seo-data.mjs");
  const events = { "twin cities": [
    { city: "twin cities", dateISO: "2026-08-29", label: "Aug 29", active: true, event: "TC Aug" },
    { city: "twin cities", dateISO: "2026-10-16", label: "Oct 16", active: true, event: "TC Oct" },
  ] };
  const json = buildEventsJsonLd(events, ["MN"]);
  assert.equal((json.match(/"@type":\s*"Event"/g) || []).length, 2);
});
