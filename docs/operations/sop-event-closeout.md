# SOP 4 — Event Close-Out

**Owner:** Installer (per booking) · Owner (backstop) · **Cadence:** Every completed vehicle, at the event
**Goal:** Each finished vehicle is recorded accurately — **VIN + calibration** — so the certificate
is correct and the calibration is countable in the monthly OTT report.

Close-out happens on the **Installer Console** at **`/installer.html`** on a phone or tablet.
This is the single moment where the calibration and VIN are captured; get it right here and the
certificate and OTT report take care of themselves.

---

## 1. Before the event

1. Open `/installer.html`, enter **your** installer passcode (once per device; stored locally).
2. You see only **your** assigned events and bookings, grouped by city + date.
3. Each booking card shows: slot time, name, vehicle, phone, and any modifications.

---

## 2. Completing a vehicle

For each customer, after the calibration is written and road-verified:

1. On the booking card, enter the **VIN** — the full **17 characters** (auto-uppercases;
   the console will not let you complete until a valid 17-char VIN is entered).
2. Choose the **OTT Calibration** that was actually flashed:
   **Light · Mild · Medium · Spicy · SS**, or an adjacent combo
   (**Light and Mild · Mild and Medium · Medium and Spicy · Spicy and SS**).
3. Enter the **OTT commission fields** for the monthly report (SOP 9):
   **Tuning Platform, Calibration Type, ECU ID, Gear Size, Mileage**. These are stored on the
   booking for OTT reporting only — they never appear on the customer certificate.
4. Tap **Mark complete**.

What happens automatically (`installer-closeout.js`):
- The booking is set `Status: Completed`, with `OTT Calibration`, **VIN**, the OTT commission fields,
  and `Calibration Date` = **the event day** (the booking's `Event Date`, not the day you close out),
  so a late close-out still reports under the correct OTT month.
- The **Certificate of Calibration** is generated and **emailed to you immediately** (CC `info@`)
  as `certificate.html`, pre-filled with the customer, vehicle, VIN, calibration, your name/region,
  and a unique serial (`TY-<year>-<id>`). The vehicle line shows the customer's **exact model year**
  (captured at booking), and "Date Calibrated" is the event day.
- Ownership is re-checked server-side — you can only close out **your own** bookings.

> **VIN accuracy matters.** It appears on the customer's certificate and is reported to OTT.
> Read it off the door jamb or dash plate; don't guess.

---

## 3. Delivering the certificate

1. Open the emailed `certificate.html` in a browser.
2. Confirm the details (especially calibration + VIN).
3. **Print → Save as PDF** and send it to the customer.

The calibration and VIN are **locked** once issued (static text, no dropdown) — the record can't
silently drift after the fact.

---

## 4. No-shows

If a customer doesn't arrive, tap **No-show**. The booking is set `Status: No-show`. The overnight
sweep (`event-reminders.js`, +1 day) moves no-shows and not-completed bookings onto the **Priority
List** as a rebook (SOP 5) — so a missed appointment becomes a follow-up, not a lost customer.

---

## 5. Owner backstop (automatic)

`certificate-dispatch.js` runs **daily (~9:00 AM Central)** and finds any `Completed` booking whose
certificate wasn't sent:
- If the calibration is recorded → it sends the certificate and marks `Certificate Sent`.
- If the calibration is **blank** → it **holds** the certificate (won't send a blank one) and posts
  a Slack alert listing who's waiting. **Fix:** set the OTT Calibration on that booking; the next
  daily run releases it.

Idempotent: a certificate is never sent twice.

---

## 6. Definition of done (per vehicle)

- [ ] Valid 17-char **VIN** entered.
- [ ] Correct **OTT Calibration** selected (matches what was flashed).
- [ ] **Marked complete** → certificate received.
- [ ] Certificate PDF sent to the customer.

**Related:** [SOP 6 Installer Field Guide](sop-installer-field-guide.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 9 Monthly OTT Report](sop-monthly-ott-report.md)
