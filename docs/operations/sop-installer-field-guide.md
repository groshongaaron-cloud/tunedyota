# SOP 6 — Installer Field Guide

**Owner:** Installer · **Cadence:** Every event day
**Goal:** Run your event cleanly from the console — roster in, calibration done, VIN + calibration
recorded, certificate delivered.

This is the installer's day-of companion to [SOP 4 Close-Out](sop-event-closeout.md).

---

## 1. Setup (once per device)

1. Go to **`/installer.html`**.
2. Enter your personal **installer passcode**. It's stored on the device — you won't re-enter it
   each time. Keep the passcode private; it scopes the console to **your** bookings only.
3. If the console ever returns you to the passcode screen, your token was rejected — re-enter it.

---

## 2. Reading your roster

- The console lists **your upcoming events**, grouped by **city + date**, sorted by slot time.
- Each card = one customer: slot, name, vehicle, phone, and modifications.
- Already-handled cards show **✓ Completed** (with calibration + VIN) or **No-show**.

You also receive **roster emails automatically** at 30 / 15 / 10 / 2 / 0 days before each event
(from `event-reminders.js`), including that city's waitlist — but the **console is the live source**
on the day.

---

## 3. The close-out flow (per vehicle)

> Enter **VIN (17 chars)** → pick **OTT Calibration** → **Mark complete** → certificate emails to you.

- VIN is **required and validated** — you can't complete without a full 17-character VIN.
- Pick the calibration you **actually flashed** (single tier or adjacent combo).
- The certificate arrives in your inbox; open it, confirm, **Print → Save as PDF**, send to the customer.
- Missed customer → **No-show** (it becomes a rebook automatically).

Full detail + the backstop behavior: [SOP 4](sop-event-closeout.md).

---

## 4. Walk-ins at the event

Someone shows up without a booking?

1. Open the **+ Add a walk-in (intake form)** link on the console (goes to `/intake.html`).
2. Enter the intake passcode, choose **Book** (if a slot's open) or **Lead**, pick channel **walk-in**.
3. Fill their details and submit. If you booked them, they'll appear on your roster to close out.

---

## 5. If something's wrong

| Problem | Do this |
|---------|---------|
| Console won't load the roster | Re-enter passcode; check signal. Escalate to Owner if it persists. |
| A booking isn't yours but should be | Contact the Owner — routing may need updating (`update-routing`). |
| Certificate email didn't arrive | The daily backstop will resend once calibration is set; tell the Owner if urgent. |
| Wrong calibration selected | Tell the Owner immediately — the value locks on the certificate. |

---

## 6. Definition of done (end of event)

- [ ] Every attending customer marked **Completed** with VIN + calibration.
- [ ] Every absent customer marked **No-show**.
- [ ] All certificates delivered to customers.
- [ ] Walk-ins recorded via intake.

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 3 Booking](sop-event-booking.md)
</content>
