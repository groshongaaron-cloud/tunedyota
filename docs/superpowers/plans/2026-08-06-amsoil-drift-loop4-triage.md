# AMSOIL Drift Loop-4 Autonomous-Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the weekly AMSOIL drift monitor from Loop 3 (detect + alert) to Loop 4 (autonomous triage): on drift, automatically run the full-catalog damage sweep and stage a one-tap remediation package — halting at the autonomy boundary (never touches prices, catalog, or the live site).

**Architecture:** Extract the pure parse/diff logic out of `price-drift-check.mjs` into a testable `lib/drift-core.mjs` shared module (DRY). Add a new headless-safe `drift-triage-sweep.mjs` that reuses that core over the *full* enrichment catalog via the existing Firecrawl fetch, writes a staged JSON + Markdown remediation package to `~/.tunedyota/`, and escalates via the notify relay. The sweep self-gates on the drift-state file (`--if-drift`) so healthy weeks cost zero Firecrawl calls. Refactor the detector to consume the shared core. Wire both into the existing scheduled task.

**Tech Stack:** Node.js ESM (`.mjs`), `node --test` (built-in runner, no deps), Firecrawl API (`FIRECRAWL_API_KEY`), Netlify notify relay, Windows Task Scheduler (PS-hosted hidden).

**Governs:** Loop 4 per `docs/operations/verification-loops.md`. Autonomy boundary rule 1: this pilot stages, it does not ship.

---

## File Structure

- **Create:** `scripts/amsoil/lib/drift-core.mjs` — pure functions: `parseOfferPrices(html)`, `driftedVariants(product, livePrices, tolerance)`. No I/O, no network. The single source of truth for "what counts as drift."
- **Create:** `tests/amsoil-drift-core.test.mjs` — `node --test` unit tests over inline HTML/JSON fixtures. No network.
- **Create:** `scripts/amsoil/drift-triage-sweep.mjs` — full-catalog Firecrawl sweep; self-gates on `--if-drift`; writes staged report; escalates. Never writes prices.
- **Modify:** `scripts/amsoil/price-drift-check.mjs` — delete its local `parseOfferPrices`/inline diff, import from `lib/drift-core.mjs` instead. Behavior unchanged.
- **Modify:** `docs/operations/verification-loops.md` — flip the AMSOIL row in "Where applied" from Loop 3 to Loop 4 (triage) with the boundary note.

---

### Task 1: Extract pure drift logic into a shared, testable core

**Files:**
- Create: `scripts/amsoil/lib/drift-core.mjs`
- Test: `tests/amsoil-drift-core.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/amsoil-drift-core.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfferPrices, driftedVariants } from "../scripts/amsoil/lib/drift-core.mjs";

const HTML = `
<script type="application/ld+json">
{"@type":"ProductGroup","hasVariant":[
  {"@type":"Product","sku":"ABC-EA","offers":{"@type":"Offer","price":"12.95"}},
  {"@type":"Product","sku":"ABC-CA","offers":{"price":11.5}}
]}
</script>`;

test("parseOfferPrices reads every per-sku offer price, upper-cased", () => {
  const m = parseOfferPrices(HTML);
  assert.equal(m.get("ABC-EA"), 12.95);
  assert.equal(m.get("ABC-CA"), 11.5);
});

test("parseOfferPrices tolerates non-JSON ld blocks", () => {
  const m = parseOfferPrices(`<script type="application/ld+json">not json</script>`);
  assert.equal(m.size, 0);
});

test("driftedVariants flags only beyond-tolerance mismatches", () => {
  const product = { category: "Oil", variants: [
    { stockNo: "ABC-EA", retail: 12.95 },  // matches
    { stockNo: "ABC-CA", retail: 10.00 },  // drift: live 11.5
  ]};
  const live = new Map([["ABC-EA", 12.95], ["ABC-CA", 11.5]]);
  const out = driftedVariants(product, live);
  assert.equal(out.length, 1);
  assert.equal(out[0].stockNo, "ABC-CA");
  assert.equal(out[0].catalog, 10.0);
  assert.equal(out[0].live, 11.5);
});

test("driftedVariants matches a sold-each sku when page drops the -EA suffix", () => {
  const product = { category: "Oil", variants: [{ stockNo: "XYZ-EA", retail: 9.0 }] };
  const live = new Map([["XYZ", 9.99]]); // page listed base sku, no -EA
  const out = driftedVariants(product, live);
  assert.equal(out.length, 1);
  assert.equal(out[0].live, 9.99);
});

test("driftedVariants ignores variants absent from the live page", () => {
  const product = { category: "Oil", variants: [{ stockNo: "GONE-EA", retail: 5.0 }] };
  assert.equal(driftedVariants(product, new Map()).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/amsoil-drift-core.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/amsoil/lib/drift-core.mjs'`.

- [ ] **Step 3: Write minimal implementation**

Create `scripts/amsoil/lib/drift-core.mjs`:

```javascript
// scripts/amsoil/lib/drift-core.mjs
// Pure drift logic shared by the sentinel detector (price-drift-check.mjs) and
// the full-catalog triage sweep (drift-triage-sweep.mjs). No I/O, no network —
// this is the single source of truth for "what counts as price drift", so both
// the weekly tripwire and the on-drift damage report agree by construction.

export const TOLERANCE = 0.01; // dollars — anything past a rounding hair is drift

// Every per-SKU offer price found anywhere in the page's JSON-LD, keyed by
// uppercased sku. amsoil.com's shape (2026-08): ProductGroup → hasVariant[] →
// Product{sku, offers:{price}} — walked generically so template drift (Offer[],
// AggregateOffer.offers, @graph, price directly on the node) still parses.
export function parseOfferPrices(html) {
  const bySku = new Map();
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const priceOf = (n) => {
    if (n.price != null) return parseFloat(n.price);
    const offers = Array.isArray(n.offers) ? n.offers : n.offers ? [n.offers] : [];
    for (const o of offers) if (o && o.price != null) return parseFloat(o.price);
    return NaN;
  };
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.sku) {
      const price = priceOf(n);
      if (!isNaN(price)) bySku.set(String(n.sku).toUpperCase().trim(), price);
    }
    for (const v of Object.values(n)) if (v && typeof v === "object") walk(v);
  };
  for (const b of blocks) {
    try { walk(JSON.parse(b)); } catch { /* non-JSON block */ }
  }
  return bySku;
}

// Given a catalog product and a live sku→price map, return the variants whose
// live price differs from catalog retail beyond tolerance. Handles pages that
// list the sold-each sku without its -EA suffix.
export function driftedVariants(product, livePrices, tolerance = TOLERANCE) {
  const out = [];
  for (const v of product.variants) {
    const sku = v.stockNo.toUpperCase();
    const live = livePrices.get(sku) ?? (sku.endsWith("-EA") ? livePrices.get(sku.slice(0, -3)) : undefined);
    if (live == null) continue;
    if (Math.abs(live - v.retail) > tolerance) {
      out.push({ stockNo: v.stockNo, category: product.category, catalog: v.retail, live });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/amsoil-drift-core.test.mjs`
Expected: PASS — 5 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/lib/drift-core.mjs tests/amsoil-drift-core.test.mjs
git commit -m "Add shared AMSOIL drift-core (parse + diff) with unit tests"
```

---

### Task 2: Refactor the detector to consume the shared core (no behavior change)

**Files:**
- Modify: `scripts/amsoil/price-drift-check.mjs:57-79` (delete local `parseOfferPrices`)
- Modify: `scripts/amsoil/price-drift-check.mjs:35` (delete local `TOLERANCE`)
- Modify: `scripts/amsoil/price-drift-check.mjs:128-137` (use `driftedVariants`)
- Modify: `scripts/amsoil/price-drift-check.mjs:28` (add import)

- [ ] **Step 1: Add the import next to the existing firecrawl-fetch import**

At line 28, after `import { fetchProductHtmlViaFirecrawl } from "./lib/firecrawl-fetch.mjs";`, add:

```javascript
import { parseOfferPrices, driftedVariants, TOLERANCE } from "./lib/drift-core.mjs";
```

- [ ] **Step 2: Delete the now-duplicated local definitions**

- Delete the `const TOLERANCE = 0.01;` line (line 35).
- Delete the entire local `function parseOfferPrices(html) { ... }` block (lines 57-79).

- [ ] **Step 3: Replace the inline per-variant compare with the shared helper**

Replace the inner variant loop (lines 128-137):

```javascript
      for (const v of p.variants) {
        const sku = v.stockNo.toUpperCase();
        // Pages list the sold-each sku sometimes without the -EA suffix.
        const livePrice = live.get(sku) ?? (sku.endsWith("-EA") ? live.get(sku.slice(0, -3)) : undefined);
        if (livePrice == null) continue;
        comparedVariants++;
        if (Math.abs(livePrice - v.retail) > TOLERANCE) {
          drifted.push(`${v.stockNo} (${p.category}): catalog $${v.retail.toFixed(2)} vs live $${livePrice.toFixed(2)}`);
        }
      }
```

with:

```javascript
      comparedVariants += p.variants.filter((v) => live.has(v.stockNo.toUpperCase()) || (v.stockNo.toUpperCase().endsWith("-EA") && live.has(v.stockNo.toUpperCase().slice(0, -3)))).length;
      for (const d of driftedVariants(p, live)) {
        drifted.push(`${d.stockNo} (${d.category}): catalog $${d.catalog.toFixed(2)} vs live $${d.live.toFixed(2)}`);
      }
```

- [ ] **Step 4: Verify the detector still parses and runs (no network needed to fail-fast on syntax)**

Run: `node --check scripts/amsoil/price-drift-check.mjs`
Expected: exit 0, no output (syntax OK).

Then confirm the shared-core tests still pass:
Run: `node --test tests/amsoil-drift-core.test.mjs`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/price-drift-check.mjs
git commit -m "price-drift-check: consume shared drift-core (DRY, no behavior change)"
```

---

### Task 3: Build the full-catalog triage sweep (staged, self-gating, headless-safe)

**Files:**
- Create: `scripts/amsoil/drift-triage-sweep.mjs`

- [ ] **Step 1: Write the sweep script**

Create `scripts/amsoil/drift-triage-sweep.mjs`:

```javascript
// scripts/amsoil/drift-triage-sweep.mjs
// Loop-4 TRIAGE step for AMSOIL price drift (docs/operations/verification-loops.md).
// When the weekly sentinel detector (price-drift-check.mjs) finds drift, this runs
// the FULL-catalog damage report — every enriched product, not just 24 sentinels —
// and STAGES a one-tap remediation package. It never writes prices, never touches
// the catalog, never pushes: it stops at the autonomy boundary and escalates.
//
// --if-drift : no-op unless the drift-state file shows active drift (so healthy
//              weeks cost zero Firecrawl calls when chained after the detector).
// --limit=N  : cap products fetched (smoke testing).
//
// Reads catalog/enrichment from origin/master (git show) — branch-independent,
// safe while dev sessions branch-switch this repo. Same pattern as the detector.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { fetchProductHtmlViaFirecrawl } from "./lib/firecrawl-fetch.mjs";
import { parseOfferPrices, driftedVariants } from "./lib/drift-core.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "https://www.amsoil.com";
const TODAY = new Date().toISOString().slice(0, 10);
const HOME = path.join(os.homedir(), ".tunedyota");
const STATE_FILE = path.join(HOME, "amsoil-drift-state.json");
const REPORT_JSON = path.join(HOME, `amsoil-drift-report-${TODAY}.json`);
const REPORT_MD = path.join(HOME, `amsoil-drift-remediation-${TODAY}.md`);
const IF_DRIFT = process.argv.includes("--if-drift");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;

async function notify(text) {
  const url = process.env.NOTIFY_URL || "https://tunedyota.com/.netlify/functions/notify";
  const token = process.env.NOTIFY_TOKEN || process.env.TY_NOTIFY_TOKEN;
  if (!token) { console.log("[notify skipped: no NOTIFY_TOKEN/TY_NOTIFY_TOKEN]\n" + text); return; }
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-ty-notify": token }, body: JSON.stringify({ text }) });
    if (!res.ok) console.error(`notify failed: HTTP ${res.status}`);
  } catch (e) { console.error("notify failed:", e.message); }
}

function gitShow(repoPath) {
  return execSync(`git show origin/master:${repoPath}`, { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 }).toString("utf8");
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}

async function main() {
  if (IF_DRIFT) {
    const st = loadState();
    if (!st.driftSince) { console.log("triage-sweep: no active drift; skipping (--if-drift)."); return; }
  }

  execSync("git fetch origin master", { cwd: ROOT, stdio: "ignore" });
  const catalog = JSON.parse(gitShow("site/amsoil-catalog-full.json"));
  const enrichment = JSON.parse(gitShow("scripts/amsoil/data/enrichment.json"));

  const products = catalog.products.filter((p) => enrichment.products[p.stockNo]?.path).slice(0, LIMIT);
  const drifted = [], errors = [];
  let checkedPages = 0, comparedVariants = 0;

  for (const p of products) {
    const url = BASE + enrichment.products[p.stockNo].path;
    try {
      const { html, blocked, error } = await fetchProductHtmlViaFirecrawl(url);
      if (blocked) { errors.push({ stockNo: p.stockNo, error: error || "blocked/challenge" }); continue; }
      const live = parseOfferPrices(html);
      if (!live.size) { errors.push({ stockNo: p.stockNo, error: "no JSON-LD offers parsed" }); continue; }
      checkedPages++;
      for (const d of driftedVariants(p, live)) { drifted.push(d); comparedVariants++; }
      // Count comparisons even when not drifted, for the coverage denominator.
      comparedVariants += p.variants.filter((v) => live.has(v.stockNo.toUpperCase())).length - driftedVariants(p, live).length;
    } catch (e) {
      errors.push({ stockNo: p.stockNo, error: String(e.message || e).split("\n")[0].slice(0, 120) });
    }
    await new Promise((r) => setTimeout(r, 2000)); // pace our own Firecrawl usage
  }

  const coverage = products.length ? checkedPages / products.length : 0;
  const evidence = coverage >= 0.5 ? "VERIFIED" : "UNMEASURED";
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify({ date: TODAY, evidence, checkedPages, totalProducts: products.length, driftedCount: drifted.length, drifted, errors }, null, 2));

  const md = [
    `# AMSOIL full-catalog drift remediation — ${TODAY}`,
    ``,
    `**Evidence:** ${evidence} — ${checkedPages}/${products.length} product pages readable (${errors.length} fetch errors).`,
    `**Drifted variants:** ${drifted.length}`,
    ``,
    `## Fix (human — P.C. prices exist ONLY in the official sheet):`,
    `1. Download a fresh U.S. Pricing CSV from dz.amsoil.com → replace scripts/amsoil/data/us-pricing.csv`,
    `2. \`npm run build:seo\` then ship per the ship skill (docs/operations + ship skill).`,
    ``,
    `## Drifted variants (catalog → live):`,
    ...drifted.map((d) => `- ${d.stockNo} (${d.category}): $${d.catalog.toFixed(2)} → $${d.live.toFixed(2)}`),
    ``,
    `## Unreadable pages (${errors.length}):`,
    ...errors.slice(0, 50).map((e) => `- ${e.stockNo}: ${e.error}`),
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md);

  console.log(`triage-sweep ${TODAY}: ${drifted.length} drifted / ${comparedVariants} compared on ${checkedPages}/${products.length} pages (${errors.length} errors). Evidence: ${evidence}`);

  await notify(
    `🧾 AMSOIL drift TRIAGE complete — staged remediation package ready (human fix required; nothing shipped).\n` +
    `${checkedPages}/${products.length} pages read, ${drifted.length} drifted variants.\n` +
    `Evidence: ${evidence}${evidence === "UNMEASURED" ? " — majority of pages unreadable; treat counts as a floor." : " — full live re-compare vs origin/master this run."}\n` +
    `Staged: ${REPORT_MD}\n` +
    `Fix: fresh U.S. Pricing CSV → scripts/amsoil/data/us-pricing.csv → npm run build:seo → ship. (Loop 4 halts here per the autonomy boundary.)`
  );
}
main().catch(async (e) => {
  console.error(e);
  await notify(`⚠️ AMSOIL drift triage-sweep crashed: ${String(e.message || e).slice(0, 200)}\nEvidence: UNMEASURED — sweep incomplete, damage report not staged.`);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it parses**

Run: `node --check scripts/amsoil/drift-triage-sweep.mjs`
Expected: exit 0, no output.

- [ ] **Step 3: Smoke-test the self-gate with no active drift**

Ensure no drift is flagged locally, then run the gated form:

Run: `node scripts/amsoil/drift-triage-sweep.mjs --if-drift`
Expected: prints `triage-sweep: no active drift; skipping (--if-drift).` and exits 0 **without any Firecrawl calls** (as long as `~/.tunedyota/amsoil-drift-state.json` has `driftSince: null` or is absent).

- [ ] **Step 4: Smoke-test a real 3-page sweep (costs 3 Firecrawl calls)**

Run: `node scripts/amsoil/drift-triage-sweep.mjs --limit=3`
Expected: a summary line like `triage-sweep <date>: N drifted / M compared on X/3 pages ...`, and two files created under `~/.tunedyota/`: `amsoil-drift-report-<date>.json` and `amsoil-drift-remediation-<date>.md`. Confirm the `.md` lists the "Fix (human ...)" section — proving it stages, never fixes.

- [ ] **Step 5: Commit**

```bash
git add scripts/amsoil/drift-triage-sweep.mjs
git commit -m "Add AMSOIL Loop-4 triage sweep (full-catalog damage report, staged only)"
```

---

### Task 4: Chain the triage step after the detector and record it in the protocol

**Files:**
- Modify: `scripts/amsoil/price-drift-check.mjs:158-161` (point the alert at the auto-staged package)
- Modify: `docs/operations/verification-loops.md` ("Where each loop is applied" — AMSOIL row)

- [ ] **Step 1: Update the detector's drift alert to reflect that triage now runs automatically**

In `price-drift-check.mjs`, in the `if (drifted.length)` branch, replace the trailing two lines of the alert body:

```javascript
      `2. npm run build:seo, ship per the ship skill\n` +
      `Full 272-page damage report: ask Claude to run the Ultimate Web Scraper sweep over enrichment.json paths.`
```

with:

```javascript
      `2. npm run build:seo, ship per the ship skill\n` +
      `Full-catalog damage report is being staged automatically (Loop-4 triage sweep) — watch for the "TRIAGE complete" ping with the remediation package.`
```

- [ ] **Step 2: Verify the detector still parses**

Run: `node --check scripts/amsoil/price-drift-check.mjs`
Expected: exit 0.

- [ ] **Step 3: Flip the AMSOIL row in the protocol doc**

In `docs/operations/verification-loops.md`, under "Where each loop is applied", change the Loop 3 bullet that lists `TunedYota AMSOIL Drift Check` so the AMSOIL drift check is described as **Loop 4 (triage)**: detector escalates, then `drift-triage-sweep.mjs --if-drift` stages the full-catalog remediation package; fix stays human (pricing = live-facing, halts at the boundary).

Replace the Loop 3 bullet:

```markdown
- **Loop 3** — `TunedYota AMSOIL Drift Check` (Wed 3:15am), Search Visibility, price-sync;
  the seo-monitor / aeo-monitor agents when run on cadence. All PS-hosted hidden tasks.
```

with:

```markdown
- **Loop 3** — Search Visibility, price-sync; the seo-monitor / aeo-monitor agents when
  run on cadence. All PS-hosted hidden tasks.
- **Loop 4 (live pilot)** — `TunedYota AMSOIL Drift Check` (Wed 3:15am): the sentinel
  detector escalates on drift, then `drift-triage-sweep.mjs --if-drift` auto-stages the
  full-catalog remediation package. Fix stays human — pricing is live-facing, so it halts
  at the autonomy boundary and escalates rather than shipping.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/amsoil/price-drift-check.mjs docs/operations/verification-loops.md
git commit -m "Wire AMSOIL detector alert to auto-triage; record Loop-4 pilot in protocol"
```

---

### Task 5: Update the scheduled task to run detector → gated triage

**Files:**
- No repo files. This updates the Windows "TunedYota AMSOIL Drift Check" scheduled task. Documented here; run by the operator (Aaron) or by Claude with the exact command below.

- [ ] **Step 1: Confirm the current task's action**

Run: `schtasks /query /tn "TunedYota AMSOIL Drift Check" /v /fo LIST`
Expected: shows a PS-hosted hidden action currently invoking `price-drift-check.mjs`. Note the exact `node`/repo path it uses.

- [ ] **Step 2: Repoint the action to run both scripts (detector, then gated triage)**

The action must stay **PS-hosted hidden** (cmd-hosted dies 0xC000013A — see the TY scheduled-monitors rule). Update the task's command to:

```
powershell -NoProfile -WindowStyle Hidden -Command "cd 'C:\Users\grosh\Documents\tunedyota'; node scripts/amsoil/price-drift-check.mjs; node scripts/amsoil/drift-triage-sweep.mjs --if-drift"
```

Apply with (single line):

```
schtasks /change /tn "TunedYota AMSOIL Drift Check" /tr "powershell -NoProfile -WindowStyle Hidden -Command \"cd 'C:\Users\grosh\Documents\tunedyota'; node scripts/amsoil/price-drift-check.mjs; node scripts/amsoil/drift-triage-sweep.mjs --if-drift\""
```

- [ ] **Step 3: Verify the change took**

Run: `schtasks /query /tn "TunedYota AMSOIL Drift Check" /v /fo LIST`
Expected: the Task-to-Run now includes both `price-drift-check.mjs` and `drift-triage-sweep.mjs --if-drift`.

- [ ] **Step 4: Dry-run the task on demand and confirm the gate**

Run: `schtasks /run /tn "TunedYota AMSOIL Drift Check"`
Expected: with no active drift, the detector runs and the triage step no-ops (`no active drift; skipping`). Confirm no `amsoil-drift-report-*.json` was written for today under `~/.tunedyota/` (proves the self-gate spares Firecrawl cost on healthy weeks).

- [ ] **Step 5: Record completion**

No commit (scheduler change is host-local). Note in the session that the Loop-4 pilot is live and will first exercise the triage path on the next real drift event; evidence state at that point = whatever the sweep reports (VERIFIED if ≥50% pages readable, else UNMEASURED).

---

## Self-Review

**Spec coverage** (against `docs/operations/verification-loops.md` Loop 4 + autonomy boundary):
- Triage (auto full-catalog sweep) → Task 3. ✅
- Review/test (coverage → evidence state; unit tests on the diff core) → Tasks 1 & 3 (`evidence` VERIFIED/UNMEASURED). ✅
- Stage-don't-ship (writes staged report, never prices/catalog/push) → Task 3, boundary rule 1. ✅
- Headless-auth honesty (Firecrawl API key, not interactive MCP; UNMEASURED on low coverage) → Task 3. ✅
- Loud escalation via notify relay, `res.ok` checked → Task 3 `notify`. ✅
- Self-gate so healthy weeks cost nothing → `--if-drift`, Tasks 3 & 5. ✅
- Protocol updated to record the pilot → Task 4. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✅

**Type consistency:** `parseOfferPrices(html) → Map`, `driftedVariants(product, livePrices, tolerance?) → [{stockNo, category, catalog, live}]` used identically in Tasks 1, 2, 3. Report object keys (`drifted`, `errors`, `checkedPages`, `evidence`) consistent between the JSON write and the Markdown build in Task 3. ✅

**Known limitation (by design):** the full sweep is ~272 Firecrawl calls at 2s pacing (~9+ min) and is gated to run **only on real drift** — cost is bounded to rare events. The `comparedVariants` denominator in the sweep is approximate (coverage is the load-bearing metric, not the exact comparison count); the detector remains the precise weekly tripwire.
