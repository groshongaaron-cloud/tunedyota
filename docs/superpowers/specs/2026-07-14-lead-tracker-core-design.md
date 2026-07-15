# Multi-Channel Lead Tracker — Core — Design Spec

**Date:** 2026-07-14 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project #1 (Core)** of the Multi-Channel Lead Tracking program.

---

## 1. Program context

Incoming clients arrive from five channels — **Google email, Facebook, Instagram, text message, phone calls** — and become future clients. Today they're captured only partially (staff `intake.js` → Priority List) and **nothing reads them back**, so leads aren't tracked to conversion. The goal is one place, **inside the Tuned Yota app**, to track every incoming client from first touch to booked.

**Decomposition (agreed):** a shared **Core** (this spec) plus per-channel **adapters**, built in feasibility order:

1. **Core lead tracker** (this spec) — pipeline in the app + a normalized `lead-ingest` write path. Usable day one via manual quick-log; blocks on nothing.
2. **Email adapter** (Gmail / Google Workspace `info@`) — auto-capture; small owner OAuth step.
3. **SMS + Calls adapter** (Twilio) — **approved**. One Twilio number, **612‑406‑7117 ported from T‑Mobile** (a port is required to auto-capture the number's *texts*; it keeps the number identical). Forwards calls to personal cells: Aaron, Cody, Noah (numbers held in secure Netlify config, **not** committed). Budget ~$40/mo (generous — realistic spend $15–30). Ported-number caveat: it leaves the T‑Mobile eSIM, so calls forward to the personal cells above.
4. **Facebook / Instagram adapter** — Lead Ads + DMs (comments = later); gated by Meta app review (owner).

Each adapter is its own spec → plan → build. **This spec covers only the Core.** Adapters are out of scope here except that the Core's `lead-ingest` endpoint is designed as the single interface they will all call.

## 2. Goal

A **Leads** view in the installer console (the app) where each incoming client is tracked through a pipeline (**New → Contacted → Following up → Booked → Not now**), scoped so installers work their own markets and the owner sees everyone plus an Unassigned bucket. Every source writes through one normalized `lead-ingest` endpoint that **dedupes a person across channels into one lead**. Follow-ups are reminded via web push. A lead converts to a booking in one tap, leaving a conversion trail.

## 3. Scope

**In:** pipeline fields on the existing Priority List table; a normalized `lead-ingest` write path with cross-channel dedupe; a manual **+ Log a lead** quick-form; a `Jobs · Leads` toggle + Leads list UI (grouped by stage, filters, per-lead actions, activity log); `leads-list` (scoped read) and `lead-update` (stage / log-contact / follow-up / reassign / convert) endpoints; a morning follow-up sweep that web-pushes due leads to the assigned installer; one-tap convert-to-booking that links the created Booking back to the lead; a small admin summary (leads by channel, conversion rate, open-needing-follow-up).

**Out:** the channel adapters themselves (#2–#4); in-app two-way texting (arrives with the Twilio adapter — the Core uses `tel:`/`sms:`/`mailto:` deep links); automatic lead scoring/AI triage; multi-user simultaneous-edit conflict resolution beyond last-write; a separate desktop/kanban layout (mobile-first list only); email/SMS *sending* from the tracker beyond device deep links.

## 4. Data model — extend the Priority List table

The Core adds a pipeline layer to the **existing** `Priority List` table (Airtable) so channel leads and rebook candidates live together. New columns:

| Column | Type | Notes |
|---|---|---|
| **Stage** | Single select | `New` · `Contacted` · `Following up` · `Booked` · `Not now`. Default `New`. |
| **Channel** | Single select | `email` · `facebook` · `instagram` · `sms` · `phone` · `walk-in` · `other`. Normalized from `Source`. |
| **Next Follow-up** | Date | Drives the reminder sweep. Optional per lead. |
| **Last Contact** | Date | Bumped on every logged contact / dedupe touch. |
| **Activity Log** | Long text | Append-only, newest-last, timestamped lines (channel touches, stage changes, notes). |
| **Converted Booking** | Single line text | The Bookings record id this lead became (set on convert). Blank until Booked. |

Reused as-is: `Name`, `Phone`, `Email`, `City`, `Vehicle`, `Goals`, `Modifications`, `Installer`, `Source`, `Created Time`, `Last Modified`, `Reason`, `Model Year`.

**Backfill:** a one-time normalization derives `Channel` from the existing `Source`/`Reason` (`intake:facebook`→`facebook`, `installer:walk-in`→`walk-in`, rebook rows with no source→`other`) and sets `Stage=New` on rows that have none. Idempotent (skips rows already staged).

## 5. Components

Pure logic lives in testable libs (mirrors `installer-walkin.js` / `offline-queue.js`); Netlify functions are thin wrappers.

### 5.1 `lib/leads.js` — pure logic
- `normalizeChannel(source, reason)` → one of the seven channel values.
- `normalizePhone(p)` → last-10-digits key for dedupe; `normalizeEmail(e)` → lowercased/trimmed.
- `processLeadIngest(body, deps)` — validate, dedupe, upsert (see 5.2). Returns `{status, recordId, deduped}`.
- `scopeLeads(leads, {key, admin, filter})` — apply visibility (own-market / all / unassigned).
- `applyLeadUpdate(lead, action, payload)` — compute the field changes for stage/log-contact/follow-up/reassign; returns the patch + the new Activity Log line.
- `dueLeads(leads, todayISO)` — active leads with `Next Follow-up <= today`, grouped by installer.

### 5.2 `lead-ingest` (POST) — the single write path
- **Auth:** installer token (`x-installer-token`, from the manual UI) **or** an internal adapter secret (`x-ty-task` = `INTERNAL_TASK_SECRET`, for server-to-server adapters). Fail closed.
- **Body (normalized, all adapters use this):** `{ name, phone?, email?, channel, city?, vehicle?, goals?, message?, source? }`. Requires `name` and at least one of `phone`/`email`.
- **Dedupe:** look up existing leads by normalized phone **or** email. If a match is in an **active** stage (`New`/`Contacted`/`Following up`), **append** a `message`/touch line to its Activity Log + bump `Last Contact` (do not duplicate). If the only match is **terminal** (`Booked`/`Not now`), a new inquiry is a genuinely new opportunity → **create a new lead**. No match → create.
- **Assign:** `getMarket(city)` → market's installer; unknown/blank city → `City="Unassigned"`, blank `Installer`.
- Writes via `createTolerant` (tolerates a not-yet-added column). Returns `{status:"lead", recordId, deduped:bool}`.

### 5.3 `leads-list` (GET) — scoped read
- Auth: installer token. Returns leads scoped by `scopeLeads`: a regular installer sees leads whose `Installer` = them; **admin** sees all, and the `Unassigned` bucket, with an optional `?installer=` / `?scope=unassigned` filter (mirrors the roster's admin filter). Includes derived `overdue` + a light per-stage/per-channel summary for the admin panel.

### 5.4 `lead-update` (POST) — mutate one lead
- Auth: installer token. **Ownership enforced** — a regular installer may only update leads in their own markets; admin may update any (and reassign across markets). Actions:
  - `setStage` → new Stage (+ log line).
  - `logContact` → bump `Last Contact`, append note.
  - `setFollowup` → set/clear `Next Follow-up`.
  - `reassign` (admin) → change `City`/`Installer` (to/from Unassigned).
  - `convert` → create a Booking (reuse `intake.js`/`book` create path) prefilled from the lead; on success write `Converted Booking` = booking id, set `Stage=Booked`, append a conversion line. Requires city + a resolvable event/slot **or** a walk-in date (same validation as the walk-in path).

### 5.5 UI — Leads view in `installer.html`
- **`Jobs · Leads` segmented toggle** at the top of the console; state persists in `STATE`. Same auth/session.
- **Leads list:** sticky search (name/phone/vehicle) + filter chips (Stage, Channel, and for admin Mine/All/Unassigned). **Grouped by stage** (collapsible, counts), overdue follow-ups floated to the top of each group with a red flag. Card: name · vehicle · channel icon · market · last-contact/next-follow-up · latest-note snippet.
- **Card actions:** Call/Text/Email (`tel:`/`sms:`/`mailto:`), Log contact, Set follow-up (Today/Tomorrow/+3d/+1wk), Move stage, Convert to booking, Reassign (admin), and the Activity Log timeline.
- **+ Log a lead** button (mirrors the walk-in quick-form): name, phone/email, channel, city (free-text + datalist of known markets — same pattern as the fixed walk-in city field), vehicle, note → `lead-ingest`.
- **Badge:** the Leads toggle shows a count of due/overdue leads.

### 5.6 Follow-up sweep
- A scheduled run (extend the existing reminders/cron infra) each morning (Central) calls `dueLeads`, groups by installer, and sends a **web push** (reuse the C3 push path): "⏰ N leads to follow up today," deep-linking to the Leads view filtered to due. Admin gets a roll-up. No-op safely when push isn't configured.

## 6. Data flow

```
channel/adapter OR manual "+ Log a lead"
        → POST lead-ingest (normalize + dedupe + assign)
        → Priority List row (Stage=New)
Leads view: GET leads-list (scoped) → grouped pipeline
Installer works it: POST lead-update (stage / contact / follow-up)
Morning sweep: dueLeads → web push to assigned installer
Convert: lead-update(convert) → Bookings row + Converted Booking link + Stage=Booked
```

## 7. Auth & permissions
- Manual UI + reads/updates: installer token (`x-installer-token`), same as the roster/close-out/walk-in endpoints; `isAdmin` unlocks all-markets + Unassigned + reassign.
- Server-to-server adapters (#2–#4): `INTERNAL_TASK_SECRET` via `x-ty-task` on `lead-ingest` only.
- Ownership on `lead-update` is enforced server-side by market routing (a regular installer cannot touch another market's lead), mirroring `installer-walkin.js`.

## 8. Error handling
- `lead-ingest`: missing name+contact → 400 `missing-contact`; store failure → 502 `store-unavailable` (adapters can retry). Dedupe lookup failure (e.g., column missing) is swallowed → falls through to create (never lose a lead).
- `lead-update`: not-your-market → 400; convert with no resolvable event/slot → 409 `conflict` (returns open slots), same contract as the walk-in/intake path.
- UI: optimistic where safe; surfaces a loud error on failure; never silently drops an action. (The Core is online-only for lead actions; offline queueing is a later enhancement, not in scope.)

## 9. Testing
- **Unit (`lib/leads.js`):** channel normalization table; phone/email dedupe keys; `processLeadIngest` — create, active-match append, terminal-match new-lead, unknown-city→Unassigned; `scopeLeads` — installer vs admin vs unassigned; `applyLeadUpdate` — each action's patch + log line; ownership rejection; `dueLeads` selection + grouping; convert validation.
- **Endpoint:** `lead-ingest` auth (token vs task-secret vs reject), `lead-update` ownership + convert conflict.
- **Browser (Playwright, skips without a browser — mirrors `installer-walkin-browser.test.mjs`):** Jobs↔Leads toggle; log a lead → appears in New; move stage; set follow-up; overdue float + badge; convert-to-booking links back.
- Full `node --test` green before ship; ship via the `ship` skill (no SEO inputs touched).

## 10. Owner setup
- Add the **six Priority List columns** in §4. Either the owner adds them, or (preferred, per [[airtable-metadata-api]]) I create them via an ephemeral schema-scoped PAT routed through the clipboard, then write-test and clear.
- No new secrets for the Core. (`INTERNAL_TASK_SECRET` already exists; it only gates future adapters.)

## 11. Out of scope / future
- Channel adapters #2–#4 (own specs).
- In-app two-way texting (Twilio adapter).
- Offline queueing of lead actions (parity with the walk-in queue) — revisit if installers work leads in the field with thin signal.
- Richer analytics (time-in-stage, source ROI) beyond the light summary.

Related: [[funnel-roadmap-and-lead-setup]], [[event-reminders-automation]], [[certificate-v2-dashboard-program]], [[installer-console-access]], [[tunedyota-app-program]], [[airtable-metadata-api]].
