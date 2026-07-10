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

test("INTEGRITY: no capacity/interval numbers leak while every generation is verified:false", async () => {
  const { AMSOIL_PAGE_FILES } = await mod();
  const allVerifiedFalse = Object.values(CAT.vehicles)
    .flatMap((m) => Object.values(m)).flat().every((g) => !g.verified);
  assert.ok(allVerifiedFalse, "test premise: catalog is currently all-unverified");
  for (const f of AMSOIL_PAGE_FILES) {
    const html = fs.readFileSync(path.join(SITE, f), "utf8");
    assert.equal(html.includes('class="cap"'), false, `${f} must not render a capacity chip while unverified`);
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
