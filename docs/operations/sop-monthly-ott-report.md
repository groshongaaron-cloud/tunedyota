# SOP 9 — Monthly OTT Calibration Report

**Owner:** Owner/Operator · **Cadence:** Monthly · **Status:** Data pipeline live; auto-report build pending
**Goal:** Report every completed OTT calibration to OTT once a month, accurately and without manual
data assembly.

---

## 1. What gets reported

Every **completed calibration** performed at a Tuned Yota event. The source is the Airtable
**Bookings** table, filtered to:

```
Status = "Completed"
AND OTT Calibration is set
AND Calibration Date within the report month
```

Each completed booking now carries everything OTT needs, captured at close-out (SOP 4):

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

## 2. Current state of the pipeline

- ✅ **VIN capture** is live (installer console → Bookings → certificate), shipped 2026-07-02.
- ✅ **Airtable `VIN` column** exists on Bookings.
- ⏳ **The automated monthly report** is not yet built. Two inputs are needed before building:
  1. **OTT contact email** the report should be sent to.
  2. **Confirmed columns/format** OTT wants (see the field list above as the proposed default).

---

## 3. Planned automation (fits existing infrastructure)

The report will be a **scheduled Netlify function**, a sibling of `submissions-report.js`
(which already runs monthly on the 1st and emails `info@` + posts Slack). The new function will:

1. Run on the **1st of each month** for the prior month.
2. Query Bookings with the filter above (`listAllRecords` handles paging).
3. Build a **CSV** (one row per completed calibration) + a short summary.
4. **Email it to the OTT contact** via Resend (from `send.tunedyota.events`), CC `info@`.
5. Post a Slack confirmation via the `/notify` relay.
6. Reuse existing libs: `airtable.js`, `resend.js`, `routing.js` (installer name/region), `certificate.js` (`certSerial`).

Delivery method chosen by the Owner: **email to an OTT contact.**

---

## 4. Interim manual procedure (until the function ships)

1. In Airtable Bookings, filter: `Status = Completed` and `Calibration Date` in the target month.
2. Export those rows (Name, Vehicle, VIN, OTT Calibration, Calibration Date, Installer).
3. Email the export to the OTT contact; keep a copy for records.

---

## 5. Definition of done

- [ ] Installers captured VIN + calibration for every completed vehicle (SOP 4).
- [ ] Report covers exactly the month's completed calibrations.
- [ ] Sent to the OTT contact with a retained copy.
- [ ] (When automated) function runs on the 1st and posts a Slack confirmation.

**To build the automation, provide:** the OTT contact email + confirmation of the required columns.

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 2 Lead Tracking](sop-lead-tracking.md) · `netlify/functions/submissions-report.js` (pattern)
</content>
