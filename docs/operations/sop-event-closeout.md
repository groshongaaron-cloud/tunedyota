# SOP 4 — Event Close-Out

**Owner:** Installer (per booking) · Owner (backstop) · **Cadence:** Every completed vehicle, at the event
**Goal:** Each finished vehicle is recorded accurately — **VIN + calibration** — so the certificate
is correct and the calibration is countable in the monthly OTT report.

Close-out happens on the **Installer Console** at **`/installer.html`** on a phone or tablet.
This is the single moment where the calibration and VIN are captured; get it right here and the
certificate and OTT report take care of themselves. The same flow applies to **everyday walk-ins /
call-ins**, not just scheduled events — see the [Installer Dashboard Playbook](installer-dashboard-playbook.md).

---

## 1. Before the event

1. Open `/installer.html`. The console gate is a login `<form>` — enter your passcode once; it's
   saved in `localStorage` (`ty_installer_token`) so the console auto-unlocks on every return visit.
   iOS Keychain / Google Password Manager can save and autofill it *(2026-07-17)*.
   On the native Tuned Yota app, biometric lock (Face ID / fingerprint, `nativeLock()`) additionally
   guards the saved token.
2. You see only **your** assigned events and bookings, grouped by city + date. Use the **Jobs
   sub-tabs** (All / city / ✓ Done) to focus on one market or review completed work *(2026-07-15)*.
3. Each booking card shows: slot time, name, vehicle, phone, and any modifications.
   An **OTT** badge (dark blue) marks bookings that originated from an OTT national lead.

---

## 2. Completing a vehicle

For each customer, after the calibration is written and road-verified:

1. On the booking card, enter the full **17-character VIN** (auto-uppercases; the console will not
   let you complete until a valid 17-char VIN is entered). The **📷 Scan VIN** overlay offers three
   capture paths:

   | Method | How |
   |--------|-----|
   | **Type it** | Always available; always the final fallback |
   | **Barcode auto-scan** | Point at the door-jamb or windshield barcode |
   | **● Capture VIN** shutter *(live 2026-07-16)* | Tap the shutter to photograph a printed VIN (dash plate, door sticker). The photo is sent to `/.netlify/functions/vin-ocr`; **Claude vision (Haiku)** reads it and prefills the field. **Advisory only** — any failure or low-confidence result falls back to manual entry. The photo is transient (OCR only, never stored). |

   The console **cross-checks the VIN** against the booking's year and make/model and warns on a
   likely typo/mismatch — verify, then **acknowledge to override** if the VIN is correct (advisory
   only, never a hard block). VIN accuracy matters: it prints on the customer's certificate and is
   reported to OTT.
2. Choose the **OTT Calibration** that was actually flashed:
   **Light · Mild · Medium · Spicy · SS**, or an adjacent combo
   (**Light and Mild · Mild and Medium · Medium and Spicy · Spicy and SS**).
3. Enter the **OTT commission fields** for the monthly report (SOP 9):
   **Tuning Platform, Calibration Type, ECU ID, Gear Size, Mileage**. These are stored on the
   booking for OTT reporting only — they never appear on the customer certificate.
4. Tap **Mark complete**.
5. **Customer sign-off (optional):** a signature pad appears for the customer to sign on your device.
   It's **prompted but skippable** — a record-only proof of service; tapping **Done** without a
   signature still completes the tune. It never blocks completion and never prints on the certificate.

What happens automatically (`installer-closeout.js`):
- The booking is set `Status: Completed`, with `OTT Calibration`, **VIN**, the OTT commission fields,
  and `Calibration Date` = **the event day** (the booking's `Event Date`, not the day you close out),
  so a late close-out still reports under the correct OTT month.
- The **Certificate of Calibration (v2)** is generated and, when a **customer email is on file, sent
  straight to the customer** — a 2-page cert (certificate + a per-vehicle AMSOIL fluids reference with
  an order QR), pre-filled with the customer, vehicle, exact model year, VIN, calibration, your
  name/region, and a unique serial (`TY-<year>-<id>`). **No email on file?** It falls back to **you**
  (CC `info@`) to forward. `Cert Delivery` records which path was used.
- Ownership is re-checked server-side — you can only close out **your own** bookings. **Admins**
  (env `INSTALLER_ADMINS`) may close out any installer's booking; the certificate and any waitlist
  rebook still route to the **owning** installer, so nothing is misattributed.
- **Offline?** The close-out (and any signature) is **queued** and syncs when you reconnect; the
  certificate sends once it syncs. See the [Playbook §6](installer-dashboard-playbook.md).

> **VIN accuracy matters.** It appears on the customer's certificate and is reported to OTT.
> Read it off the door jamb or dash plate; don't guess.

---

## 3. Delivering the certificate

When a **customer email is on file** (from booking or entered at walk-in), the certificate goes
**straight to the customer** — no action needed from you. Capturing the customer's email at booking or
walk-in is what makes this direct delivery happen, so get it whenever you can.

**Only if there's no email on file** does it come to **you** to forward:
1. Open the emailed `certificate.html` in a browser.
2. Confirm the details (especially calibration + VIN).
3. **Print → Save as PDF** (or forward the file) and send it to the customer.

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

- [ ] Valid 17-char **VIN** entered (mismatch warning cleared or acknowledged).
- [ ] Correct **OTT Calibration** selected (matches what was flashed).
- [ ] Customer **email** captured where possible (enables direct-to-customer delivery).
- [ ] **Marked complete** (sign-off captured if offered) → certificate delivered to the customer
  (or forwarded by you if no email was on file).

**Related:** [Installer Dashboard Playbook](installer-dashboard-playbook.md) · [SOP 6 Installer Field Guide](sop-installer-field-guide.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 9 Monthly OTT Report](sop-monthly-ott-report.md)
