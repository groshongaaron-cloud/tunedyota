# Installer Dashboard Playbook

**The everyday field manual for the Installer Console at `/installer.html`.**

**Audience:** Installers (Aaron, Noah, Cody) · **Companion to:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 6 Field Guide](sop-installer-field-guide.md)
**Grounded in:** `site/installer.html` + `installer-roster.js` · `installer-walkin.js` · `installer-closeout.js`

> The console is now your **everyday operations hub**, not just an event-day tool. It handles
> scheduled events, walk-ins and call-ins on *any* day, close-out, certificates, and the OTT
> commission fields — all from one phone/tablet screen. This playbook is the single source for
> how to run it. If the console and this doc ever disagree, the console wins — tell the Owner.

---

## 1. Getting in

1. Open **`/installer.html`** on your phone or tablet (add it to your home screen).
2. Enter **your personal installer passcode**. It's stored on the device, so you won't retype it
   each visit. Keep it private — it scopes the console to **your** bookings only.
3. If the console ever bounces you back to the passcode screen, your token was rejected — re-enter it.

**On the native app** it also asks for **Face ID / fingerprint** on open. On the plain website that
step is skipped automatically.

**Log out** (top-right) clears the passcode from the device — use it on a shared or borrowed device.

### Turn on notifications (optional, recommended)

The console can **push notifications straight to your phone's browser** — a new booking in your
market, your day-of roster, a certificate stuck waiting on you, and (admins) the monthly OTT report
deadline. You don't need the native app for this.

1. Tap **🔔 Enable notifications** in the top header.
2. Your browser asks permission — tap **Allow**.
3. You'll see *"Notifications enabled on this device."* The link becomes **🔔 Notifications on ·
   Send test** — tap it once to fire a test push and confirm it lands.

**iPhone:** you must **Add the console to your Home Screen first** (Share → Add to Home Screen), then
open it from that icon and enable — iOS only delivers web push to a home-screen ("installed") app.
**Android Chrome** works right in the browser.

Enable it **on each device** you want alerts on. Notifications are informational — you still run
everything from the feed; a missed push never loses a booking. If you don't see the **🔔** link at
all, notifications aren't switched on for the account yet — ask the Owner.

---

## 2. Reading the feed

The console opens on a **smart feed**. Up top, a sticky header; below it, your work in priority order.

### The header (always visible)
- **Tally:** `This month — X done · Y open · Z no-show` · `Lifetime — N tunes ✓` · `Next: <city> · <when>`.
  Your running scoreboard for the month plus your lifetime completed-tune count.
- **Search box:** searches **all of your history** — name, VIN, vehicle, city, calibration, phone,
  Tuning Platform, Calibration Type. Results are grouped by event, newest first. Use it to pull up a
  past customer, confirm a VIN, or find a specific tune. Clear it (✕) to return to the feed.

### The feed sections (top to bottom)
1. **＋ Log a walk-in / call-in** — always first; opens the any-day walk-in form (see §3).
2. **Needs close-out** *(amber)* — past events that still have open bookings. **Clear these first.**
3. **Today** — today's event(s).
4. **Upcoming** — future events, soonest first. The next one is expanded for you.
5. **Recent** — your last 5 completed events; **Show older** expands the rest.

Each event is a card you tap to expand/collapse, labelled `<city>` + a relative date (Today /
Tomorrow / in N days / Mon D). Its **status pill** summarizes it at a glance:
`3 done · 1 open · 1 no-show`. Inside, bookings are ordered **open first, then no-shows, then a
`✓ Done` group**. Your expand/collapse choices stick — closing out a vehicle never collapses your place.

Each booking card shows slot time, customer name (walk-ins are tagged `· walk-in`), vehicle, phone,
and any modifications. **Tundras show an amber flex-fuel reminder** (Policy 0011) — reset ethanol
learning before you tune.

---

## 3. Walk-ins & call-ins — everyday, any day

Walk-ins are **everyday business**, not just an event thing. A client can call or drop by on any day
between events, and you log them right here — no separate intake page.

**Two ways in, same result:**

- **Any day →** the **＋ Log a walk-in / call-in** form at the top of the feed. Enter
  name, vehicle (include the year, e.g. `2021 Tundra`), phone, **date of the tune** (defaults to
  today), and **location/market** (pick from your markets). Tap **Log walk-in**.
- **At a specific event →** open that event card and use **+ Add walk-in** (name / vehicle / phone).

**What happens:** a booking is created for that market and date, owned by the market's routed
installer, and it **appears in the feed immediately** with a green confirmation. From there it closes
out exactly like any other booking → certificate + OTT report. The form stays open so you can log
several in a row.

**Name and phone are required.** The date uses **your local (Central) time**, so an evening walk-in
lands on the correct day and the correct OTT month — not rolled into tomorrow.

> Only markets assigned to you will accept a walk-in (admins can log to any market; it still routes to
> that market's owning installer). "That market isn't assigned to you" means check the location.

---

## 4. Closing out a vehicle

Do this on the booking card **after the calibration is written and road-verified.**

1. **VIN** — enter all **17 characters** (auto-uppercases). Tap **📷 Scan VIN** to read the barcode
   off the door jamb or windshield instead of typing. You **cannot** complete without a valid 17-char VIN.
2. **OTT Calibration** — pick what you **actually flashed**: Light · Mild · Medium · Spicy · SS, or an
   adjacent combo (Light and Mild · Mild and Medium · Medium and Spicy · Spicy and SS).
3. **OTT commission fields** (for the monthly report — never printed on the customer certificate):
   **Tuning Platform** (VFT / HPT / PCM / BB), **Calibration Type** (Basic, MAF, Supercharger, 9.2
   New/Update, TCM Update, Custom, K-Line, …), **ECU ID**, **Gear ratio** (e.g. 4.30), **Mileage**.
   All five are required to complete.
4. Tap **Mark complete**.

**Then, automatically:**
- The booking is set **Completed** with the calibration, VIN, and OTT fields.
- **Calibration Date = the event/tune day** (not the day you close out) — so a late close-out still
  counts under the correct OTT month.
- The **Certificate of Calibration** is generated and **emailed to you immediately** (cc `info@`) as
  `certificate.html`, pre-filled with customer, exact model year, VIN, calibration, your name/region,
  and a unique serial. Sending is **idempotent** — a double-tap never issues a second certificate.

**Deliver it:** open the emailed `certificate.html`, confirm the details (calibration + VIN),
**Print → Save as PDF**, and send it to the customer. Values are **locked** once issued.

> **VIN and calibration accuracy matter** — both print on the customer's certificate and report to
> OTT. Read the VIN off the vehicle; select the calibration you truly flashed. Wrong value? Tell the
> Owner immediately — it locks on the certificate.

---

## 5. No-shows

Customer didn't arrive? On their card, tick **"Customer didn't show — add to waitlist"**, then tap
**No-show**. The booking is set `No-show` and the overnight sweep moves it onto the **Priority List**
as a rebook (SOP 5) — a missed slot becomes a follow-up, not a lost customer.

---

## 6. Admin view (cross-installer)

If your key is an **admin** (env `INSTALLER_ADMINS` — currently Aaron), the console adds an
**"Admin — viewing"** dropdown and shows **every** installer's roster, walk-ins, and close-outs.
Booking cards display the owning installer. You can close out or log walk-ins on anyone's behalf —
the **certificate and any rebound waitlist still route to the owning installer**, so nothing is
misattributed. Use the dropdown to filter to one installer. Regular installers never see this.

---

## 7. Definition of done

**Per vehicle**
- [ ] Valid 17-char **VIN** entered (scanned or typed).
- [ ] Correct **OTT Calibration** selected (matches what was flashed).
- [ ] All five **OTT commission fields** filled.
- [ ] **Marked complete** → certificate received → **PDF sent to the customer**.

**End of each event / day**
- [ ] Every attending customer **Completed**.
- [ ] Every absent customer **No-show**.
- [ ] Walk-ins/call-ins logged.
- [ ] **Needs close-out** section is empty.

---

## 8. Troubleshooting

| Problem | Do this |
|---------|---------|
| Console won't load the roster | Re-enter passcode; check signal. Persists → tell the Owner. |
| Bounced to the passcode screen | Token was rejected — re-enter your passcode. |
| Walk-in rejected: "market isn't assigned to you" | You picked a market outside your routing. Check the location, or ask the Owner to update routing. |
| Walk-in rejected: "Enter a phone number / name" | Both name and phone are required. |
| A booking isn't yours but should be | Contact the Owner — routing may need updating (`update-routing`). |
| Certificate email didn't arrive | The daily backstop (`certificate-dispatch.js`, ~9 AM Central) resends once the calibration is set; tell the Owner if urgent. |
| Wrong calibration selected | Tell the Owner immediately — it locks on the certificate. |
| VIN won't scan | Type it manually — completion only needs a valid 17-char VIN. |
| No **🔔 Enable notifications** link | Notifications aren't switched on for the account yet — ask the Owner. |
| Enabled notifications but no test push | iPhone: open the console from its **Home Screen icon** (not Safari) and re-enable. Check the browser didn't block notifications. Re-tap **Send test**. |

---

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 6 Field Guide](sop-installer-field-guide.md) ·
[SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 9 Monthly OTT Report](sop-monthly-ott-report.md)
