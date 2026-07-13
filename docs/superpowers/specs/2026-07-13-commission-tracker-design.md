# Live Commission Tracker — Design Spec

**Date:** 2026-07-13 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project C1** of the installer-dashboard enhancement program ([[certificate-v2-dashboard-program]]).

---

## 1. Goal

Show a **live, running calendar-month OTT commission total** in the installer console header — a real-time preview of what the monthly OTT report will total. Each installer sees their own figure; the admin (Aaron) sees a per-installer roll-up + grand total, plus last month's total and a "report due by the 7th" reminder (Policy 0007).

## 2. Scope

**In:** per-completed-booking commission resolved server-side in the roster (reusing the existing OTT commission engine); a pure client-side aggregation (`site/commission-tally.js`) into current-month / last-month / lifetime + per-installer figures; the header rendering (installer view + admin view). No new data or owner setup.

**Out:** installer take-home pay (this is the OTT price-sheet commission owed, the monthly-report figure — owner confirmed); storing/persisting commission (it's re-derived live); changing the monthly OTT report flow; any figure a regular installer shouldn't see (the roster's existing scoping enforces this).

## 3. What the number is

The **OTT commission owed per the price sheet** — the same value the monthly report uses, via `lib/ott-commission.js` `resolveCommission({ vehicleType, engine, year, tuningPlatform, calibrationType })` → a dollar amount or **`null` when the lookup is ambiguous** (those are resolved when the owner confirms the monthly draft). Always shown as an **estimate** ("est."), with ambiguous tunes surfaced as **pending** — the tracker never overclaims vs. the confirmed report.

## 4. Components

### 4.1 `netlify/functions/installer-roster.js` (modify)
- Import `deriveVehicle`, `resolveCommission` from `./lib/ott-commission.js`.
- In the record→booking map, add a per-booking **`commission`** (number | null), computed **only for completed bookings**:
  ```js
  let commission = null;
  if (f.Status === "Completed") {
    const dv = deriveVehicle(f.Vehicle || "");
    commission = resolveCommission({
      vehicleType: dv.vehicleType, engine: dv.engine,
      year: f["Model Year"] || dv.year,
      tuningPlatform: f["Tuning Platform"], calibrationType: f["Calibration Type"],
    });
  }
  ```
  Non-completed → `commission: null`. **Scoping does the privacy work:** a regular installer's roster contains only their bookings, so they only ever receive their own amounts; admin receives all. The price sheet itself is never sent to the client.

### 4.2 `site/commission-tally.js` (new, shared pure — browser + Node, like `amsoil-garage-render.js`)
- Pure arithmetic over roster bookings (sums the roster-provided `commission`; no price sheet).
- **`commissionTally(bookings, curYm) -> { month:{total,tunes,pending}, lastMonth:{total}, lifetime:{total}, byInstaller:{ key:amount } }`** where `curYm` is `"YYYY-MM"`.
  - `month`: completed bookings whose `dateISO` month === `curYm` — `tunes` = count, `total` = sum of numeric commissions, `pending` = count with `commission == null`.
  - `lastMonth.total`: sum of numeric commissions for the previous month (pure string rollover, Jan → prior Dec).
  - `lifetime.total`: sum of all numeric commissions across completed bookings.
  - `byInstaller`: current-month numeric-commission sum keyed by `installer` (for the admin breakdown).
- Exposes `window.commissionTally` (browser) + `module.exports` (Node), same dual-export pattern as `site/amsoil-referral.js`.

### 4.3 `site/installer.html` (modify)
- Add `<script src="/commission-tally.js"></script>` in `<head>`.
- Add a money helper: `money(n) = "$" + Math.round(n).toLocaleString("en-US")`.
- In **`renderTally()`**, after computing the existing done/open/no-show tally, call `window.commissionTally(visibleBookings(), STATE.today.slice(0,7))` and render:
  - **All users:** a line — `This month · est. <money(total)> · <tunes> tunes` + (`· <pending> pending confirmation` when `pending > 0`); and **Lifetime · <money(lifetime.total)> commission** appended to the existing lifetime line.
  - **Admin only** (`STATE.admin`, and only when no single-installer filter is active): a per-installer breakdown line — `Aaron <money> · Noah <money> · Cody <money>` (from `byInstaller`, `cap()` the keys, sorted), plus a **`Last month · est. <money(lastMonth.total)> — report due by the 7th`** line.
  - Uses the same `visibleBookings()` the tally already uses, so the admin installer-filter dropdown narrows the commission figure to one installer automatically.

## 5. Data flow

Roster load → server resolves per-completed-booking commission (price-sheet engine) → client `commissionTally` aggregates the scoped bookings → header renders the est. month total (+ pending), lifetime, and (admin) breakdown + last-month + due-7th.

## 6. Error handling / edge cases

- Ambiguous commission (`null`) → counted as **pending**, excluded from totals (honest).
- `9.2 Update` resolves to `$0` (a valid amount, not pending) via the engine's existing rule.
- No completed tunes this month → `est. $0 · 0 tunes` (or omit the line if zero — implementer's call, keep it visible for consistency).
- A booking with unparseable vehicle → `resolveCommission` returns `null` → pending (never throws).
- Roster commission is best-effort: a resolve failure is `null`, never blocking the roster.

## 7. Testing

- **`commission-tally.js`:** current-month sum + tunes + pending count; `null` excluded from totals but counted pending; `byInstaller` split; last-month sum incl. **January→December rollover**; lifetime sum; non-completed bookings ignored. Fixed `commission` values (no price sheet needed).
- **`installer-roster.js`:** a completed booking for a price-sheet-resolvable vehicle → `typeof commission === "number"`; a completed ambiguous vehicle → `null`; a non-completed booking → `null`. (Assert type/null, not a hardcoded amount, to stay robust to price-sheet edits — verify the resolvable case against the real template during build.)
- **Console:** header renders the est. line, pending, lifetime commission, and (admin) breakdown + last-month/due-7th — verified in-browser.
- Full suite green before ship.

## 8. Owner inputs / rollout
- **None.** No Airtable columns, no env — reads existing bookings through the existing commission engine. `installer.html` is `noindex` and `commission-tally.js` is a JS asset (not a page), so no `build:seo`.
- Rollout: build behind tests → `ship` (`npm test`, confirm branch, push, verify) → in-browser confirm the header shows the running month total, an installer sees only their own, and admin sees the roll-up + last-month/due-7th.
