# Phase 3 Measurement Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated search + AI-visibility measurement engine that pulls Google Search Console data, probes AI engines (Claude WebSearch + Perplexity) for citations, and writes versioned dated JSON snapshots with a trend diff and a Slack report — establishing a baseline before any on-page changes.

**Architecture:** Deterministic API/parsing logic lives in small, pure, dependency-injected ESM modules under `scripts/measure/lib/` (offline-testable). Thin CLI entry scripts under `scripts/measure/` wire in real auth/network/filesystem. A scheduled cloud routine orchestrates: it runs the CLIs, supplies the WebSearch probe itself (only a Claude agent can), then commits the snapshot and posts the report to Slack.

**Tech Stack:** Node ESM scripts, `node --test` built-in test runner (CommonJS tests using dynamic `import()` of the ESM module under test), `google-auth-library` for the GSC service-account token exchange, `fetch` for HTTP (injected as `fetchImpl` in tests).

**Conventions:**
- Mirror the existing pattern: pure cores in `scripts/measure/lib/*.mjs`, tests in `tests/measure-*.test.js` using `const { test } = require("node:test")` + `await import(...)`.
- Network is always injected as `fetchImpl` so tests never hit the wire.
- Every git commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**File structure:**
- `docs/seo/tracked-queries.json` — the canonical query set (data).
- `scripts/measure/lib/tracked-queries.mjs` — loader/validator.
- `scripts/measure/lib/gsc.mjs` — GSC request building + row normalization + pull.
- `scripts/measure/lib/perplexity.mjs` — Perplexity request building + result parsing + probe.
- `scripts/measure/lib/snapshot.mjs` — snapshot assembly, CTR curve, diff, prior selection.
- `scripts/measure/lib/report.mjs` — Slack markdown rendering.
- `scripts/measure/gsc-pull.mjs` — CLI (real google-auth-library + fetch).
- `scripts/measure/perplexity-probe.mjs` — CLI (real fetch + env key).
- `scripts/measure/snapshot.mjs` — CLI (reads 3 blobs, writes dated file, prints diff).
- `scripts/measure/report.mjs` — CLI (reads snapshot+diff, prints Slack markdown).
- `tests/measure-*.test.js` — one per lib module.
- `docs/seo/measurement-routine.md` — routine prompt, secrets, how to read output.
- `package.json` — add `google-auth-library` dep.

---

### Task 1: Tracked query set + loader

**Files:**
- Create: `docs/seo/tracked-queries.json`
- Create: `scripts/measure/lib/tracked-queries.mjs`
- Test: `tests/measure-tracked-queries.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/measure-tracked-queries.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/tracked-queries.mjs"); });

test("loadTrackedQueries trims and returns normalized entries", () => {
  const out = M.loadTrackedQueries([{ query: " ott tune cost ", intent: "commercial", targetPage: "/ott-tune-cost" }]);
  assert.deepEqual(out, [{ query: "ott tune cost", intent: "commercial", targetPage: "/ott-tune-cost" }]);
});

test("loadTrackedQueries throws on a missing field", () => {
  assert.throws(() => M.loadTrackedQueries([{ query: "x", intent: "commercial" }]), /targetPage/);
});

test("loadTrackedQueries throws when not an array", () => {
  assert.throws(() => M.loadTrackedQueries({}), /array/);
});

test("the shipped tracked-queries.json is valid and non-trivial", async () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/seo/tracked-queries.json"), "utf8"));
  const out = M.loadTrackedQueries(raw);
  assert.ok(out.length >= 12, "expected at least 12 tracked queries");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/measure-tracked-queries.test.js`
Expected: FAIL — cannot resolve `../scripts/measure/lib/tracked-queries.mjs`.

- [ ] **Step 3: Create the loader**

```js
// scripts/measure/lib/tracked-queries.mjs
export function loadTrackedQueries(raw) {
  if (!Array.isArray(raw)) throw new Error("tracked-queries must be an array");
  return raw.map((q, i) => {
    for (const k of ["query", "intent", "targetPage"]) {
      if (!q || typeof q[k] !== "string" || !q[k].trim()) {
        throw new Error(`tracked query ${i} missing ${k}`);
      }
    }
    return { query: q.query.trim(), intent: q.intent.trim(), targetPage: q.targetPage.trim() };
  });
}
```

- [ ] **Step 4: Create the data file**

```json
// docs/seo/tracked-queries.json
[
  { "query": "ott tune cost", "intent": "commercial", "targetPage": "/ott-tune-cost" },
  { "query": "how much is an ott tune", "intent": "commercial", "targetPage": "/ott-tune-cost" },
  { "query": "toyota tundra ott tune", "intent": "commercial", "targetPage": "/toyota-tundra-ott-tune" },
  { "query": "toyota tacoma ott tune", "intent": "commercial", "targetPage": "/toyota-tacoma-ott-tune" },
  { "query": "magnuson supercharger tundra cost", "intent": "commercial", "targetPage": "/magnuson-supercharger-guide" },
  { "query": "magnuson supercharger tacoma", "intent": "commercial", "targetPage": "/magnuson-supercharger-guide" },
  { "query": "is an ott tune worth it", "intent": "consideration", "targetPage": "/is-the-ott-tune-worth-it" },
  { "query": "ott tune vs stock", "intent": "consideration", "targetPage": "/is-the-ott-tune-worth-it" },
  { "query": "what is an ott tune", "intent": "consideration", "targetPage": "/ott-tune" },
  { "query": "ott vs custom tune", "intent": "consideration", "targetPage": "/is-the-ott-tune-worth-it" },
  { "query": "does a tune void warranty", "intent": "objection", "targetPage": "/tune-warranty-emissions-legality" },
  { "query": "is tuning emissions legal", "intent": "objection", "targetPage": "/tune-warranty-emissions-legality" },
  { "query": "will a tune throw a check engine light", "intent": "objection", "targetPage": "/tune-warranty-emissions-legality" },
  { "query": "toyota tuning minnesota", "intent": "local", "targetPage": "/toyota-lexus-tuning-minnesota" },
  { "query": "toyota tuning wisconsin", "intent": "local", "targetPage": "/toyota-lexus-tuning-wisconsin" },
  { "query": "toyota tuning iowa", "intent": "local", "targetPage": "/toyota-lexus-tuning-iowa" }
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/measure-tracked-queries.test.js`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add docs/seo/tracked-queries.json scripts/measure/lib/tracked-queries.mjs tests/measure-tracked-queries.test.js
git commit -m "feat(measure): tracked query set + loader"
```

---

### Task 2: GSC request building + normalization

**Files:**
- Create: `scripts/measure/lib/gsc.mjs`
- Test: `tests/measure-gsc.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/measure-gsc.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/gsc.mjs"); });

test("buildSearchAnalyticsBody sets final dataState and defaults", () => {
  const b = M.buildSearchAnalyticsBody({ startDate: "2026-06-01", endDate: "2026-06-28" });
  assert.equal(b.startDate, "2026-06-01");
  assert.deepEqual(b.dimensions, ["query", "page"]);
  assert.equal(b.dataState, "final");
});

test("normalizeRows maps keys onto dimension names with metric defaults", () => {
  const rows = M.normalizeRows([{ keys: ["ott tune cost", "https://tunedyota.com/ott-tune-cost"], clicks: 3, impressions: 200, ctr: 0.015, position: 4.2 }], ["query", "page"]);
  assert.deepEqual(rows[0], { clicks: 3, impressions: 200, ctr: 0.015, position: 4.2, query: "ott tune cost", page: "https://tunedyota.com/ott-tune-cost" });
});

test("pullGsc filters tracked rows by query and returns top pages", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const rows = body.dimensions.length === 2
      ? [{ keys: ["ott tune cost", "https://tunedyota.com/ott-tune-cost"], clicks: 3, impressions: 200, ctr: 0.015, position: 4 },
         { keys: ["unrelated", "https://tunedyota.com/x"], clicks: 1, impressions: 5, ctr: 0.2, position: 9 }]
      : [{ keys: ["https://tunedyota.com/"], clicks: 50, impressions: 4000, ctr: 0.0125, position: 6 }];
    return { ok: true, json: async () => ({ rows }) };
  };
  const out = await M.pullGsc({
    getAccessToken: async () => "tok",
    fetchImpl,
    property: "sc-domain:tunedyota.com",
    startDate: "2026-06-01", endDate: "2026-06-28",
    trackedQueries: [{ query: "ott tune cost" }],
  });
  assert.equal(out.tracked.length, 1);
  assert.equal(out.tracked[0].query, "ott tune cost");
  assert.equal(out.topPages.length, 1);
  assert.equal(out.range.end, "2026-06-28");
  assert.equal(calls.length, 2);
});

test("pullGsc throws on a non-ok response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(
    M.pullGsc({ getAccessToken: async () => "tok", fetchImpl, property: "p", startDate: "a", endDate: "b" }),
    /GSC 403/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/measure-gsc.test.js`
Expected: FAIL — cannot resolve `../scripts/measure/lib/gsc.mjs`.

- [ ] **Step 3: Implement the module**

```js
// scripts/measure/lib/gsc.mjs
export function buildSearchAnalyticsBody({ startDate, endDate, dimensions = ["query", "page"], rowLimit = 1000 }) {
  return { startDate, endDate, dimensions, rowLimit, dataState: "final" };
}

export function normalizeRows(apiRows = [], dimensions = ["query", "page"]) {
  return apiRows.map((r) => {
    const out = { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 };
    (r.keys || []).forEach((k, i) => { out[dimensions[i]] = k; });
    return out;
  });
}

export async function pullGsc({ getAccessToken, fetchImpl = fetch, property, startDate, endDate, trackedQueries = [] }) {
  const token = await getAccessToken();
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const call = async (body) => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GSC ${res.status}`);
    const json = await res.json();
    return json.rows || [];
  };
  const byQueryPage = normalizeRows(
    await call(buildSearchAnalyticsBody({ startDate, endDate, dimensions: ["query", "page"] })),
    ["query", "page"]
  );
  const wanted = new Set(trackedQueries.map((q) => q.query.toLowerCase()));
  const tracked = byQueryPage.filter((r) => wanted.has((r.query || "").toLowerCase()));
  const topPages = normalizeRows(
    await call(buildSearchAnalyticsBody({ startDate, endDate, dimensions: ["page"], rowLimit: 25 })),
    ["page"]
  );
  return { range: { start: startDate, end: endDate }, tracked, topPages };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/measure-gsc.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/measure/lib/gsc.mjs tests/measure-gsc.test.js
git commit -m "feat(measure): GSC request building, normalization, and pull"
```

---

### Task 3: Perplexity probe

**Files:**
- Create: `scripts/measure/lib/perplexity.mjs`
- Test: `tests/measure-perplexity.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/measure-perplexity.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/perplexity.mjs"); });

test("buildPerplexityBody uses the sonar model and carries the query", () => {
  const b = M.buildPerplexityBody("is an ott tune worth it");
  assert.equal(b.model, "sonar");
  assert.equal(b.messages.at(-1).content, "is an ott tune worth it");
});

test("parsePerplexityResult flags our domain (incl. subdomain) and lists competitors", () => {
  const resp = { citations: ["https://www.tunedyota.com/is-the-ott-tune-worth-it", "https://blog.tunedyota.com/x", "https://example.com/a", "https://rival.com/b"] };
  const r = M.parsePerplexityResult("is an ott tune worth it", resp, { ourDomain: "tunedyota.com" });
  assert.equal(r.citedUs, true);
  assert.equal(r.ourCitations.length, 2);
  assert.deepEqual(r.competitors.sort(), ["example.com", "rival.com"]);
});

test("parsePerplexityResult handles no citations", () => {
  const r = M.parsePerplexityResult("q", {}, { ourDomain: "tunedyota.com" });
  assert.equal(r.citedUs, false);
  assert.deepEqual(r.competitors, []);
});

test("probePerplexity records a per-query error instead of throwing", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) return { ok: true, json: async () => ({ citations: ["https://tunedyota.com/x"] }) };
    throw new Error("rate limited");
  };
  const out = await M.probePerplexity({
    queries: [{ query: "a" }, { query: "b" }],
    fetchImpl, apiKey: "k", ourDomain: "tunedyota.com",
  });
  assert.equal(out[0].citedUs, true);
  assert.equal(out[1].error, "rate limited");
  assert.equal(out[1].citedUs, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/measure-perplexity.test.js`
Expected: FAIL — cannot resolve `../scripts/measure/lib/perplexity.mjs`.

- [ ] **Step 3: Implement the module**

```js
// scripts/measure/lib/perplexity.mjs
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function isOurs(domain, ourDomain) {
  return domain === ourDomain || (domain && domain.endsWith(`.${ourDomain}`));
}

export function buildPerplexityBody(query) {
  return {
    model: "sonar",
    messages: [
      { role: "system", content: "Answer concisely and cite your sources." },
      { role: "user", content: query },
    ],
  };
}

export function parsePerplexityResult(query, resp, { ourDomain = "tunedyota.com" } = {}) {
  const citations = (resp && resp.citations) || [];
  const ourCitations = citations.filter((u) => isOurs(domainOf(u), ourDomain));
  const competitors = [...new Set(
    citations.map(domainOf).filter((d) => d && !isOurs(d, ourDomain))
  )];
  return { query, citedUs: ourCitations.length > 0, ourCitations, competitors };
}

export async function probePerplexity({ queries, fetchImpl = fetch, apiKey, ourDomain = "tunedyota.com" }) {
  const out = [];
  for (const q of queries) {
    try {
      const res = await fetchImpl(PERPLEXITY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildPerplexityBody(q.query)),
      });
      if (!res.ok) throw new Error(`Perplexity ${res.status}`);
      const json = await res.json();
      out.push(parsePerplexityResult(q.query, json, { ourDomain }));
    } catch (e) {
      out.push({ query: q.query, citedUs: false, ourCitations: [], competitors: [], error: e.message });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/measure-perplexity.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/measure/lib/perplexity.mjs tests/measure-perplexity.test.js
git commit -m "feat(measure): Perplexity citation probe"
```

---

### Task 4: Snapshot assembly, CTR curve, diff, prior selection

**Files:**
- Create: `scripts/measure/lib/snapshot.mjs`
- Test: `tests/measure-snapshot.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/measure-snapshot.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/snapshot.mjs"); });

test("expectedCtr follows the curve and floors past page 1", () => {
  assert.equal(M.expectedCtr(1), 0.28);
  assert.equal(M.expectedCtr(4.2), 0.07); // rounds to 4
  assert.equal(M.expectedCtr(8), 0.03);
  assert.equal(M.expectedCtr(20), 0.01);
});

test("assembleSnapshot computes rates and flags below-curve high-impression page-1 queries", () => {
  const snap = M.assembleSnapshot({
    date: "2026-06-30",
    gsc: { range: { start: "a", end: "b" }, tracked: [
      { query: "ott tune cost", page: "/ott-tune-cost", clicks: 2, impressions: 300, ctr: 0.0066, position: 4 }, // expected 0.07, below 0.7*curve -> opportunity
      { query: "low vol", page: "/x", clicks: 0, impressions: 20, ctr: 0, position: 3 },                          // too few impressions
      { query: "healthy", page: "/y", clicks: 40, impressions: 300, ctr: 0.13, position: 2 },                     // at/above curve
    ], topPages: [] },
    webSearch: [{ query: "a", present: true }, { query: "b", present: false }],
    perplexity: [{ query: "a", citedUs: true }, { query: "b", citedUs: false }, { query: "c", citedUs: false }],
  });
  assert.equal(snap.summary.aiPresenceRate, 0.5);
  assert.equal(snap.summary.perplexityCiteRate, 0.33);
  assert.deepEqual(snap.summary.ctrOpportunities, ["ott tune cost"]);
  assert.deepEqual(snap.meta.errors, []);
});

test("diffSnapshots returns baseline when there is no prior", () => {
  const d = M.diffSnapshots(null, { gsc: { tracked: [] }, summary: { aiPresenceRate: 0.5, perplexityCiteRate: 0.2 } });
  assert.equal(d.baseline, true);
});

test("diffSnapshots reports position movers and AI deltas", () => {
  const prev = { gsc: { tracked: [{ query: "ott tune cost", ctr: 0.01, position: 8 }] }, summary: { aiPresenceRate: 0.4, perplexityCiteRate: 0.2 } };
  const curr = { gsc: { tracked: [{ query: "ott tune cost", ctr: 0.02, position: 4 }] }, summary: { aiPresenceRate: 0.5, perplexityCiteRate: 0.2 } };
  const d = M.diffSnapshots(prev, curr);
  assert.equal(d.baseline, false);
  assert.equal(d.movers[0].positionDelta, 4); // 8 -> 4 is +4 (improvement)
  assert.equal(d.ai.aiPresenceDelta, 0.1);
  assert.equal(d.ai.perplexityCiteDelta, 0);
});

test("selectLatestPrior picks the newest dated file strictly before the given date", () => {
  const files = ["2026-05-01.json", "2026-06-01.json", "2026-06-30.json", "notes.txt"];
  assert.equal(M.selectLatestPrior(files, "2026-06-30"), "2026-06-01");
  assert.equal(M.selectLatestPrior(["2026-06-30.json"], "2026-06-30"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/measure-snapshot.test.js`
Expected: FAIL — cannot resolve `../scripts/measure/lib/snapshot.mjs`.

- [ ] **Step 3: Implement the module**

```js
// scripts/measure/lib/snapshot.mjs
const CTR_CURVE = { 1: 0.28, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05 };

export function expectedCtr(position) {
  if (!position || position < 1) return 0;
  const p = Math.round(position);
  if (p <= 5) return CTR_CURVE[p];
  if (p <= 10) return 0.03;
  return 0.01;
}

function rate(arr, pred) {
  return arr.length ? Number((arr.filter(pred).length / arr.length).toFixed(2)) : 0;
}

export function assembleSnapshot({ date, gsc, webSearch = [], perplexity = [], errors = [] }) {
  const ctrOpportunities = (gsc?.tracked || [])
    .filter((r) => r.impressions >= 100 && r.position > 0 && r.position <= 10 && r.ctr < 0.7 * expectedCtr(r.position))
    .map((r) => r.query);
  return {
    date,
    gsc: gsc || null,
    ai: { webSearch, perplexity },
    summary: {
      aiPresenceRate: rate(webSearch, (r) => r.present),
      perplexityCiteRate: rate(perplexity, (r) => r.citedUs),
      ctrOpportunities,
    },
    meta: { errors },
  };
}

export function diffSnapshots(prev, curr) {
  if (!prev) return { baseline: true, movers: [], ai: { aiPresenceDelta: 0, perplexityCiteDelta: 0 } };
  const prevByQuery = new Map((prev.gsc?.tracked || []).map((r) => [r.query.toLowerCase(), r]));
  const movers = (curr.gsc?.tracked || [])
    .map((r) => {
      const p = prevByQuery.get(r.query.toLowerCase());
      return p ? { query: r.query, positionDelta: Number((p.position - r.position).toFixed(1)), ctrDelta: Number((r.ctr - p.ctr).toFixed(4)) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.positionDelta) - Math.abs(a.positionDelta));
  return {
    baseline: false,
    movers,
    ai: {
      aiPresenceDelta: Number((curr.summary.aiPresenceRate - prev.summary.aiPresenceRate).toFixed(2)),
      perplexityCiteDelta: Number((curr.summary.perplexityCiteRate - prev.summary.perplexityCiteRate).toFixed(2)),
    },
  };
}

export function selectLatestPrior(filenames, beforeDate) {
  return filenames
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d < beforeDate)
    .sort()
    .pop() || null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/measure-snapshot.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/measure/lib/snapshot.mjs tests/measure-snapshot.test.js
git commit -m "feat(measure): snapshot assembly, CTR curve, diff, prior selection"
```

---

### Task 5: Slack report rendering

**Files:**
- Create: `scripts/measure/lib/report.mjs`
- Test: `tests/measure-report.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/measure-report.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/report.mjs"); });

const SNAP = {
  date: "2026-06-30",
  summary: { aiPresenceRate: 0.55, perplexityCiteRate: 0.3, ctrOpportunities: ["ott tune cost", "is an ott tune worth it"] },
  meta: { errors: [] },
};

test("renderReport on a baseline run says baseline and shows rates", () => {
  const md = M.renderReport(SNAP, { baseline: true, movers: [], ai: { aiPresenceDelta: 0, perplexityCiteDelta: 0 } });
  assert.match(md, /baseline/i);
  assert.match(md, /55%/);
  assert.match(md, /30%/);
  assert.match(md, /ott tune cost/);
});

test("renderReport on a trend run shows deltas and top movers", () => {
  const diff = { baseline: false, movers: [{ query: "ott tune cost", positionDelta: 4, ctrDelta: 0.01 }], ai: { aiPresenceDelta: 0.1, perplexityCiteDelta: -0.05 } };
  const md = M.renderReport(SNAP, diff);
  assert.match(md, /\+10pts|\+0\.1|\+10/);
  assert.match(md, /ott tune cost/);
});

test("renderReport surfaces probe errors loudly", () => {
  const md = M.renderReport({ ...SNAP, meta: { errors: ["GSC auth failed"] } }, { baseline: true, movers: [], ai: {} });
  assert.match(md, /GSC auth failed/);
  assert.match(md, /⚠|error/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/measure-report.test.js`
Expected: FAIL — cannot resolve `../scripts/measure/lib/report.mjs`.

- [ ] **Step 3: Implement the module**

```js
// scripts/measure/lib/report.mjs
const pct = (n) => `${Math.round((n || 0) * 100)}%`;
const ptsDelta = (n) => {
  const v = Math.round((n || 0) * 100);
  return v === 0 ? "flat" : `${v > 0 ? "+" : ""}${v}pts`;
};

export function renderReport(snapshot, diff) {
  const s = snapshot.summary;
  const lines = [];
  lines.push(`*Search + AI visibility — ${snapshot.date}*`);

  if (diff.baseline) {
    lines.push(`Baseline established. AI presence ${pct(s.aiPresenceRate)}, Perplexity cites ${pct(s.perplexityCiteRate)}.`);
  } else {
    lines.push(`AI presence ${pct(s.aiPresenceRate)} (${ptsDelta(diff.ai.aiPresenceDelta)}), Perplexity cites ${pct(s.perplexityCiteRate)} (${ptsDelta(diff.ai.perplexityCiteDelta)}).`);
    const top = (diff.movers || []).slice(0, 5)
      .map((m) => `• ${m.query}: position ${m.positionDelta >= 0 ? "+" : ""}${m.positionDelta}`)
      .join("\n");
    if (top) lines.push(`*Top movers:*\n${top}`);
  }

  if (s.ctrOpportunities.length) {
    lines.push(`*CTR opportunities (${s.ctrOpportunities.length}):* ${s.ctrOpportunities.join(", ")}`);
  }

  const errors = snapshot.meta?.errors || [];
  if (errors.length) lines.push(`⚠ *Probe errors:* ${errors.join("; ")}`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/measure-report.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/measure/lib/report.mjs tests/measure-report.test.js
git commit -m "feat(measure): Slack report rendering"
```

---

### Task 6: CLI entry scripts

**Files:**
- Modify: `package.json` (add `google-auth-library` dependency)
- Create: `scripts/measure/gsc-pull.mjs`
- Create: `scripts/measure/perplexity-probe.mjs`
- Create: `scripts/measure/snapshot.mjs`
- Create: `scripts/measure/report.mjs`

These are thin I/O wrappers around the tested libs; they are exercised by the routine end-to-end (Task 8), not unit-tested. Keep all logic in the libs.

- [ ] **Step 1: Add the dependency**

Run: `npm install google-auth-library`
Expected: `package.json` gains a `dependencies` entry for `google-auth-library` and `package-lock.json` is created/updated.

- [ ] **Step 2: Create `gsc-pull.mjs`**

```js
// scripts/measure/gsc-pull.mjs
// Pulls GSC Search Analytics for the tracked queries and prints a JSON blob to stdout.
// Env: GSC_SA_KEY (service-account JSON, raw), GSC_PROPERTY (default sc-domain:tunedyota.com).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleAuth } from "google-auth-library";
import { loadTrackedQueries } from "./lib/tracked-queries.mjs";
import { pullGsc } from "./lib/gsc.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function trailing28() {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);   // GSC finalizes data ~3 days back
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function main() {
  const property = process.env.GSC_PROPERTY || "sc-domain:tunedyota.com";
  const credentials = JSON.parse(process.env.GSC_SA_KEY);
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
  const client = await auth.getClient();
  const getAccessToken = async () => (await client.getAccessToken()).token;

  const trackedQueries = loadTrackedQueries(
    JSON.parse(fs.readFileSync(path.join(ROOT, "docs/seo/tracked-queries.json"), "utf8"))
  );
  const { startDate, endDate } = trailing28();
  const out = await pullGsc({ getAccessToken, property, startDate, endDate, trackedQueries });
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 3: Create `perplexity-probe.mjs`**

```js
// scripts/measure/perplexity-probe.mjs
// Probes Perplexity for each tracked query and prints [{query,citedUs,...}] to stdout.
// Env: PERPLEXITY_API_KEY.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrackedQueries } from "./lib/tracked-queries.mjs";
import { probePerplexity } from "./lib/perplexity.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set");
  const queries = loadTrackedQueries(
    JSON.parse(fs.readFileSync(path.join(ROOT, "docs/seo/tracked-queries.json"), "utf8"))
  );
  const out = await probePerplexity({ queries, apiKey });
  process.stdout.write(JSON.stringify(out));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 4: Create `snapshot.mjs`**

```js
// scripts/measure/snapshot.mjs
// Usage: node scripts/measure/snapshot.mjs <gsc.json> <websearch.json> <perplexity.json>
// Writes docs/seo/measurements/YYYY-MM-DD.json and prints the diff (vs latest prior) to stdout.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleSnapshot, diffSnapshots, selectLatestPrior } from "./lib/snapshot.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs/seo/measurements");

const readJson = (p) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null);

function main() {
  const [gscPath, webPath, pplxPath] = process.argv.slice(2);
  const gsc = readJson(gscPath);
  const webSearch = readJson(webPath) || [];
  const perplexity = readJson(pplxPath) || [];
  const errors = [];
  if (!gsc) errors.push("GSC pull missing/failed");
  if (!webSearch.length) errors.push("WebSearch probe empty");
  if (!perplexity.length) errors.push("Perplexity probe empty");

  const date = new Date().toISOString().slice(0, 10);
  const snapshot = assembleSnapshot({ date, gsc, webSearch, perplexity, errors });

  fs.mkdirSync(DIR, { recursive: true });
  const priorName = selectLatestPrior(fs.readdirSync(DIR), date);
  const prior = priorName ? readJson(path.join(DIR, `${priorName}.json`)) : null;
  fs.writeFileSync(path.join(DIR, `${date}.json`), JSON.stringify(snapshot, null, 2));

  process.stdout.write(JSON.stringify(diffSnapshots(prior, snapshot)));
}
main();
```

- [ ] **Step 5: Create `report.mjs`**

```js
// scripts/measure/report.mjs
// Usage: node scripts/measure/report.mjs <snapshot.json> <diff.json>
// Prints the Slack markdown report to stdout.
import fs from "node:fs";
import { renderReport } from "./lib/report.mjs";

const [snapPath, diffPath] = process.argv.slice(2);
const snapshot = JSON.parse(fs.readFileSync(snapPath, "utf8"));
const diff = JSON.parse(fs.readFileSync(diffPath, "utf8"));
process.stdout.write(renderReport(snapshot, diff));
```

- [ ] **Step 6: Smoke-check the offline CLIs (no secrets needed)**

Create throwaway fixtures and run the two offline CLIs to confirm wiring:

```bash
mkdir -p /tmp/m
echo '{"range":{"start":"2026-06-01","end":"2026-06-28"},"tracked":[{"query":"ott tune cost","page":"/ott-tune-cost","clicks":2,"impressions":300,"ctr":0.0066,"position":4}],"topPages":[]}' > /tmp/m/gsc.json
echo '[{"query":"ott tune cost","present":true,"position":3,"page":"/ott-tune-cost"}]' > /tmp/m/web.json
echo '[{"query":"ott tune cost","citedUs":false,"ourCitations":[],"competitors":["rival.com"]}]' > /tmp/m/pplx.json
node scripts/measure/snapshot.mjs /tmp/m/gsc.json /tmp/m/web.json /tmp/m/pplx.json > /tmp/m/diff.json
cat /tmp/m/diff.json
node scripts/measure/report.mjs docs/seo/measurements/$(date +%F).json /tmp/m/diff.json
```

Expected: `diff.json` shows `"baseline":true`; the report prints a "Baseline established" line listing the `ott tune cost` CTR opportunity. A dated file appears under `docs/seo/measurements/`.

- [ ] **Step 7: Remove the smoke-test snapshot (keep the directory)**

```bash
rm docs/seo/measurements/$(date +%F).json
```

If that leaves the directory empty, add a `.gitkeep` so the path is committed:

```bash
touch docs/seo/measurements/.gitkeep
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/measure/gsc-pull.mjs scripts/measure/perplexity-probe.mjs scripts/measure/snapshot.mjs scripts/measure/report.mjs docs/seo/measurements/.gitkeep
git commit -m "feat(measure): CLI entry scripts + google-auth-library dep"
```

---

### Task 7: Full test run + regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: all tests pass, including the 5 new `measure-*` files. No existing test regressed.

- [ ] **Step 2: Confirm the SEO build still works**

Run: `npm run build:seo`
Expected: "seo build complete" — the new files don't interfere with the existing build.

---

### Task 8: Routine documentation + handoff

**Files:**
- Create: `docs/seo/measurement-routine.md`

- [ ] **Step 1: Write the routine doc**

Create `docs/seo/measurement-routine.md` with exactly this content:

````markdown
# search-visibility-tracker — cloud routine

Monthly cloud routine (claude.ai/code/routines) that measures Google + AI-engine
visibility into a versioned snapshot and posts a trend report to Slack. Replaces the
old manual monthly GSC-reminder routine (decommission that one when this goes live).

## Secrets (routine settings)
- `GSC_SA_KEY` — Google Cloud service-account JSON (raw), granted read on the GSC property.
- `GSC_PROPERTY` — `sc-domain:tunedyota.com` (domain property) or `https://tunedyota.com/` (URL-prefix). Confirm which the property is.
- `PERPLEXITY_API_KEY` — Perplexity API key.
- `SLACK_WEBHOOK_URL` — existing webhook.

## Routine prompt
1. Pull GSC: `node scripts/measure/gsc-pull.mjs > /tmp/gsc.json`
2. Probe Perplexity: `node scripts/measure/perplexity-probe.mjs > /tmp/pplx.json`
3. WebSearch probe: read `docs/seo/tracked-queries.json`; for each query, run WebSearch
   and record `{query, present, position, page}` where `present` = does any
   tunedyota.com URL appear in the results, `position` = its rank (1-based) or null,
   `page` = the tunedyota.com URL found. Write the array to `/tmp/web.json`.
4. Assemble + diff: `node scripts/measure/snapshot.mjs /tmp/gsc.json /tmp/web.json /tmp/pplx.json > /tmp/diff.json`
   (this also writes `docs/seo/measurements/<today>.json`).
5. Report: `node scripts/measure/report.mjs docs/seo/measurements/<today>.json /tmp/diff.json`
6. POST the report text to `SLACK_WEBHOOK_URL` as `{ "text": "<report>" }`.
7. Commit the new snapshot: `git add docs/seo/measurements && git commit -m "chore(measure): <today> snapshot" && git push`.

If any step's command exits non-zero, still run steps 4-6 with whatever JSON exists
(`snapshot.mjs` records missing probes in `meta.errors`, and the report surfaces them
loudly). Never skip the Slack post.

## Reading a snapshot
- `summary.ctrOpportunities` — page-1, high-impression queries whose CTR is >30% below
  the position curve. These are the targets for the NEXT Phase 3 round (title/meta rewrites).
- `summary.aiPresenceRate` / `perplexityCiteRate` — AI-visibility baseline to trend.
````

- [ ] **Step 2: Commit**

```bash
git add docs/seo/measurement-routine.md
git commit -m "docs(measure): search-visibility-tracker routine playbook"
```

---

### Task 9: Update program memory

**Files:** none in-repo (memory lives outside the repo at the memory path)

- [ ] **Step 1:** Update the `search-ai-visibility-program` memory file to mark Phase 3 *measurement* shipped (engine + scripts + routine playbook live; baseline pending first routine run), note the old GSC-reminder routine is retired, and that the on-page CTR/internal-linking round is the remaining Phase 3 work — fed by `summary.ctrOpportunities`. Update [[cloud-routines]] to list `search-visibility-tracker`. Add the one-line pointers in `MEMORY.md` as needed. (This is a memory-maintenance step, not a code commit.)

---

## Owner setup (blocks the first live run, not the code)

The code and tests land without these; the routine's first real run needs them:
1. Create a GCP service account, grant it read on the GSC property, paste its JSON as `GSC_SA_KEY`.
2. Confirm `GSC_PROPERTY` (domain vs URL-prefix).
3. Add `PERPLEXITY_API_KEY`.
4. Create the routine at claude.ai/code/routines with the prompt from `docs/seo/measurement-routine.md`, monthly schedule; delete the old GSC-reminder routine.

---

## Self-review notes

- **Spec coverage:** tracked queries (T1), GSC pull (T2), Perplexity probe (T3), WebSearch probe (routine step 3, T8), snapshot schema + diff + baseline (T4/T6), report incl. CTR-opportunity flags + loud errors (T5), monthly cadence + owner setup + decommission (T8/owner section), testing (T1-T5,T7), docs/memory handoff (T8/T9). The one spec detail left open — the exact CTR-opportunity threshold — is now pinned in `expectedCtr` + the `impressions>=100 && position<=10 && ctr<0.7*expected` rule (T4).
- **Type consistency:** `loadTrackedQueries`, `pullGsc`, `probePerplexity`, `assembleSnapshot`, `diffSnapshots`, `selectLatestPrior`, `renderReport`, `expectedCtr` names are used identically across tasks. Snapshot shape (`{date,gsc,ai:{webSearch,perplexity},summary,meta}`) matches the spec schema and the report/diff consumers.
- **Placeholders:** none — every step carries real code or a concrete command.
