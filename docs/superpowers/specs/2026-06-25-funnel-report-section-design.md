# Funnel Drop-off Report Section — Design

**Date:** 2026-06-25
**Status:** Approved (owner sign-off 2026-06-25)
**Scope:** Fast-follow on the submissions reporting bundle + funnel measurement.

## Goal

Surface in-funnel drop-off in the existing weekly submissions report, using the
already-built `aggregateFunnel` over the `Funnel Events` data captured by the
`track` beacons. Month-to-date window, to match the report's existing MTD framing.

## Data flow (`netlify/functions/submissions-report.js`)

1. Alongside the existing Bookings + Priority fetch, also `listAllRecords` on the
   `Funnel Events` table (name from `env.AIRTABLE_FUNNEL_TABLE || "Funnel Events"`).
   Wrap in its own try/catch: a missing/inaccessible table → empty array (the
   funnel section simply won't appear; the rest of the report is unaffected).
2. `flattenRecords` the rows, filter to **month-to-date** by record `createdTime`
   (`>= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)`).
3. `aggregateFunnel(filtered)` → attach to the report object as `report.funnel`
   (or leave unset/null when there are no in-window events).

`buildReport` stays pure over bookings/priority; the funnel is attached in the
function after `buildReport`, keeping the metrics module unchanged.

## Render

- **`renderEmailHtml`** — new **"Funnel (month-to-date)"** section, shown only when
  `report.funnel && report.funnel.totalSessions > 0`. A table of
  `Step · Sessions · Drop % · Overall %` across steps make→model→config→goals→
  result→book→outcome (using the `name`/`sessions`/`dropPct`/`overallPct` fields
  `aggregateFunnel` already returns).
- **`renderSlack`** — one compact line when present:
  `Funnel: Make 40 → Model 28 → … → Book 9` plus a callout of the **biggest
  single drop** (the step with the max `dropPct`), e.g. `(biggest drop: Model −30%)`.
- Both omit the section entirely when there's no funnel data.

## Testing (TDD, node:test)

- `tests/report-render.test.js` — with a `report.funnel` fixture: email HTML
  contains "Funnel" + step names + a drop %, and Slack contains the funnel line +
  biggest-drop callout. With no `funnel`: neither renders (no "Funnel" string).
- `tests/submissions-report.test.js` — inject a `Funnel Events` list into the
  fake fetch/list: report gains `report.funnel` with expected sessions; an empty
  funnel list → no `report.funnel` section and no error; a list fetch that throws
  is swallowed (report still delivered).

## Out of scope

- No new table/columns (uses the existing `Funnel Events`).
- No per-channel (UTM) funnel breakdown — overall funnel only.
- No change to `aggregateFunnel` or `buildReport`.
