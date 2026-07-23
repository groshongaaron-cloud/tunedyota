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

1. Go to **`/installer.html`** — bookmark it, or use the muted **"Console"** link in the
   `tunedyota.com` footer *(2026-07-17)*.
2. Enter your personal **installer passcode** and tap **Unlock**. The gate is a proper login form
   (`autocomplete="current-password"`), so **iOS Keychain / Google Password Manager can save and
   autofill it** *(2026-07-17)* — on a new device it's a single tap. The passcode is stored in
   `localStorage` as `ty_installer_token`; on every return visit the console unlocks automatically.
3. Keep the passcode private — it scopes the console to **your** bookings only, enforced server-side.
4. If the console ever returns you to the passcode screen, your token was rejected — re-enter it.
5. **On the native Tuned Yota app:** `nativeLock()` prompts for **Face ID / fingerprint** on every
   open, additionally guarding the saved token. On the plain browser that step is skipped.
6. **Log out** clears the saved token — use it on a shared device; don't log out with pending syncs.
7. **Turn on notifications (recommended):** tap **🔔 Enable notifications** in the header → **Allow** →
   **Send test** to confirm. You'll get a push for new bookings, your day-of roster, and any
   certificate waiting on you. **iPhone:** Add the console to your Home Screen first and open it from
   that icon (iOS only pushes to a home-screen app); Android Chrome works in-browser. Enable on each
   device. No **🔔** link? Notifications aren't switched on for the account yet — ask the Owner.
   Full detail: [Playbook §1](installer-dashboard-playbook.md).

---

## 2. Reading the feed

The console opens on a **smart feed** with a sticky header and your work in priority order:

- **Header:** a **tally** (this month done/open/no-show · lifetime tunes · next event) and a
  **search box** (name, VIN, vehicle, city, calibration, phone, platform, type). Search scopes to the
  active city sub-tab *(2026-07-16)*; a "search all markets ›" link appears when scoped. Clear with ✕.
- **Jobs sub-tabs *(2026-07-15)*:** a horizontal strip above the feed — **All**, one tab per city
  (red dot = overdue close-out; badge = open count), and **✓ Done** (completed work pulled out of the
  active cards). Use city tabs to focus on one market; **✓ Done** to review completed work.
- **Feed sections (Jobs tab):** **＋ Log a walk-in / call-in** → **Needs close-out** (clear these
  first) → **Today** → **Upcoming** → **Recent**.
- Each **event card** is grouped by **city + date** with a status pill (`3 done · 1 open`); inside,
  bookings run open → no-show → `✓ Done`. Your expand/collapse choices stick.
- Each **booking card**: slot, name (walk-ins tagged `· walk-in`), vehicle, phone, modifications.
  Tundras show an amber **flex-fuel** reminder (Policy 0011). An **OTT** badge (dark blue) marks
  bookings and leads that originated from an OTT national lead.

You also receive **roster emails automatically** at 30 / 15 / 10 / 2 / 0 days before each event
(from `event-reminders.js`), including that city's waitlist — but the **console is the live source**.

Full walkthrough: [Installer Dashboard Playbook §2](installer-dashboard-playbook.md).

---

## 3. The close-out flow (per vehicle)

> Enter **VIN (17 chars)** → pick **OTT Calibration** → fill the **OTT fields** → **Mark complete** →
> **customer signs (optional)** → certificate goes **straight to the customer**.

- **VIN is required and validated** — you can't complete without a full 17-character VIN. Three ways
  to get it:
  1. **Type it** — always available, always the fallback.
  2. **Barcode auto-scan** — point the phone at the door-jamb barcode in the **📷 Scan VIN** overlay.
  3. **● Capture VIN** shutter *(live 2026-07-16)* — tap the shutter to photograph a printed VIN
     (dash plate, door sticker). The photo goes to `/.netlify/functions/vin-ocr`; Claude vision
     (Haiku) reads it and prefills the field. **Advisory only** — any failure falls back to manual
     entry. The photo is transient (OCR only, never stored).
  The console **warns on a VIN/year/make mismatch**; verify, then **acknowledge to override** if correct.
- Pick the calibration you **actually flashed** (single tier or adjacent combo); fill the five OTT
  commission fields (platform, type, ECU ID, gear, mileage).
- After **Mark complete**, a **signature pad** appears for the customer — optional, skippable, never
  blocks completion.
- The certificate is **sent directly to the customer** when their email is on file (a 2-page cert with
  an AMSOIL fluids reference). No email on file → it comes to **you** to forward.
- Missed customer → **No-show** (it becomes a rebook automatically).
- **Offline:** the close-out queues and syncs on reconnect; the certificate sends once it syncs.

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
| Roster slow / stuck on "Loading…" | The console times out and shows **Retry** — tap it. Offline, it shows your last synced roster with a banner. |
| Console won't load the roster at all | Re-enter passcode; check signal. Escalate to Owner if it persists. |
| **⏳ pending sync** won't clear | Reconnect and tap the badge to flush. Persists online → tell the Owner. Don't log out with items pending. |
| VIN mismatch warning | Re-check the VIN against the vehicle; if right, **acknowledge to override**. |
| VIN barcode won't scan | Tap **● Capture VIN** to photograph the printed VIN — Claude reads it. If that fails too, type it manually. The camera never blocks a close-out. |
| A booking isn't yours but should be | Contact the Owner — routing may need updating (`update-routing`). |
| Certificate didn't reach the customer | Goes to the customer's email when on file, else to you to forward. The daily backstop resends once calibration is set; tell the Owner if urgent. |
| Wrong calibration selected | Tell the Owner immediately — the value locks on the certificate. |

---

## 6. Definition of done (end of event)

- [ ] Every attending customer marked **Completed** with VIN + calibration.
- [ ] Every absent customer marked **No-show**.
- [ ] All certificates delivered to customers (direct, or forwarded where no email was on file).
- [ ] Walk-ins/call-ins logged on the console.
- [ ] **Needs close-out** section is empty and **⏳ pending sync** shows nothing (all uploaded).

**Related:** [Installer Dashboard Playbook](installer-dashboard-playbook.md) · [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 3 Booking](sop-event-booking.md)

---

## 7. PCM flash protocol selection (OTT Protocol Selection Guide, transcribed 2026-07-22)

Source of truth: `Dropbox/Overland Tailor 3rd Party Calibrators/Instructions/Protocol
Selection Guide.pdf`. The console day view and the roster email show each booking's
protocol automatically (the 🔧 PCM line / PCM Flash column) — this table is the
reference behind that, and the fallback if you're working off paper.

| Vehicle | Years | PCM Flash | Bitbox | Software | Max throttle to start |
|---|---|---|---|---|---|
| Tacoma 2.7L | 2005–2015 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| Tacoma 4.0L | 2005–2015 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild |
| Tacoma 3.5L | 2016–2023 | **[46]** | FID 27 | PCM Flash (Tactrix) | lite/medium AT · mild MT |
| Tacoma 2.7L | 2016–2023 | **[46]** | FID 28 | PCM Flash (Tactrix) | medium |
| Tacoma 2.4L-T | 2024+ | **[95]** | — | VFTuner (WiFlash) | enhanced |
| 4Runner | 2003–2004 | **[35] K-Line** | — | PCM Flash (Tactrix), K-Line | medium |
| 4Runner | 2005–2009 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild |
| 4Runner 4.0L/4.7L | 2010–2019 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild |
| 4Runner 4.0L | 2020–2024 | **[46]** | FID 28 | PCM Flash (Tactrix) | mild |
| 4Runner 2.4L-T | 2025+ | **[95]** | — | VFTuner (WiFlash) | enhanced |
| FJ Cruiser 4.0L | 2007–2014 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild |
| Tundra 4.0L | 2007–2013 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| Tundra 4.7L | 2005–2009 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| Tundra 5.7L | 2007–2017 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild/medium |
| Tundra 4.6L | 2018–2019 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| Tundra 5.7L | 2018–2021 | **[46]** | FID 28 | PCM Flash (Tactrix) | mild/medium |
| Tundra 3.5T HV (V35A) | 2022+ | **[95]** | — | VFTuner (WiFlash) | TBD |
| Sequoia 4.7L | 2006–2009 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| Sequoia 5.7L | 2008–2017 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild/medium |
| Sequoia 4.6L | (4.6 years) | **[35]** | FID 24 | PCM Flash (Tactrix) | mild/medium |
| Sequoia 5.7L | 2018–2022 | **[46]** | FID 28 | PCM Flash (Tactrix) | mild/medium |
| Sequoia 3.5T HV | 2023+ | **[95]** | — | VFTuner (WiFlash) | TBD |
| Land Cruiser / LX470 4.7L | 2006–2007 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild/medium |
| Land Cruiser / LX570 5.7L | 2008–2015 | **[35]** | FID 24 | PCM Flash (Tactrix) | mild/medium |
| Land Cruiser / LX570 5.7L | 2016–2021 | **[46]** | FID 28 | PCM Flash (Tactrix) | mild/medium |
| LC 250 2.4L-T | 2024+ | **[95]** | — | VFTuner (WiFlash) | enhanced |
| GX470 | 2003–2004 | **[35] K-Line** | — | PCM Flash (Tactrix), K-Line | medium |
| GX470 | 2005–2009 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| GX460 | 2010–2024 | **[35]** | FID 24 | PCM Flash (Tactrix) | medium |
| GX550 | 2022+ | **[95]** | — | VFTuner (WiFlash) | TBD |

**Handling notes (these surface automatically on the itinerary when they apply):**

- **2013–2019 4Runner:** the TCM must be flashed **separately** from the PCM.
- **[95] Gen-4 turbo platforms** (2022+ Tundra/Sequoia/GX550, 2024+ Tacoma/LC 250,
  2025+ 4Runner): **ECU direct-connect cable required.** If the VFT file isn't
  available, read the ECU with PCM Flash (Tactrix) and place the file into Dropbox.
- **2003–2004 4Runner/GX470 (K-Line):** CUW takes ~45 minutes; TCU flashed separately.
- VFT module names: [35] = Toyota Gen 1 496k/736k/992k CAN · [46] = Toyota Gen 2
  1.5/2.0 MB CAN ([46] FID 27 = P5-CAN, FID 28 = CAN-bus) · [95] = Toyota Gen 4
  3.5L/2.4L Turbo (P5-UDS).
- If the console shows "confirm engine" (booking didn't capture displacement), check
  the engine on-site before choosing between the listed protocols.
