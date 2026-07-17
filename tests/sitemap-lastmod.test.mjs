// lastmod must reflect when a page's content last changed, not when the build
// ran — a sitemap that stamps every URL with the build date tells crawlers
// everything changed every build (minor SEO harm, review finding 2026-07-16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSitemap } from "../scripts/lib/seo-data.mjs";

test("buildSitemap uses per-entry lastmod, falling back to the build date", () => {
  const xml = buildSitemap(
    [{ loc: "https://x/a", lastmod: "2026-01-05" }, { loc: "https://x/b" }],
    "2026-07-16"
  );
  assert.match(xml, /<loc>https:\/\/x\/a<\/loc>\s*<lastmod>2026-01-05<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/x\/b<\/loc>\s*<lastmod>2026-07-16<\/lastmod>/);
});
