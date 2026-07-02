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

| Stage | Function | Trigger | Recipients |
|-------|----------|---------|-----------|
| **1. Draft** | `ott-report.js` (scheduled) | 1st of month, for the month just closed | **Owner only** (`info@tunedyota.com`) — draft email + CSV + a private "Approve & send" link; Slack "awaiting approval" |
| **2. Review** | — | Owner opens the draft, checks the CSV | — |
| **3. Approve & send** | `ott-report-send.js` (HTTP, token-gated) | Owner clicks the approve link | **OTT:** `info@overlandtailor.com` + `hgobbels@me.com`, CC `info@tunedyota.com`; Slack "SENT (approved by owner)" |

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
