# Funnel Drop-off Report Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a month-to-date funnel drop-off section (email + Slack) to the weekly submissions report, fed by the existing `aggregateFunnel` over `Funnel Events`.

**Architecture:** `submissions-report.js` fetches `Funnel Events`, filters to MTD by `createdTime`, runs `aggregateFunnel`, and attaches `report.funnel`; the renderers add a Funnel section when `report.funnel` is present. No change to `buildReport` or `aggregateFunnel`.

**Tech Stack:** Node CommonJS, Netlify scheduled function, Airtable REST, `node:test`.

---

## File Structure

- `netlify/functions/lib/report-render.js` — add `cap()` + Funnel rendering in `renderSlack`/`renderEmailHtml`.
- `netlify/functions/submissions-report.js` — fetch + aggregate + attach `report.funnel`.
- Tests: `tests/report-render.test.js`, `tests/submissions-report.test.js`.

**Branching:** `feat/funnel-report-section` off `master`.

---

### Task 0: Branch + docs

- [ ] **Step 1**

```bash
git checkout master
git checkout -b feat/funnel-report-section
git add docs/superpowers/specs/2026-06-25-funnel-report-section-design.md docs/superpowers/plans/2026-06-25-funnel-report-section.md
git commit -m "docs: spec + plan for funnel drop-off report section"
```

---

### Task 1: Render the Funnel section

**Files:** Modify `netlify/functions/lib/report-render.js`; Test `tests/report-render.test.js`.

- [ ] **Step 1: Write the failing tests** (append to `tests/report-render.test.js`)

```js
const funnelReport = {
  ...report,
  funnel: { totalSessions: 4, steps: [
    { step: 0, name: "make", sessions: 4, dropPct: 0, overallPct: 100 },
    { step: 1, name: "model", sessions: 3, dropPct: 25, overallPct: 75 },
    { step: 2, name: "config", sessions: 1, dropPct: 67, overallPct: 25 },
    { step: 3, name: "goals", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 4, name: "result", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 5, name: "book", sessions: 1, dropPct: 0, overallPct: 25 },
    { step: 6, name: "outcome", sessions: 1, dropPct: 0, overallPct: 25 },
  ] },
};

test("renders funnel section in email + slack when present, biggest drop called out", () => {
  const h = renderEmailHtml(funnelReport);
  assert.ok(h.includes("Funnel (month-to-date)"), "email funnel heading");
  assert.ok(h.includes("Config") && h.includes("67%"), "email shows a drop");
  const s = renderSlack(funnelReport);
  assert.match(s, /Funnel \(MTD\): Make 4 → Model 3/);
  assert.match(s, /biggest drop Config −67%/);
});
test("omits funnel section when absent", () => {
  assert.ok(!renderEmailHtml(report).includes("Funnel (month-to-date)"));
  assert.ok(!/Funnel \(MTD\)/.test(renderSlack(report)));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/report-render.test.js`
Expected: FAIL — no funnel rendering.

- [ ] **Step 3: Implement** — in `netlify/functions/lib/report-render.js`:

(a) Add a `cap` helper after the `sign` function near the top:

```js
function cap(s) { return String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1); }
```

(b) In `renderSlack`, insert **before** the `if (r.actionItems.length) {` line:

```js
  if (r.funnel && r.funnel.totalSessions > 0) {
    const chain = r.funnel.steps.map((s) => `${cap(s.name)} ${s.sessions}`).join(" → ");
    const big = r.funnel.steps.filter((s) => s.step > 0).reduce((m, s) => (s.dropPct > (m ? m.dropPct : 0) ? s : m), null);
    lines.push(`Funnel (MTD): ${chain}` + (big && big.dropPct > 0 ? ` · biggest drop ${cap(big.name)} −${big.dropPct}%` : ""));
  }
```

(c) In `renderEmailHtml`, insert **before** the `html += h2("Action items");` line:

```js
  if (r.funnel && r.funnel.totalSessions > 0) {
    html += h2("Funnel (month-to-date)");
    html += table([
      ["Step", "Sessions", "Drop", "Overall"],
      ...r.funnel.steps.map((s) => [cap(s.name), String(s.sessions), s.step ? `−${s.dropPct}%` : "—", `${s.overallPct}%`]),
    ]);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/report-render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/report-render.js tests/report-render.test.js
git commit -m "feat(report): render month-to-date funnel drop-off (email + slack)"
```

---

### Task 2: Fetch + aggregate + attach the funnel

**Files:** Modify `netlify/functions/submissions-report.js`; Test `tests/submissions-report.test.js`.

- [ ] **Step 1: Add the failing test** (append to `tests/submissions-report.test.js`)

```js
test("attaches a month-to-date funnel when Funnel Events exist", async () => {
  const booking = { id: "b1", createdTime: "2026-06-24T00:00:00Z", fields: { City: "Omaha", "Event Date": "2026-06-28", Slot: "9:00", Name: "A", Email: "a@x.com", Installer: "noah", Status: "Booked", Vehicle: "Tacoma" } };
  const funnelRows = [
    { id: "f1", createdTime: "2026-06-20T00:00:00Z", fields: { Session: "a", Step: 0, "Step Name": "make" } },
    { id: "f2", createdTime: "2026-06-20T00:00:00Z", fields: { Session: "a", Step: 1, "Step Name": "model" } },
    { id: "f3", createdTime: "2026-06-20T00:00:00Z", fields: { Session: "b", Step: 0, "Step Name": "make" } },
    { id: "f4", createdTime: "2026-05-01T00:00:00Z", fields: { Session: "old", Step: 0, "Step Name": "make" } }, // before MTD -> excluded
  ];
  const d = deps({ listAll: async ({ table }) => table === "Funnel Events" ? funnelRows : table === "Bookings" ? [booking] : [] });
  await runReport(d);
  assert.match(d._notifies[0].text, /Funnel \(MTD\): Make 2 → Model 1/); // old session excluded -> 2 at make
  assert.ok(d._sends[0].html.includes("Funnel (month-to-date)"));
});
test("no funnel section when Funnel Events empty", async () => {
  const d = deps(); // default listAll returns [] for non-Bookings incl Funnel Events
  await runReport(d);
  assert.ok(!/Funnel \(MTD\)/.test(d._notifies[0].text));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/submissions-report.test.js`
Expected: FAIL — funnel not attached/rendered.

- [ ] **Step 3: Implement** — in `netlify/functions/submissions-report.js`:

(a) Add the import after the existing `report-metrics` require:

```js
const { aggregateFunnel } = require("./lib/funnel.js");
```

(b) Immediately after the `const report = buildReport({ ... });` block and before `const csv = renderContactsCsv(report);`, insert:

```js
  try {
    const fRecs = await listAll({ token: c.token, baseId: c.baseId, table: env.AIRTABLE_FUNNEL_TABLE || "Funnel Events" });
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const fEvents = flattenRecords(fRecs).filter((e) => e.createdTime && new Date(e.createdTime).getTime() >= monthStart);
    const f = aggregateFunnel(fEvents);
    if (f.totalSessions > 0) report.funnel = f;
  } catch (e) { if (log.error) log.error("funnel fetch", e.message); }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/submissions-report.test.js`
Expected: PASS (incl. the existing delivery tests).

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/submissions-report.js tests/submissions-report.test.js
git commit -m "feat(report): fetch Funnel Events -> MTD aggregateFunnel -> report.funnel"
```

---

### Task 3: Verify + ship

- [ ] **Step 1: Full suite** — Run: `npm test` — Expected: all pass.
- [ ] **Step 2: Ship** — per the `ship` skill: it's a pure functions/lib change (no SEO inputs), so `npm test` then merge `feat/funnel-report-section` → `master` + push; confirm Netlify `ready`. No new env/table prerequisites — the weekly report just gains a Funnel section on its next run.

---

## Self-Review

**Spec coverage:** MTD fetch+filter+aggregate+attach (Task 2) ✓; email Funnel table + Slack one-line + biggest-drop callout (Task 1) ✓; graceful when table missing/empty (Task 2 try/catch + `totalSessions>0` guard, Task 1 absence test) ✓; no change to `aggregateFunnel`/`buildReport` ✓; tests for render present/absent + fetch/aggregate/empty (Tasks 1–2) ✓.

**Placeholder scan:** none — full code each step.

**Type/name consistency:** `report.funnel` shape `{ totalSessions, steps:[{step,name,sessions,dropPct,overallPct}] }` matches `aggregateFunnel`'s output and the renderers' reads; `cap` defined Task 1 used in both renderers; `AIRTABLE_FUNNEL_TABLE` default `"Funnel Events"` matches `track.js`; `flattenRecords`/`listAll`/`now`/`c`/`env`/`log` all already in `runReport` scope.
