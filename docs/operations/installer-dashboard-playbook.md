# Installer Dashboard Playbook

**The everyday field manual for the Installer Console at `/installer.html`.**

**Audience:** Installers (Aaron, Noah, Cody) · **Companion to:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 6 Field Guide](sop-installer-field-guide.md)
**Grounded in:** `site/installer.html` + `installer-roster.js` · `installer-walkin.js` · `installer-closeout.js` · `amsoil-metrics.js` · `offline-queue.js` · `sw.js`

> The console is your **everyday operations hub**, not just an event-day tool. It handles
> scheduled events, walk-ins and call-ins on *any* day, close-out, certificates, customer
> sign-off, the OTT commission fields, your running commission tally, and (offline) a
> pending-sync queue — all from one phone/tablet screen. This playbook is the single source
> for how to run it. If the console and this doc ever disagree, the console wins — tell the Owner.

---

## 1. Getting in

### How to reach the console

- **Bookmark / Home Screen add** — go to **`/installer.html`** and add it to your Home Screen. It
  installs as its own app, opens straight to the console, and **works offline** (§6).
- **Homepage footer link** *(2026-07-17)* — a subtle **"Console"** link sits at the bottom of
  `tunedyota.com` (muted, `rel="nofollow"`). It's there as a fallback if you lose your bookmark;
  it won't appear in any search engine results (`installer.html` is `noindex`).
- **Native Tuned Yota app** — when the app ships, installers will live there full-time. The same
  `installer.html` code runs inside the app wrapper.

### Login — once per device

The gate is a proper login **`<form>`** (`id="gate"`). Your passcode is saved to `localStorage` under
the key `ty_installer_token` the first time you enter it, so **you won't retype it on return visits**.

1. First visit: enter **your personal installer passcode** and tap **Unlock**. The form uses
   `autocomplete="current-password"`, so **iOS Keychain and Google Password Manager can save it**
   *(2026-07-17)*. On a new device, a single tap fills it from your saved credentials.
2. On every return visit the saved token is found and the console unlocks automatically — you go
   straight to the feed.
3. If the console ever bounces you back to the passcode screen, your token was rejected — re-enter it.

**On the native app**, `nativeLock()` additionally prompts for **Face ID / fingerprint** on every
open, guarding the saved token. On the plain website that step is skipped automatically.

**Log out** (top-right) clears `ty_installer_token` — use it on a shared device. Don't log out with
items in the pending-sync queue (the console warns you).

> **Security:** the passcode gates all data server-side (fail-closed). If a device is ever lost,
> rotating that one installer's token locks it out immediately — see SOP 10.

> **After an update:** the installed app may show the previous version once, then load the new one on
> the next open. If something looks stale, fully close and reopen it.

### Turn on notifications (optional, recommended)

The console can **push notifications to your phone's browser** — a new booking in your market, your
day-of roster, a certificate stuck waiting on you, and (admins) the monthly OTT report deadline.

1. Tap **🔔 Enable notifications** in the top header → **Allow** when the browser asks.
2. The link becomes **🔔 Notifications on · Send test** — tap it once to confirm a test push lands.

**iPhone:** you must **Add the console to your Home Screen first**, then open it from that icon and
enable — iOS only delivers web push to a home-screen ("installed") app. **Android Chrome** works right
in the browser. Enable it **on each device** you want alerts on. If you don't see the **🔔** link at
all, notifications aren't switched on for the account — ask the Owner.

---

## 2. Reading the feed

The console opens on a **smart feed**: a sticky header up top, your work in priority order below.

### The header (always visible)
- **Tally:** `This month — X done · Y open · Z no-show` · your **estimated month commission** ·
  `Lifetime — N tunes ✓ · $ commission` · `Next: <city> · <when>`. Your running scoreboard, including
  the OTT commission your completed tunes have earned this month (from the price sheet) and lifetime.
  **Admins** also see a per-installer roll-up plus last month's total and the **due-by-the-7th** reminder.
- **Header links:** **Log out**, **🔔 notifications** (§1), **★ Ask for a review** (opens a full-screen
  Google-review QR for the customer to scan — appears only when the Owner has enabled it), and, for
  **admins**, **🛢 AMSOIL numbers** (§7).
- **⏳ N pending sync** appears here only when you have unsynced close-outs/walk-ins waiting to upload (§6).
- **Search box:** searches your history — name, VIN, vehicle, city, calibration, phone, Tuning Platform,
  Calibration Type. Results group by event, newest first. **The walk-in form stays available while you
  search.** Clear it (✕) to return to the feed.

  **Tab-scoped search *(2026-07-16)*:** when you're on a city sub-tab (see §4 Jobs), the search box
  filters **only that city's work**. A **"search all markets ›"** link appears next to the results
  header to jump to All and broaden the scope.

### The Jobs sub-tabs *(2026-07-15)*

Inside the Jobs view, a horizontal sub-tab strip sits above the feed:

| Tab | Shows |
|-----|-------|
| **All** | Every market, every open job |
| **`<City>`** *(one per market)* | Only that city's work; a red dot marks a market with an overdue close-out; a badge shows open count |
| **✓ Done** | Completed jobs pulled out of the active cards so they don't crowd the close-out UI |

Tap a city tab to focus on one market; tap **✓ Done** to review completed work. Past-dated jobs that
are still open display a loud **"not closed out — no cert yet"** flag to make stragglers obvious.

### The feed sections (top to bottom — Jobs tab)
1. **＋ Log a walk-in / call-in** — always first; opens the any-day walk-in form (§3).
2. **Needs close-out** *(amber)* — past events that still have open bookings. **Clear these first.**
3. **Today** — today's event(s).
4. **Upcoming** — future events, soonest first. The next one is expanded for you.
5. **Recent** — your last 5 completed events; **Show older** expands the rest. These cards also carry
   **+ Add walk-in**, so you can add a late arrival to an event you already closed out.

Each event is a tappable card labelled `<city>` + a relative date, with a **status pill**
(`3 done · 1 open · 1 no-show`). Inside, bookings are ordered **open first, then no-shows, then a
`✓ Done` group**. Your expand/collapse choices stick. Each booking card shows slot time, customer name
(walk-ins tagged `· walk-in`, unsynced ones `· ⏳ pending sync`), vehicle, phone, and modifications.
**Tundras show an amber flex-fuel reminder** (Policy 0011) — reset ethanol learning before you tune.

### OTT badge

Lead cards and booking rows show a dark blue **OTT** badge when the lead or booking originated from
an OTT national lead. It means the customer came through OTT's national marketing — their commission
flows through the OTT program for the full close-out lifecycle.

---

## 3. Walk-ins & call-ins — everyday, any day

Walk-ins are **everyday business**. A client can call or drop by on any day between events, and you log
them right here — no separate intake page. The form is **always reachable** (top of the feed, inside any
actionable event, and on Recent events), even while searching.

**Two ways in, same result:**

- **Any day →** the **＋ Log a walk-in / call-in** form at the top. Enter name, vehicle (include the
  year, e.g. `2021 Tundra`), phone, **customer email** (so their certificate can go straight to them),
  **date of the tune** (defaults to today), and **location/market**. Tap **Log walk-in**.
- **At a specific event →** open that event card and use **+ Add walk-in**.

**What happens:** a booking is created for that market and date, owned by the market's routed installer,
and it **appears in the feed immediately** with a green confirmation. From there it closes out like any
other booking → certificate + OTT report. The form stays open so you can log several in a row.

**Name and phone are required.** The date uses **your local (Central) time**, so an evening walk-in lands
on the correct day and OTT month. Offline, the walk-in is **queued and syncs when you reconnect** (§6).

> Only markets assigned to you accept a walk-in (admins can log to any market; it still routes to that
> market's owning installer). "That market isn't assigned to you" means check the location.

---

## 4. Closing out a vehicle

Do this on the booking card **after the calibration is written and road-verified.**

1. **VIN** — enter all **17 characters** (auto-uppercases). You **cannot** complete without a valid
   17-char VIN. Two capture aids are available inside the **📷 Scan VIN** overlay:
   - **Barcode auto-scan** — point at the door-jamb barcode and the console reads it automatically.
   - **● Capture VIN** shutter *(live 2026-07-16)* — tap the shutter to photograph a **printed VIN**
     (dash plate, door sticker, etc.). The photo is sent to `/.netlify/functions/vin-ocr`, which passes
     it to **Claude vision (Haiku)** and returns the reading. This is **advisory only**: any failure,
     low-confidence result, or API error falls back to manual entry — the camera **never blocks** a
     close-out.
   - **Manual entry** is always available as the fallback and the standard.
   The console **cross-checks the VIN** against the booking's year and make/model and shows an inline
   warning on a likely typo or mismatch — you can **acknowledge to override** if the VIN is correct
   (advisory, never a hard block). The photo is transient (OCR only, never stored).
2. **OTT Calibration** — pick what you **actually flashed**: Light · Mild · Medium · Spicy · SS, or an
   adjacent combo (Light and Mild · Mild and Medium · Medium and Spicy · Spicy and SS).
3. **OTT commission fields** (for the monthly report — never printed on the customer certificate):
   **Tuning Platform** (VFT / HPT / PCM / BB), **Calibration Type** (Basic, MAF, Supercharger, 9.2
   New/Update, TCM Update, Custom, K-Line, …), **ECU ID**, **Gear ratio** (e.g. 4.30), **Mileage**.
4. Tap **Mark complete**.
5. **Customer sign-off (optional):** a signature pad appears for the customer to sign on your device.
   It's **prompted but skippable** — signing is a record-only proof of service; tapping **Done** without
   a signature still completes the tune. It never blocks completion and never appears on the certificate.

**Then, automatically:**
- The booking is set **Completed** with the calibration, VIN, and OTT fields.
- **Calibration Date = the event/tune day** (not the day you close out) — so a late close-out still
  counts under the correct OTT month.
- The **Certificate of Calibration (v2)** is generated and, when a **customer email is on file, emailed
  straight to the customer** (a 2-page cert: the certificate + a per-vehicle AMSOIL fluids reference with
  an order QR). **No email on file?** It falls back to **you** (cc `info@`) to forward. Sending is
  **idempotent** — a double-tap never issues a second certificate.

> **VIN and calibration accuracy matter** — both print on the customer's certificate and report to OTT.
> Read the VIN off the vehicle; select the calibration you truly flashed. Wrong value? Tell the Owner
> immediately — it locks on the certificate.

---

## 5. No-shows

Customer didn't arrive? On their card, tick **"Customer didn't show — add to waitlist"**, then tap
**No-show**. The booking is set `No-show` and the overnight sweep moves it onto the **Priority List** as
a rebook (SOP 5) — a missed slot becomes a follow-up, not a lost customer.

---

## 6. Working offline & pending sync

The console is a **PWA** — the day's roster and the app shell are cached, so at a venue with thin or no
signal it still opens and shows your bookings.

- **Offline:** an amber **"⚠ Offline — showing your last synced roster"** banner appears. You can still
  read the feed and **close out / log walk-ins** — each action is **queued** with an optimistic update
  (the card flips to Completed / shows the walk-in, tagged **⏳ pending sync**).
- **Back online:** the queue **flushes automatically** (on reconnect, on next load, and via background
  sync where supported). The **⏳ N pending sync** header badge shows how many are waiting; tap it to
  flush now. Certificates send once the close-out syncs.
- **Slow server:** if the roster is taking too long, the console stops waiting and shows a **Retry**
  button (and falls back to your last synced roster if it has one) — tap **Retry** rather than sitting on
  a spinner.

> Don't log out with items still pending — the console warns you, because logging out would drop the
> unsynced queue. Reconnect and let it flush first.

---

## 7. Admin view (cross-installer)

If your key is an **admin** (env `INSTALLER_ADMINS` — currently Aaron), the console adds an
**"Admin — viewing"** dropdown and shows **every** installer's roster, walk-ins, and close-outs. Booking
cards display the owning installer. You can close out or log walk-ins on anyone's behalf — the
**certificate and any rebound waitlist still route to the owning installer**, so nothing is misattributed.

Admins also get:
- **Commission roll-up** in the header — per-installer month totals, last month, and the due-by-the-7th
  reminder.
- **🛢 AMSOIL numbers** — a funnel dashboard: total AMSOIL clicks (Shop vs Preferred-Customer), **clicks
  by source** (which vehicle/state page, certificate, or follow-up email drove them), the
  **certs → clicks → PC customers** funnel, a 14-day sparkline, and recent clicks. Use it to see which
  pages and touches actually convert.

Regular installers never see the admin dropdown or the AMSOIL panel.

---

## 8. Definition of done

**Per vehicle**
- [ ] Valid 17-char **VIN** entered (scanned or typed; mismatch warning cleared or acknowledged).
- [ ] Correct **OTT Calibration** selected (matches what was flashed).
- [ ] All five **OTT commission fields** filled.
- [ ] **Marked complete** (customer sign-off captured if offered) → certificate delivered to the customer.

**End of each event / day**
- [ ] Every attending customer **Completed**.
- [ ] Every absent customer **No-show**.
- [ ] Walk-ins/call-ins logged.
- [ ] **Needs close-out** section is empty — check each city sub-tab if working across markets.
- [ ] **✓ Done** sub-tab shows all vehicles; **⏳ pending sync** shows nothing (everything uploaded).

---

## 9. Troubleshooting

| Problem | Do this |
|---------|---------|
| Roster slow / stuck on "Loading…" | The console times out and shows **Retry** — tap it. Offline, it shows your last synced roster with a banner. |
| Console won't load the roster at all | Re-enter passcode; check signal. Persists → tell the Owner. |
| Bounced to the passcode screen | Token was rejected — re-enter your passcode. |
| **⏳ pending sync** won't clear | You're offline or the server rejected it. Reconnect; tap the badge to flush. Persists online → tell the Owner. |
| Walk-in rejected: "market isn't assigned to you" | You picked a market outside your routing. Check the location, or ask the Owner to update routing. |
| Walk-in rejected: "Enter a phone number / name" | Both name and phone are required. |
| VIN mismatch warning | Double-check the VIN against the vehicle. If it's right, **acknowledge to override** and continue. |
| Certificate didn't reach the customer | It goes to the customer's email when on file, else to you to forward. The daily backstop (`certificate-dispatch.js`, ~9 AM Central) resends once the calibration is set; tell the Owner if urgent. |
| Wrong calibration selected | Tell the Owner immediately — it locks on the certificate. |
| VIN barcode won't auto-scan | Tap **● Capture VIN** to photograph the printed VIN instead — Claude reads it and prefills the field. If that also fails, type it manually. Completion only needs a valid 17-char VIN. |
| VIN photo capture returns no result | The OCR is advisory — just type the VIN manually. The camera never blocks a close-out. |
| No **🔔 Enable notifications** / **★ review** / **🛢 AMSOIL** link | That feature isn't switched on for the account (or you're not an admin) — ask the Owner. |
| Enabled notifications but no test push | iPhone: open the console from its **Home Screen icon** (not Safari) and re-enable. Check the browser didn't block notifications. Re-tap **Send test**. |

---

**Related:** [SOP 4 Close-Out](sop-event-closeout.md) · [SOP 6 Field Guide](sop-installer-field-guide.md) ·
[SOP 5 Priority Waitlist](sop-priority-waitlist.md) · [SOP 9 Monthly OTT Report](sop-monthly-ott-report.md)
