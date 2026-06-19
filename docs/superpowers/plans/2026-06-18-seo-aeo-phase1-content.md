# Phase 1 — Content + AEO Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a high-intent content layer + AI-citation/entity signals on top of the existing technical SEO, to lift organic- and AI-driven booking demand.

**Architecture:** Static HTML site. Tasks 1–4 ship immediately (no owner copy): the query map, the founder `Person` entity, an enriched `llms.txt`, and four content briefs. Tasks 5–8 build the four pages **as the owner returns copy** — each goes through the established content-page flow (register in `HEAD_PAGES` → `npm run build:seo` → `npm test` auto-validates → ship), reusing the machinery from the `new-vehicle-page` and `ship` skills.

**Tech Stack:** Static HTML + inline JSON-LD; `scripts/build-seo.mjs` generator; `node:test`.

---

## File Structure

- `docs/seo/query-map.md` — **new.** Target queries → page → gap status. The roadmap.
- `docs/seo/briefs/*.md` — **new (4).** Per-page content briefs the owner writes prose against.
- `site/llms.txt` — **edit.** Add Key Facts + FAQ blocks.
- `site/index.html` — **edit.** Add founder `Person` to the business schema; enrich `knowsAbout`/`sameAs`; add nav/footer links to the 4 pages (once they exist).
- `site/ott-tune-cost.html`, `site/is-the-ott-tune-worth-it.html`, `site/magnuson-supercharger-guide.html`, `site/tune-warranty-emissions-legality.html` — **new (4, gated on copy).**
- `scripts/lib/seo-data.mjs` — **edit.** Add the 4 slugs to `HEAD_PAGES` (with each page).
- `tests/seo-aeo.test.js` — **new.** Guards the entity + llms.txt enrichments.

**Gating:** Tasks 1–4 have no external dependency and ship now. Tasks 5–8 each require the owner's prose for that page; until then they stay unstarted (do not register a slug in `HEAD_PAGES` before its page file exists, or `build:seo`/tests break).

---

### Task 1: Query map

**Files:** Create `docs/seo/query-map.md`

- [ ] **Step 1: Write the query map**

Create `docs/seo/query-map.md`:

```markdown
# Tuned Yota — query map (Phase 1)

Target high-intent queries → the page that serves each → gap status. ✅ exists · 🟡 thin · ❌ missing.

## Commercial
| Query | Page | Status |
|---|---|---|
| toyota tacoma ott tune / [model] ott tune | /toyota-*-ott-tune, /lexus-*-ott-tune (13) | ✅ |
| ott tune cost / how much is an ott tune / tune price | (new) /ott-tune-cost | ❌ |
| magnuson supercharger tacoma/tundra cost | /supercharger (sales) + (new) /magnuson-supercharger-guide | 🟡 |

## Consideration
| Query | Page | Status |
|---|---|---|
| is an ott tune worth it / ott tune vs stock | (new) /is-the-ott-tune-worth-it | ❌ |
| what is an ott tune / what does a tune do | /ott-tune | ✅ |
| ott vs custom tune | /ott-tune (expand) or worth-it page | 🟡 |

## Objection
| Query | Page | Status |
|---|---|---|
| does a tune void warranty | (new) /tune-warranty-emissions-legality | ❌ |
| is tuning emissions legal / carb legal | /faq (partial) + new page | 🟡 |
| will a tune throw a check engine light | /faq (partial) + new page | 🟡 |

## Notes
- Local queries ("[city] toyota tuning") are Phase 2 (event-city pages + GBP).
- The 4 ❌/🟡 commercial+consideration+objection gaps are the Phase 1 pages.
```

- [ ] **Step 2: Commit**

```bash
git add docs/seo/query-map.md
git commit -m "docs(seo): Phase 1 query map (target queries -> pages -> gaps)"
```

---

### Task 2: Founder `Person` entity + entity enrichment

**Files:** Modify `site/index.html`; Create/extend `tests/seo-aeo.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/seo-aeo.test.js`:

```js
// tests/seo-aeo.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const SITE = path.join(__dirname, "..", "site");
const read = (f) => fs.readFileSync(path.join(SITE, f), "utf8");

test("homepage business schema names the founder as a Person", () => {
  const blocks = [...read("index.html").matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const biz = blocks.find((b) => b["@id"] === "https://tunedyota.com/#business");
  assert.ok(biz, "business node present");
  assert.ok(biz.founder, "founder present");
  assert.equal(biz.founder["@type"], "Person");
  assert.equal(biz.founder.name, "Aaron Groshong");
  assert.ok(/VFTuner/.test(biz.founder.jobTitle || ""), "founder jobTitle mentions VFTuner");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test tests/seo-aeo.test.js`
Expected: FAIL — `founder present` (no founder yet).

- [ ] **Step 3: Add the founder to the business node**

In `site/index.html`, in the `AutomotiveBusiness` JSON-LD object (the one with `"@id": "https://tunedyota.com/#business"`), add a `founder` key (insert after the `"slogan"` field). The block is one minified JSON object — add this key/value, keeping valid JSON:

```json
"founder": {"@type": "Person", "name": "Aaron Groshong", "jobTitle": "Founder & VFTuner PRO Tuner", "worksFor": {"@id": "https://tunedyota.com/#business"}, "knowsAbout": ["OTT Tune calibration", "VFTuner PRO tuning", "Magnuson supercharger installation", "Toyota and Lexus performance tuning"]},
```

(Leave the existing `knowsAbout`/`sameAs`/`aggregateRating`/`review` on the business node intact. The founder is a nested `Person`, so the single-`#business` invariant in `tests/seo.test.js` is unaffected.)

- [ ] **Step 4: Run both SEO test files, verify pass**

Run: `node --test tests/seo-aeo.test.js tests/seo.test.js`
Expected: PASS (founder test green; the existing `#business`-exactly-once test still green).

- [ ] **Step 5: Commit**

```bash
git add site/index.html tests/seo-aeo.test.js
git commit -m "feat(seo): add founder Person entity to homepage business schema"
```

---

### Task 3: `llms.txt` Key Facts + FAQ

**Files:** Modify `site/llms.txt`; extend `tests/seo-aeo.test.js`

- [ ] **Step 1: Add the failing test**

Append to `tests/seo-aeo.test.js`:

```js
test("llms.txt carries citable Key Facts + FAQ", () => {
  const t = read("llms.txt");
  assert.ok(/## Key facts/i.test(t), "Key facts section");
  assert.ok(/## FAQ/i.test(t), "FAQ section");
  assert.ok(/from \$\d/i.test(t), "a 'from $' price appears");
  assert.ok(/VFTuner PRO/.test(t), "authorization mentioned");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `node --test tests/seo-aeo.test.js`
Expected: FAIL on the Key facts / FAQ assertions.

- [ ] **Step 3: Append the sections to `llms.txt`**

Add to the end of `site/llms.txt` (use real numbers consistent with the site's pricing/copy):

```markdown
## Key facts
- OTT Tune pricing: from $400–$550 depending on platform; custom calibration and forced-induction paths priced higher. Exact price shown instantly at /find-your-exact-tune.
- Authorizations: authorized OTT (Overland Tailor Tune) installer; Midwest authorized Magnuson Supercharger dealer; calibrations by a licensed VFTuner PRO Tuner.
- Compliance: factory emissions kept fully intact, verified with a 5-gas analyzer, EPA-compliant in every state; no check-engine-light defeat; no off-road-only tuning.
- Service model: in-person tuning at scheduled events across the Upper Midwest (MN, IA, WI, ND, SD, NE); no single storefront. Supercharger kits drop-ship to the lower 48.

## FAQ
- **What is an OTT Tune?** A custom calibration for Toyota/Lexus platforms that improves throttle response, shift behavior, gear hunting, towing, and larger-tire drivability, built by a licensed VFTuner PRO Tuner.
- **How much does it cost?** From $400–$550 by platform; see /find-your-exact-tune for your exact price.
- **Does it void my warranty?** Tuning is protected under the Magnuson-Moss Warranty Act; emissions systems stay intact and EPA-compliant.
- **Is it emissions-legal?** Yes — factory emissions remain intact and are 5-gas verified; no CEL defeat, no off-road-only tuning.
```

- [ ] **Step 4: Run, verify pass**

Run: `node --test tests/seo-aeo.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add site/llms.txt tests/seo-aeo.test.js
git commit -m "feat(seo): enrich llms.txt with citable Key Facts + FAQ for AI engines"
```

---

### Task 4: Content briefs (4)

**Files:** Create `docs/seo/briefs/ott-tune-cost.md`, `…/is-the-ott-tune-worth-it.md`, `…/magnuson-supercharger-guide.md`, `…/tune-warranty-emissions-legality.md`

- [ ] **Step 1: Write each brief**

Each brief follows this exact template (fill per page using the page specs in Task 5's table):

```markdown
# Brief: <Page title>

**Slug:** /<slug>   **Primary query:** "<query>"   **Intent:** <commercial|consideration|objection>

## Answer-first (1–2 sentences, goes directly under H1)
<one-line answer to the primary query — the snippet AI/Google will lift>

## Sections (each H2 phrased as the real question)
1. <H2 question> — <what to cover>
2. ...

## Table to fill
<the comparison or pricing table columns/rows the owner supplies values for>

## FAQ (5–7 Q&A, become FAQPage schema + visible accordion)
- Q: ... / A: ...

## Internal links
<which existing pages to link to: /find-your-exact-tune, relevant vehicle pages, /ott-tune, etc.>

## What NOT to duplicate
<the distinct angle vs existing pages>
```

- [ ] **Step 2: Commit**

```bash
git add docs/seo/briefs
git commit -m "docs(seo): content briefs for the 4 Phase 1 pages"
```

- [ ] **Step 3: Hand the briefs to the owner** and request copy for whichever page(s) they want to ship first. Tasks 5–8 start per page as copy arrives.

---

### Tasks 5–8: Build the four content pages (one task per page; each gated on owner copy)

Each page is built with the **same procedure**; only the per-page data differs. Do NOT start a page until its prose is in hand.

**Per-page build procedure (run for each page):**

- [ ] **Step 1:** Create `site/<slug>.html` by copying an existing vehicle page as the chrome template (nav/footer/CSS/Pixel byte-identical), then replace the body with the brief's structure: H1, the answer-first sentence, the H2-question sections filled with the owner's prose, the filled table, and a visible FAQ accordion whose text mirrors the FAQ schema.
- [ ] **Step 2:** Set `<title>`, `<meta name="description">`, and `<link rel="canonical">` to the page's slug. Add JSON-LD: `FAQPage` (mirroring the visible FAQ) and `BreadcrumbList` (Home → `/ott-tune` "OTT Tune" → this page). Do NOT hand-add the `SEO:BUSINESS`/OG blocks — `build:seo` injects them.
- [ ] **Step 3:** Register the slug in `scripts/lib/seo-data.mjs` `HEAD_PAGES`.
- [ ] **Step 4:** Add a homepage + footer nav link to the page (a relevant placement — e.g. under `#vehicles`/a resources area or the footer `frow`).
- [ ] **Step 5:** `npm run build:seo` (injects OG/business stub, adds to sitemap), then `npm test` — `tests/seo.test.js` now validates the page (canonical, OG, single `#business`, breadcrumb resolves, JSON-LD parses). Fix anything it flags.
- [ ] **Step 6:** Commit, then ship per the `ship` skill (push `master`, confirm Netlify `ready`, run the live URL through Google's Rich Results Test for FAQ + Breadcrumb).

**Per-page specs:**

| Task | Slug | Title | Primary query | Distinct angle |
|---|---|---|---|---|
| 5 | `ott-tune-cost` | OTT Tune Cost & Pricing | "ott tune cost" | A pricing table by platform/path + what affects price + K-Line note; CTA to the finder. Not a model page. |
| 6 | `is-the-ott-tune-worth-it` | Is the OTT Tune Worth It? (vs Stock) | "is an ott tune worth it" | Decision content: what changes, who it's for/not, OTT-vs-stock comparison table. |
| 7 | `magnuson-supercharger-guide` | Magnuson Supercharger Buyer's Guide | "magnuson supercharger [model] cost" | Informational/AEO sibling of the `supercharger.html` sales page: supported platforms, gains, install, cost ranges. Cross-link, don't duplicate. |
| 8 | `tune-warranty-emissions-legality` | Tuning, Warranty & Emissions | "does a tune void warranty" | Objection-handling Q&A: Magnuson-Moss, emissions intact, EPA/CARB, 5-gas, no CEL, no off-road-only. Heavy `FAQPage`. |

- [ ] After all shipped pages: re-run `npm test`, confirm the sitemap lists every shipped page, and re-submit the sitemap in GSC (per `docs/seo/gsc-checklist.md`).

---

## Self-Review

**Spec coverage:**
- Query map → Task 1. ✓
- AEO/entity signals (`llms.txt` + founder `Person`) → Tasks 2–3 (+ `tests/seo-aeo.test.js` guard). ✓
- Four content pages w/ AEO structure, FAQ schema, internal links, `HEAD_PAGES`/sitemap registration → Tasks 5–8 via the shared procedure. ✓
- Content briefs / owner-supplies-copy workflow → Task 4 + the gating notes. ✓
- Wiring & ship through existing machinery → Task 5–8 steps 3–6 (reuses `new-vehicle-page`/`ship` skills). ✓
- Verification (npm test auto-validates new pages, Rich Results, sitemap) → per-page step 5–6 + final step. ✓

**Placeholder scan:** The only deferred content is the owner-supplied prose (an explicit external input, not a plan gap) and per-page values pulled from the Task-5 table; every buildable step (query map, entity, llms.txt, briefs, build procedure) has concrete content/commands.

**Type/name consistency:** `HEAD_PAGES` (in `scripts/lib/seo-data.mjs`), the `#business` `@id`, `tests/seo-aeo.test.js`, the four slugs, and the `FAQPage`/`BreadcrumbList` schema are referenced identically across tasks and match the existing `seo.test.js`/`build-seo.mjs` conventions.
