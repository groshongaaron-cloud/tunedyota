"use strict";
// Guards the generated per-vehicle AMSOIL landing pages (scripts/build-amsoil-pages.mjs).
// The load-bearing invariant: fluid CAPACITIES and drain INTERVALS are Toyota-OEM-spec
// drafts and must NOT appear on a public page until that generation is `verified:true`
// (see docs/amsoil/fluid-data-verification.md). Only AMSOIL-API-authoritative product /
// viscosity / filter data is allowed to ship un-verified.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "site");
const CAT = require("../site/amsoil-garage.json");
const REFERRAL = require("../site/amsoil-referral.js");

// NOTE: read the committed build output only. Do NOT call buildAmsoilPages() here —
// it rewrites the raw pages and would strip the OG/#business stub that build-seo
// injects afterward, breaking seo.test.js when both run under one `node --test`.
async function mod() { return import("../scripts/build-amsoil-pages.mjs"); }

test("one page per Toyota/Lexus platform, all registered in HEAD_PAGES", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  const SD = await import("../scripts/lib/seo-data.mjs");
  const modelCount = Object.values(CAT.vehicles).reduce((n, m) => n + Object.keys(m).length, 0);
  assert.equal(AMSOIL_PAGE_FILES.length, modelCount, "a page per model");
  for (const f of AMSOIL_PAGE_FILES) {
    assert.ok(fs.existsSync(path.join(SITE, f)), `${f} written`);
    assert.ok(SD.HEAD_PAGES.includes(f), `${f} registered in HEAD_PAGES`);
  }
});

test("every page has valid JSON-LD (Store, FAQPage, BreadcrumbList) + canonical", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  for (const f of AMSOIL_PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.match(html, /<link rel="canonical" href="https:\/\/tunedyota\.com\/amsoil-[a-z0-9-]+">/, `${f} canonical`);
    const types = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])["@type"]);   // JSON.parse throws → fails the test on malformed schema
    for (const t of ["Store", "FAQPage", "BreadcrumbList"]) assert.ok(types.includes(t), `${f} has ${t}`);
  }
});

test("INTEGRITY: a capacity chip renders iff that exact system is cross-verified", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  // Mirror the generator exactly: it renders one `class="cap"` chip per (gen, bundle-sku)
  // pair whose matched system has a capacity AND is `verified:true`. Unverified fluids
  // (gear lube, ATF, diffs, transfer) must NEVER surface a number as fact.
  let expected = 0;
  for (const mk of Object.keys(CAT.vehicles)) {
    for (const md of Object.keys(CAT.vehicles[mk])) {
      for (const gen of CAT.vehicles[mk][md]) {
        for (const sku of gen.bundle || []) {
          const s = (gen.systems || []).find((x) => x.sku === sku && x.capacity);
          if (s && s.verified) expected++;
        }
      }
    }
  }
  let actual = 0;
  for (const f of AMSOIL_PAGE_FILES) {
    actual += (fs.readFileSync(path.join(SITE, f), "utf8").match(/class="cap"/g) || []).length;
  }
  assert.equal(actual, expected, "cap chips on pages must equal the count of verified-capacity systems");
  assert.ok(expected > 0, "premise: some engine-oil capacities are now verified");

  // Verified systems are limited to the cross-verified set (engine oil + fill-to-plug
  // driveline). Transmission (sealed/overflow) and the filter count are NEVER verified.
  const VERIFIABLE = new Set(["Engine Oil", "Front Differential", "Rear Differential", "Transfer Case"]);
  for (const mk of Object.keys(CAT.vehicles)) {
    for (const md of Object.keys(CAT.vehicles[mk])) {
      for (const gen of CAT.vehicles[mk][md]) {
        for (const s of gen.systems || []) {
          if (s.verified) assert.ok(VERIFIABLE.has(s.system), `${mk} ${md} ${gen.y}: ${s.system} must not be marked verified`);
          if (s.system === "Transmission") assert.ok(!s.verified, `${mk} ${md} ${gen.y}: Transmission must stay unverified (sealed/overflow-fill)`);
        }
      }
    }
  }
});

test("SEO: title targets the vehicle + oil/filter intent, and links the topical cluster", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  for (const f of AMSOIL_PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    assert.match(title, /AMSOIL Synthetic Oil &amp; Filter for the /, `${f} title targets oil+filter`);
    assert.match(title, /Best for Tuned &amp; Towing/, `${f} title carries the niche superlative`);
    // Topical cluster: each vehicle page links the comparison + oil-guide hubs.
    assert.ok(html.includes('href="amsoil-vs-oem-toyota-lexus-fluids.html"'), `${f} links the AMSOIL-vs-OEM page`);
    assert.ok(html.includes('href="amsoil-synthetic-motor-oil-guide.html"'), `${f} links the oil guide`);
  }
});

test("SEO: Store schema carries the Upper-Midwest service area (local intent)", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  const files = [...AMSOIL_PAGE_FILES, "amsoil-garage.html"];
  for (const f of files) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const store = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1])).find((o) => o["@type"] === "Store");
    assert.ok(store, `${f} has a Store block`);
    const areas = [].concat(store.areaServed).map((a) => a && a.name);
    for (const st of ["Minnesota", "Iowa", "Wisconsin", "North Dakota", "South Dakota", "Nebraska"]) {
      assert.ok(areas.includes(st), `${f} Store areaServed includes ${st}`);
    }
    assert.ok(areas.includes("United States"), `${f} Store areaServed keeps national shipping`);
  }
});

test("order links carry the Tuned Yota dealer referral (zo)", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  for (const f of AMSOIL_PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    const orders = [...html.matchAll(/class="ord"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(orders.length > 0, `${f} has order links`);
    for (const href of orders) assert.match(href, new RegExp(`zo=${REFERRAL.AMSOIL_ZO}`), `${f} order link carries zo`);
  }
});
