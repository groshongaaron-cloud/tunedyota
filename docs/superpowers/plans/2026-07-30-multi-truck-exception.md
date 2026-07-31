# Multi-Truck Exception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one booking per client per event in the public funnel; a duplicate attempt becomes a "Multi-truck request" waitlist row carrying a back-to-back slot suggestion, granted via the existing convert flow.

**Architecture:** Guard + adjacency computed inside `processBooking` (deps-injected, tested via the existing harness in `tests/book.test.js`); request rides the existing `priority()` path and `book-background` notification; funnel gets one new status branch; console gets a one-line badge label tweak.

**Tech Stack:** Node CJS Netlify functions, node:test, vanilla-JS funnel/console.

**Spec:** `docs/superpowers/specs/2026-07-30-multi-truck-exception-design.md`

---

### Task 1: Guard + adjacency in `book.js`

**Files:** Modify `netlify/functions/book.js`; Test `tests/book.test.js` (append; extend harness records with Phone/Email).

- [ ] **Step 1 (RED):** Append tests using a harness variant whose Airtable list returns full records:

```js
function harness2({ events, bookings = [] }) {
  const created = [];
  const fetchImpl = async (url, opts) => {
    if (url.includes("docs.google.com")) return { ok: true, text: async () => events };
    if (url.includes("api.airtable.com")) {
      if (opts && opts.method === "POST") { const b = JSON.parse(opts.body); created.push({ url, fields: b.fields }); return { ok: true, json: async () => ({ id: "r1" }) }; }
      return { ok: true, json: async () => ({ records: bookings.map((f) => ({ fields: f })) }) };
    }
    throw new Error("unexpected " + url);
  };
  const jobs = [];
  const deps = { fetchImpl, env: { EVENTS_SHEET_ID: "x", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    trigger: async (a) => { jobs.push(a); return { ok: true }; }, now: () => "20260101T000000Z",
    nowDate: new Date("2026-07-01T00:00:00Z"), log: { warn() {}, error() {} } };
  return { deps, created, jobs };
}
```

Tests: duplicate phone (`+1` formatted vs bare) at same event → `status:"multi-truck"`, `existingSlot`, `suggestedSlot` = later adjacent open; Priority row created with `Reason:"Multi-truck request"` + `Requested Slot`; duplicate email likewise; earlier neighbor when later taken; both neighbors taken → blank suggestion; same phone but different-event city books normally; job payload carries `reason:"multi-truck"` and `d.suggestedSlot`.

- [ ] **Step 2:** `node --test tests/book.test.js` → new tests FAIL (status is booked/conflict).
- [ ] **Step 3 (GREEN):** In `book.js`: import `normalizePhone, normalizeEmail` from `./lib/leads.js` and `slotMode` from `./lib/slots.js`; fetch `fields: ["Slot","Phone","Email"]`; `priority(reason, extra)` supports `Reason:"Multi-truck request"` + `extra.requestedSlot` + passes `extra.suggestedSlot` into the job's `d`; after `open` is computed, find `dupe` by normalized phone/email; if found return `priority("multi-truck", …)` + `{ status:"multi-truck", existingSlot, suggestedSlot, installerName }` (adjacent = grid index ±1, later preferred, times-mode only).
- [ ] **Step 4:** file green, `npm test` green. **Step 5:** Commit `feat(book): one booking per client per event — duplicate becomes multi-truck request`.

### Task 2: Notification copy (`lib/templates.js`)

- [ ] RED: test in `tests/book.test.js` — `buildPriorityCustomerEmail(d,inst,market,"multi-truck")` text mentions second truck; installer email Reason row says "Multi-truck request" and shows the back-to-back suggestion row when `d.suggestedSlot` set.
- [ ] GREEN: `priorityWord("multi-truck")` → "we got your second-truck request — you're already booked at this event"; installer rows add `row("Reason", …"Multi-truck request"…)` + `row("Back-to-back suggestion", d.suggestedSlot)` for that reason. Commit `feat(templates): multi-truck request email copy`.

### Task 3: Funnel status branch (`site/find-your-exact-tune.html`)

- [ ] After the `priority` branch (~line 1075) add:

```js
else if(out.status==="multi-truck"){ track(6,"priority"); bookSuccess("You're already booked for this event.",
  `Your ${out.existingSlot?`${out.existingSlot} `:""}appointment stands. Bringing a second truck? We've flagged it for ${out.installerName||"your installer"}` +
  (out.suggestedSlot?` — ${out.suggestedSlot} looks open back-to-back and he'll confirm.`:" — he'll find the closest slot and confirm.")); }
```

- [ ] Parse-check inline JS; run any funnel tests (`tests/booking-ui.test.js`, `tests/book-page.test.mjs`). Commit `feat(funnel): friendly multi-truck request confirmation`.

### Task 4: Console badge label (`site/installer.html:2019`)

- [ ] Change `' · wanted '+l.requestedSlot` to `' · '+(/multi-truck/i.test(l.reason)?'back-to-back: ':'wanted ')+l.requestedSlot`. Parse-check. Commit `feat(console): multi-truck waitlist badge reads back-to-back`.

### Task 5: Rollout + live smoke

- [ ] `npm test` green → push (Netlify deploys).
- [ ] Live: POST the booking function with Eli's phone + Madison/2026-08-01 → expect `multi-truck` with `suggestedSlot` (10:00 or 10:40 if open); verify the Priority row's Reason + Requested Slot; note the installer email fires to Aaron (heads-up, it's a smoke artifact); console Waitlist tab shows "back-to-back:". Then delete the smoke lead via lead-update `delete`.
- [ ] Update memory; report.

## Self-review
Spec coverage: guard (T1), request+suggestion (T1), notification (T2), funnel copy (T3), badge (T4), rollout+smoke (T5); console grant path needs no work (existing convert). Types: `suggestedSlot`/`existingSlot`/`installerName` named identically in T1 return, T2 `d.suggestedSlot`, T3 reads. No placeholders.
