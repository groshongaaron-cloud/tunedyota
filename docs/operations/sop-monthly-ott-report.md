# SOP 9 — Monthly OTT Commission Report

**Owner:** Owner/Operator · **Cadence:** Monthly (**due to OTT by the 7th**) · **Status:** LIVE — draft → review console → approve/send, commissions auto-priced from the OTT price sheet with a manual override, a deadline reminder, and the private annual rollup are all in production.
**Goal:** Report every completed OTT calibration to OTT once a month — **only after the Owner
reviews and approves** — and roll the same data into a private annual record for Tuned Yota.

---

## 1. What gets reported

Every **completed calibration** performed at a Tuned Yota event. Source is the Airtable
**Bookings** table, filtered to:

```
Status = "Completed"
AND OTT Calibration is set
AND Calibration Date within the report month
```

Each completed booking carries everything the 14-column submission needs. Most is captured at
close-out (SOP 4); vehicle basics are derived from the booking; commission is priced automatically.

| Submission column | Source |
|-------------------|--------|
| Customer | `Name` |
| VIN | `VIN` *(17-char, captured at close-out)* |
| Vehicle Type / Engine Size | derived from `Vehicle` text |
| **Vehicle Year** | `Model Year` (exact year captured at booking); falls back to the `Vehicle` text's range-start for legacy rows |
| Date Calibration Applied | `Calibration Date` — **the event day** (see note below) |
| Tuning Platform · Calibration Type · ECU ID · Gear Size · Mileage | installer-entered at close-out |
| **Commission** | auto-resolved from the OTT price sheet; **`Commission Override`** wins when the Owner sets one (§3) |
| Installer | `Installer` (→ name/region) |

> **`Calibration Date` = the event day, not the close-out day.** Close-out stamps the booking's
> `Event Date`, so a late close-out (e.g. a June 28 event closed out in July) still reports under
> the correct month. (Fixed 2026-07-10 — before this, late close-outs landed on the wrong month.)

---

## 2. The monthly flow — draft → review → approve → send

The report is **never auto-sent to OTT**. The Owner reviews and approves first.
**Submission is due to OTT by the 7th.** The draft lands on the 1st; a reminder fires on the 5th
if it still hasn't been submitted.

| Stage | Function | Trigger | Recipients |
|-------|----------|---------|-----------|
| **1. Draft** | `ott-report.js` (scheduled) | 1st of month, for the month just closed | **Owner only** (`info@`) — draft email + `.xlsx` + a private **review** link; Slack "awaiting approval" |
| **2. Review** | `ott-report-review.js` (HTTP, token-gated) | Owner opens the review console any time (§3) | Owner only — read, edit commissions, download, send |
| **3. Reminder** | `ott-report-reminder.js` (scheduled) | **5th of month** (2 days before the deadline) | **Owner only** — re-surfaces the review link + Slack "due by the 7th" if the month has calibrations |
| **4. Approve & send** | `ott-report-send.js` (HTTP, token-gated) | Owner clicks **Finalize & Send** on the console | **OTT:** `info@overlandtailor.com` + `hgobbels@me.com`, CC `info@`; Slack "SENT (approved by owner)" |

- **Deadline: the 7th.** (Prior practice was the 10th; moved to the 7th 2026-07-10.)
- The reminder is a deadline nudge; it fires whenever the month has calibrations, so ignore it if
  you've already submitted.
- Every link carries a secret token (`OTT_APPROVE_SECRET`); a bad/missing token fails closed.
- Zero-calibration months draft nothing — just a Slack note.
- A send failure is surfaced (never reported as success), and nothing reaches OTT.
- Recipients are overridable via `OTT_REPORT_TO` (comma-separated) without a code change.

---

## 3. The always-on review console (`ott-report-review.js`)

Open the token-gated **OTT Commission Report** page any time — bookmark the review link (defaults
to the prior reporting month; `?month=YYYY-MM` to switch). It shows two sections:

- **① Completed calibrations = the submission.** Commission auto-fills from the price sheet and is
  **editable per row**. Type in / correct any amount — rows the lookup couldn't resolve (e.g. VFT
  "9.2 New", bench BB, superchargers) start blank and are flagged red. Click **Save**; the amounts
  persist to the booking's **`Commission Override`** column and win over the auto amount everywhere
  (the workbook download, the send, and the monthly draft). A real **$0** is honored; clearing a
  field removes the override.
- **② Overdue / incomplete bookings.** Past events not yet closed out by the installer, grouped by
  installer/territory with days-overdue — the **chase list**. Informational; never submitted.

Then **Download Excel** (the exact `.xlsx`) or **Finalize & Send to OTT** (owner-approved send).

- **Setup: DONE.** The **`Commission Override`** (Number) field exists on the Airtable Bookings
  table — added and verified end-to-end 2026-07-10 (save + clear round-trip through the live site).
- The metadata API can't create Airtable fields (the Netlify token lacks schema scope), so any
  future column is a manual add; the console degrades gracefully and tells you if a field is missing.

---

## 4. Pricing — auto from the OTT price sheet + manual override

The commission engine (`lib/ott-commission.js`) resolves the **OTT Commission** per calibration from
the April 2026 OTT price sheet (`lib/ott-commission-template.json`), matching vehicle type / year /
engine / tuning platform / calibration type. Anything the sheet can't map (owner-confirmed cal types,
superchargers, bench BB) is left blank and the Owner enters it on the review console (§3), saved as
`Commission Override`. The exact model year captured at booking feeds this match, not just the
platform range.

---

## 5. Annual rollup (private to Tuned Yota) — LIVE

Each year's completed calibrations roll into a **per-calendar-year** record, **owned by Tuned Yota
and private to `info@tunedyota.com`** — never sent to OTT. It totals the **cost Tuned Yota pays OTT**
(by tier / installer / vehicle type / tuning platform / calibration type, plus a detail list).

- `ott-annual.js` — **scheduled Jan 1** for the prior year; emails `info@` only.
- `ott-annual-run.js` — **on-demand** (token-gated HTTP: `?year=YYYY&token=OTT_APPROVE_SECRET`) for
  the current YTD or any year.

---

## 6. Status checklist

- [x] Monthly draft → review → approve → send flow, built + tested.
- [x] `OTT_APPROVE_SECRET` set in Netlify; recipients `info@overlandtailor.com` + `hgobbels@me.com` (CC `info@`).
- [x] Commissions auto-priced from the OTT price sheet + editable `Commission Override` (column live).
- [x] Deadline reminder (5th) + 7th submission deadline.
- [x] Private annual rollup (scheduled Jan 1 + on-demand).
- [x] 415 tests green.

---

## 7. Definition of done (each month)

- [ ] Installers captured VIN + calibration + OTT fields for every completed vehicle (SOP 4).
- [ ] Owner opened the **review console**, filled/confirmed every commission (no red rows).
- [ ] Approved → **Finalize & Send** to OTT by the 7th; Slack confirms the send.
- [ ] Overdue/incomplete list worked — installers chased to close out stragglers.

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 2 Lead Tracking](sop-lead-tracking.md) · `netlify/functions/ott-report.js` · `ott-report-review.js` · `ott-report-reminder.js` · `ott-report-send.js` · `ott-annual.js` · [OTT format spec](../ott/README.md)
