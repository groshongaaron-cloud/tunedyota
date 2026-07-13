# SOP 6 — Installer Field Guide

**Owner:** Installer · **Cadence:** Every event day + everyday walk-ins
**Goal:** Run your work cleanly from the console — roster in, calibration done, VIN + calibration
recorded, certificate delivered — at events and for any-day walk-ins.

This is the installer's quick day-of companion. The **full field manual** — feed, search, admin view,
VIN scan, and everyday walk-ins — lives in the
[**Installer Dashboard Playbook**](installer-dashboard-playbook.md). Deeper close-out detail is in
[SOP 4 Close-Out](sop-event-closeout.md).

---

## 1. Setup (once per device)

1. Go to **`/installer.html`**.
2. Enter your personal **installer passcode**. It's stored on the device — you won't re-enter it
   each time. Keep the passcode private; it scopes the console to **your** bookings only.
3. If the console ever returns you to the passcode screen, your token was rejected — re-enter it.
4. **Turn on notifications (recommended):** tap **🔔 Enable notifications** in the header → **Allow** →
   **Send test** to confirm. You'll get a push for new bookings, your day-of roster, and any
   certificate waiting on you. **iPhone:** Add the console to your Home Screen first and open it from
   that icon (iOS only pushes to a home-screen app); Android Chrome works in-browser. Enable on each
   device. No **🔔** link? Notifications aren't switched on for the account yet — ask the Owner.
   Full detail: [Playbook §1](installer-dashboard-playbook.md).

---

## 2. Reading the feed

The console opens on a **smart feed** with a sticky header and your work in priority order:

- **Header:** a **tally** (this month done/open/no-show · lifetime tunes · next event) and an
  **all-history search** (name, VIN, vehicle, city, calibration, phone, platform, type).
- **Feed sections:** **＋ Log a walk-in / call-in** → **Needs close-out** (clear these first) →
  **Today** → **Upcoming** → **Recent**.
- Each **event card** is grouped by **city + date** with a status pill (`3 done · 1 open`); inside,
  bookings run open → no-show → `✓ Done`. Your expand/collapse choices stick.
- Each **booking card**: slot, name (walk-ins tagged `· walk-in`), vehicle, phone, modifications.
  Tundras show an amber **flex-fuel** reminder (Policy 0011).

You also receive **roster emails automatically** at 30 / 15 / 10 / 2 / 0 days before each event
(from `event-reminders.js`), including that city's waitlist — but the **console is the live source**.

Full walkthrough: [Installer Dashboard Playbook §2](installer-dashboard-playbook.md).

---

## 3. The close-out flow (per vehicle)

> Enter **VIN (17 chars)** → pick **OTT Calibration** → **Mark complete** → certificate emails to you.

- VIN is **required and validated** — you can't complete without a full 17-character VIN.
- Pick the calibration you **actually flashed** (single tier or adjacent combo).
- The certificate arrives in your inbox; open it, confirm, **Print → Save as PDF**, send to the customer.
- Missed customer → **No-show** (it becomes a rebook automatically).

Full detail + the backstop behavior: [SOP 4](sop-event-closeout.md).

---

## 4. Walk-ins & call-ins (any day)

Walk-ins are **everyday business** — logged **on the console itself**, no separate intake page.

- **Any day:** use **＋ Log a walk-in / call-in** at the top of the feed — name, vehicle (with year),
  phone, date (defaults to today), and market.
- **At an event:** open the event card and tap **+ Add walk-in**.

The booking appears in the feed immediately and closes out like any other → certificate + OTT report.
Name and phone are required; the date uses your **local (Central)** time so evening walk-ins bucket
into the right day/OTT month. Full detail: [Playbook §3](installer-dashboard-playbook.md).

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
- [ ] Walk-ins/call-ins logged on the console.
- [ ] **Needs close-out** section is empty.

**Related:** [Installer Dashboard Playbook](installer-dashboard-playbook.md) · [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 3 Booking](sop-event-booking.md)
