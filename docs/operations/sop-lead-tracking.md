# SOP 2 — Client Lead Tracking

**Owner:** Owner/Operator · **Cadence:** Daily review + weekly backlog sweep
**Goal:** Every inbound contact is captured, routed to the right installer, and followed up —
nothing falls through the cracks.

A "lead" is any interested person who is **not yet booked into an event slot**. Leads live on
the Airtable **Priority List** (the waitlist). A "booking" is a confirmed slot at a scheduled
event and lives in **Bookings**. This SOP covers capture and routing; conversion of the
waitlist is [SOP 5](sop-priority-waitlist.md).

---

## 1. Where leads come from

| Source | Path | Lands in |
|--------|------|----------|
| Website booking flow, no event in their city | `/find-your-exact-tune` → `book.js` | Priority List (`Reason: no-event`) |
| Website booking flow, event full | same | Priority List (`Reason: full`) |
| Website "Free OTT Update" / tune-finder form | Netlify form → `submission-created.js` | Installer email + auto-reply |
| **Walk-in / phone / DM / email** | **`/intake.html`** (staff) → `intake.js` | Bookings *or* Priority List |
| Post-event no-show / not completed | `event-reminders.js` sweep | Priority List (`Reason: Rebook — not completed`) |
| **OTT national leads (email)** | `inbox-sweep.js` auto-ingest → `/lead-ingest` | Priority List (`Source: ott-national`) |
| **Customer email inquiries / replies** | `inbox-sweep.js` → Gmail DRAFT in-thread | Gmail (Aaron reviews + sends) |

> **Live 2026-07-17 — Inbox Intelligence.** `inbox-sweep` (`netlify/functions/inbox-sweep.js`)
> runs every 15 minutes, queries `in:inbox newer_than:2d` for un-labeled messages, and routes
> each one automatically. OTT leads are ingested directly into the Priority List; customer
> emails get a NEPQ-governed reply draft saved in Gmail. See §7 for the daily review rhythm.

---

## 2. Staff intake form — `/intake.html`

Use this for **any lead that doesn't come through the website** (phone call, walk-in at an event,
Instagram DM, forwarded email).

1. Open `/intake.html`, enter the intake passcode (once; stored on the device).
2. Choose **Book** (they want a specific event slot) or **Lead** (no event yet / just interested).
3. Pick the **channel** (phone / walk-in / Instagram / Facebook / email / text / other) — this
   becomes the `Source` column so we can see which channels produce.
4. Fill name + phone/email + vehicle + goals + mods. Submit.

Behind the scenes (`intake.js`):
- **Book** → writes a **Bookings** record, `Status: Booked`, `Source: intake:<channel>`. Routed to the market's installer. **No customer email is sent** (staff-entered), so confirm details verbally.
- **Lead** → writes a **Priority List** record. If the city has no market match it's filed under **`Unassigned`** (no installer) so it's never lost — reassign later.

The form is **passcode-gated** and fails closed — a missing/wrong passcode returns 401.

---

## 3. Routing — market → installer

`routing.js` + `markets.js` map every city to an installer key (`aaron` / `noah` / `cody`);
unknown cities fall back to `aaron`. To change coverage, **use the [`update-routing`](../../.claude/skills/update-routing/SKILL.md)
skill** — it keeps the public booking page and the server-side routing in sync. Never edit one side only.

---

## 4. What's stored (Airtable)

**Bookings** columns: City, Event Date, Slot, Name, Phone, Email, Vehicle, Goals, Modifications,
Installer, Status, Source, UTM Source/Medium/Campaign, OTT Calibration, Calibration Date, VIN,
Certificate Sent, Email Status.

**Priority List** columns: City, Name, Phone, Email, Vehicle, Goals, Modifications, Installer,
Reason, Event Date, Requested Slot, Notified, Source, Stage, GHL Link.

> **Prerequisite — GHL Link column:** `inbox-sweep` stores the GHL Link from OTT emails via a
> tolerant write — the system works without it, but the link stays invisible in Airtable until
> you add a `GHL Link` column to the Priority List table. Add it once; no code change needed.

**Funnel Events** (analytics): Session, Step, Step Name, UTM fields — written by `track.js`
beacons, independent of the booking write (analytics never block a booking).

> **Resilience:** writes are *tolerant* — if an optional column is missing, the record still
> saves without that field (`createTolerant` / `updateTolerant`). A schema gap never drops a lead.

---

## 5. Lead stages (Qualified gate — live 2026-07-17)

Stages in `lib/leads.js` (`STAGES`): **New → Contacted → Qualified → Following up → Booked → Not now.**

**Qualified** is a new phase gate meaning location (routable market) AND vehicle are both known.
It maps to NEPQ Stage 2 (Situation) — the bar at which Tuned Yota has enough to route and price.

- **Auto-set on ingest:** `lead-ingest` sets Stage to `Qualified` when both `market` and `vehicle`
  arrive with the lead — the typical OTT lead arrives Qualified. All other sources enter as `New`.
- **Manual gate:** the installer console's stage buttons include Qualified; advance a lead when you
  collect their location and vehicle through the reply thread.
- **Active stages** (`ACTIVE_STAGES`): New, Contacted, Qualified, Following up. Only these appear
  on the live lead board; Booked and Not now are archived.
- **Unassigned bucket:** a lead whose city doesn't match any market still enters as `New` under
  the **Unassigned** installer. Advance the stage once location is confirmed.

---

## 6. OTT lead provenance chain (live 2026-07-17)

OTT (Overland Tailor Tuning) leads arrive via email; `inbox-sweep` ingests them as
`channel: ott-national`. The branding is preserved through the full lifecycle:

- **Priority List:** OTT leads show an **OTT badge** on their lead card in the console.
- **Conversion to booking:** `lead-update.js` stamps the booking `Source: lead:ott-national`
  (not the generic `lead:convert`). The OTT badge is visible on the booking row through close-out.
- **Monthly OTT report:** `ott-report.js` now includes a conversion line — OTT leads received /
  booked / completed — in both the owner-review DRAFT and the final report sent to OTT.
- **Unknown location:** OTT leads that arrive without a parseable city land in Unassigned; the
  OTT badge is still set so they're identifiable. Reassign once location arrives.

---

## 7. Daily / weekly routine

**Daily (3× inbox review — 8am / noon / 7pm CT):**

`inbox-digest` (`netlify/functions/inbox-digest.js`) runs at those times and sends Aaron an email
listing every `ty-drafted` Gmail thread that still has an unsent reply draft, plus a Slack
one-liner. Zero drafts = no digest noise. The review is:

1. **Gmail drafts** — open each thread flagged by the digest, read the draft, edit if needed, hit
   Send. Drafts are NEPQ-governed and voice-matched; they should rarely need heavy rewrites.
2. **Flagged items** — `ty-flagged` threads (sensitive emails: complaints, warranty/refund/legal,
   or low-confidence classifications) are Slacked to Aaron immediately, not just at digest time.
   Handle these first.
3. **New Priority List rows** — scan Airtable for leads ingested since the last review. Confirm
   Stage is set correctly; reassign any `Unassigned` leads to an installer.
4. **`Email Status = FAILED` bookings** — follow up manually.

**Weekly (auto):** `rebook-report.js` emails `info@` every **Monday ~8:00 AM Central** the full
outstanding Priority List backlog, grouped by location + installer. Work that list (SOP 5).

**Monthly (auto):** `submissions-report.js` emails the executive summary + `contacts.csv` on the
**1st**, and posts a Slack summary. `ott-report.js` sends the OTT conversion summary.

---

## 8. Definition of done

- [ ] Every lead has a source/channel recorded.
- [ ] No lead sits in `Unassigned` past the daily review.
- [ ] `Email Status = FAILED` rows are followed up.
- [ ] Weekly rebook report is actioned, not just received.
- [ ] Gmail drafts reviewed and sent (or discarded) at each of the 3 daily digest windows.
- [ ] No `ty-flagged` thread goes unread past the day it was flagged.

**Related:** [SOP 1 Marketing](sop-client-marketing.md) · [SOP 3 Booking](sop-event-booking.md) · [SOP 5 Priority Waitlist](sop-priority-waitlist.md)
