# SOP 9 — Monthly OTT Calibration Report

**Owner:** Owner/Operator · **Cadence:** Monthly · **Status:** Monthly draft→approve flow LIVE; pricing + annual rollup pending the pricing sheet
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

Each completed booking carries everything needed, captured at close-out (SOP 4):

| Field | Source column |
|-------|---------------|
| Customer | `Name` |
| Vehicle | `Vehicle` |
| **VIN** | `VIN` *(17-char, captured at close-out)* |
| Calibration tier/combo | `OTT Calibration` |
| Calibration date | `Calibration Date` |
| Installer | `Installer` (→ name/region) |
| Certificate serial | derived: `TY-<year>-<record-id>` |

---

## 2. The monthly flow — draft → approve → send

The report is **never auto-sent to OTT**. The Owner approves first.

**Submission is due to OTT by the 7th of each month.** The draft lands on the 1st;
a reminder fires on the 5th if it still hasn't been submitted.

| Stage | Function | Trigger | Recipients |
|-------|----------|---------|-----------|
| **1. Draft** | `ott-report.js` (scheduled) | 1st of month, for the month just closed | **Owner only** (`info@tunedyota.com`) — draft email + `.xlsx` + a private "Approve & send" link; Slack "awaiting approval" |
| **2. Review** | — | Owner opens the draft, checks the workbook | — |
| **3. Reminder** | `ott-report-reminder.js` (scheduled) | **5th of month** (2 days before the deadline) | **Owner only** — re-surfaces the approve link + Slack "due by the 7th" if the month has calibrations |
| **4. Approve & send** | `ott-report-send.js` (HTTP, token-gated) | Owner clicks the approve link | **OTT:** `info@overlandtailor.com` + `hgobbels@me.com`, CC `info@tunedyota.com`; Slack "SENT (approved by owner)" |

- **Deadline: the 7th.** (Prior practice was the 10th; moved to the 7th 2026-07-10.)
- **`Calibration Date` = the event day, not the close-out day.** Close-out stamps the booking's Event Date so a late close-out still reports under the correct month. (Fixed 2026-07-10 — before this, June 28 installs closed out in July were landing on July's report.)
- The reminder is a deadline nudge; it fires whenever the month has calibrations, so ignore it if you've already submitted.
- The approve link carries a secret token (`OTT_APPROVE_SECRET`); a bad/missing token fails closed.
- Zero-calibration months draft nothing — just a Slack note.
- A send failure is surfaced (never reported as success), and nothing reaches OTT.
- Recipients are overridable via `OTT_REPORT_TO` (comma-separated) without a code change.

---

## 3. Annual rollup (private to Tuned Yota) — PENDING pricing sheet

Each month's completed calibrations roll into a **per-calendar-year** historical record, **owned
by Tuned Yota and private to `info@tunedyota.com`** — never sent to OTT. It tracks the year's
calibrations **and the cost Tuned Yota pays OTT per calibration** (totals by tier / installer /
month). This is built once the pricing sheet is loaded (below).

---

## 4. Pricing — PENDING

Tuned Yota pays OTT a price per calibration tier (Light / Mild / Medium / Spicy / SS + combos).
Those prices come from the Owner's pricing spreadsheet. Once loaded, a **price column + totals**
are added to the reports and the annual cost rollup is completed. Until then the reports list
calibrations without pricing.

---

## 5. Go-live checklist

- [x] Monthly draft→approve→send flow built + tested (235 tests green).
- [x] `OTT_APPROVE_SECRET` set in Netlify.
- [x] Recipients set to `info@overlandtailor.com` + `hgobbels@me.com` (CC `info@`).
- [ ] Pricing sheet loaded → price column + totals added.
- [ ] Annual private rollup built.

---

## 6. Definition of done (each month)

- [ ] Installers captured VIN + calibration for every completed vehicle (SOP 4).
- [ ] Draft reviewed by the Owner.
- [ ] Approved → sent to OTT; Slack confirms the send.
- [ ] Data also reflected in the private annual rollup.

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 2 Lead Tracking](sop-lead-tracking.md) · `netlify/functions/ott-report.js` · `ott-report-send.js`
