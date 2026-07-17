// Guards against drift between build-state-pages.mjs (generator: markets.js cities +
// installer bios) and the 6 committed state landing pages. The committed pages are
// generator output + build:seo marked-block injections (OG/BUSINESS), so we compare
// with those blocks stripped. Fails loudly if a market or bio changes without
// regenerating: node scripts/build-state-pages.mjs && npm run build:seo
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderStatePages } from "../scripts/build-state-pages.mjs";

const SITE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
// Normalize CRLF so a Windows autocrlf checkout compares equal to the LF the
// generator emits — this is content parity, not byte parity.
const normalize = (html) =>
  html.replace(/\r\n/g, "\n").replace(/<!-- SEO:[A-Z]+:START -->[\s\S]*?<!-- SEO:[A-Z]+:END -->\n?/g, "");

test("committed state pages match the generator output (modulo build:seo injections)", () => {
  const pages = renderStatePages();
  assert.equal(Object.keys(pages).length, 6, "expected 6 state pages");
  for (const [file, html] of Object.entries(pages)) {
    const committed = fs.readFileSync(path.join(SITE, file), "utf8");
    assert.equal(normalize(committed), normalize(html),
      `${file} drifted from build-state-pages.mjs — re-run: node scripts/build-state-pages.mjs && npm run build:seo`);
  }
});
