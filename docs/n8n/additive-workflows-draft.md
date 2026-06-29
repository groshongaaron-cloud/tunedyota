# Tuned Yota — Additive n8n Workflows (DRAFT)

**Status:** BUILT 2026-06-29. Importable n8n Cloud JSON for all 3 workflows + the shared
error handler now lives in [`workflows/`](workflows/), and the §B `book.js` webhook ping
shipped (env-gated, dark until `N8N_BOOKING_WEBHOOK_URL` is set). Import + activation steps:
[SETUP.md](SETUP.md). The JSON was hand-authored (no live instance connected), so the owner
runs validate → verify → test → activate on import. See [[n8n-integration-open-action]].

## Design principles (locked)

1. **Additive & fire-and-forget.** The booking critical path stays exactly as-is —
   `book.js` → routing → Airtable → Resend → Slack-on-failure. n8n only *adds* new
   automation that doesn't exist today. If n8n is down, booking is unaffected.
2. **Don't reroute the working path.** We are NOT moving Airtable/Resend into n8n. The
   only proposed code change is a single, non-blocking, env-gated webhook ping (§B, opt-in).
3. **Best-effort, observable.** Every workflow has an Error Trigger → Slack so a silent
   n8n failure still surfaces in the same `#alerts` channel the site already uses.
4. **Brand-safe copy.** All customer-facing text follows the locked guardrails
   (no "free", no "Stage 2/3", no "MAF", turbo = "Turbo Performance Calibration",
   emissions-intact). See [[brand-rules-locked]].

---

## A. How n8n gets the data — two ingestion options

| | **Option 1 — Webhook (recommended for real-time)** | **Option 2 — Airtable poll (zero code change)** |
|---|---|---|
| Trigger | n8n **Webhook** node; `book.js` POSTs each booking | n8n **Schedule** node (e.g. every 10 min) → Airtable **search** |
| Latency | Instant | Up to one poll interval |
| Code change | ~5 non-blocking lines in `book.js` (§B), env-gated | None |
| Best for | New-booking owner notification (Workflow 1) | Review requests, digests (Workflows 2–3) |
| Dedupe | N/A (one event = one POST) | Needs a window or an Airtable flag column |

**Recommendation:** use the **webhook** for the real-time new-booking ping (Workflow 1),
and **schedule + Airtable** for the batch workflows (2 & 3) which don't need real-time and
benefit from reading the source of truth. This is the minimal-footprint split.

---

## B. The one proposed code change (optional, safe, env-gated)

Only needed for the real-time webhook variant of Workflow 1. It's a fire-and-forget POST
that **never throws into the booking flow** and is a **no-op unless `N8N_BOOKING_WEBHOOK_URL`
is set** — so it ships dark and you flip it on by setting the env var.

```js
// netlify/functions/lib/n8n.js  (NEW)
async function pingN8n({ fetchImpl = fetch, url, payload, log = console }) {
  if (!url) return;                         // no-op until the env var is set
  try {
    await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) { if (log.error) log.error("n8n ping", e.message); } // swallow — never break booking
}
module.exports = { pingN8n };
```

```js
// in book.js processBooking(), right before `return { status: "booked", ... }`:
await pingN8n({ fetchImpl, url: env.N8N_BOOKING_WEBHOOK_URL, log, payload: {
  event: "booking", status: "booked",
  name: d.name, email: d.email || "", phone: d.phone || "",
  vehicle: d.vehicle || "", goals: d.goals || "", mods: d.mods || "",
  city: market.city, state: market.state, slot: d.slot,
  eventDateISO: event.dateISO, eventLabel: event.label,
  installer: { key: inst.key, name: inst.name, email: inst.email, phone: inst.phone },
  source: d.source || "find-your-exact-tune",
  utm: { source: d.utm_source || "", medium: d.utm_medium || "", campaign: d.utm_campaign || "" },
  emailFailed,
}});
```

> I'll only add this when you say go — it's listed here so the webhook design is concrete.
> Until then, Workflow 1 can run off Option 2 (Airtable poll) with zero code change.

---

## Credentials to create in n8n (once)

- **Airtable Personal Access Token** — the rotated data-scoped PAT (base `appMYG0QlSZTCYxUU`,
  tables `Bookings` + `Priority List`). *(Create a separate n8n credential; don't reuse the
  Netlify env value by hand.)*
- **Resend API key** — for sending the review-request emails (or use n8n's SMTP/Email node
  pointed at Resend SMTP). From address must stay `events@send.tunedyota.events`.
- **Slack Incoming Webhook** — the same `#alerts` webhook, or a new one for a `#bookings`
  channel if you'd rather separate positive notifications from failure alerts.

---

## Workflow 1 — New Booking → Owner Notification

**Why:** today Slack only fires on email *failure*. This adds the positive "you got a
booking" ping (Slack + optional owner email) the second it happens.

**Trigger:** Webhook (POST, path `ty-booking`) — receives the §B payload.
*(Alt: Schedule every 10 min → Airtable Search `Bookings` where `Status="Booked"` and
`Created` ≥ last run.)*

**Nodes:**
1. **Webhook** — `httpMethod: POST`, `path: ty-booking`, `responseMode: lastNode`.
2. **Set** ("normalize") — map fields (remember webhook data is under `{{$json.body}}`):
   - `name = {{$json.body.name}}`, `city = {{$json.body.city}}`,
     `vehicle = {{$json.body.vehicle}}`, `slot = {{$json.body.slot}}`,
     `installer = {{$json.body.installer.name}}`, `event = {{$json.body.eventLabel}}`,
     `contact = {{$json.body.phone || $json.body.email}}`,
     `utm = {{$json.body.utm.source}} / {{$json.body.utm.campaign}}`.
3. **Slack** ("post #bookings") — `text`:
   ```
   :checkered_flag: New booking — {{$json.name}} · {{$json.city}}
   {{$json.vehicle}} · {{$json.slot}} on {{$json.event}}
   Installer: {{$json.installer}} · {{$json.contact}}
   Source: {{$json.utm}}
   ```
4. *(optional)* **Email** — short owner heads-up to `info@tunedyota.com` with the same fields.
5. **IF** `{{$json.body.emailFailed}}` is true → extra Slack note ("customer confirmation
   email failed — follow up manually"). Complements the existing failure alert.

**Error handling:** attach the shared **Error Trigger → Slack** workflow (§ shared).

---

## Workflow 2 — Post-Event Review Request + Referral

**Why:** no follow-up exists today. After an event, ask happy customers for a Google review
and to send a friend our way. Highest-ROI owned-channel automation.

**Trigger:** Schedule — daily 10:00 America/Chicago.

**Nodes:**
1. **Schedule Trigger** — `cronExpression: 0 15 * * *` (15:00 UTC ≈ 10:00 CDT; or use the
   timezone field). *(n8n schedules are UTC unless the workflow timezone is set — set it to
   America/Chicago to be DST-safe, matching `lib/central-time.js`.)*
2. **Airtable — Search** `Bookings`:
   - `filterByFormula`:
     `AND({Status}="Completed", {Email}!="", {Review Requested}!=TRUE(), IS_AFTER(TODAY(), {Event Date}), DATETIME_DIFF(TODAY(), {Event Date}, 'days') <= 7)`
   - *(Needs a new **`Review Requested`** checkbox column on `Bookings` — owner adds, like
     the Modifications column. Without it, swap to a strict 2-days-after-event date window so
     each booking matches on exactly one day and won't repeat.)*
3. **IF** "any results" — stop if empty.
4. **Loop (SplitInBatches, batchSize 1)** over matched bookings → per customer:
   - **Email (Resend)** from `events@send.tunedyota.events`, replyTo `info@tunedyota.com`:
     - Subject: `How's your {{$json.fields.Vehicle}} driving?`
     - Body (brand-safe): thank them, ask for a Google review (link), invite them to send a
       friend our way to Find Your Exact Tune. *No "free" language.*
   - **Airtable — Update** that record → set `Review Requested = true` (the dedupe stamp).
5. **Done → Slack** summary: "Sent N review requests."

**Owner inputs:** Google review link (GBP "write a review" short link — comes out of the GBP
setup you're prioritizing), and the `Review Requested` checkbox column.

---

## Workflow 3 — Weekly Booking Digest

**Why:** give the owner a once-a-week pulse (bookings, by city/installer, new Priority List
leads) without opening Airtable.

**Trigger:** Schedule — Monday 07:00 America/Chicago (`0 12 * * 1` UTC ≈ 07:00 CDT).

**Nodes:**
1. **Schedule Trigger** (timezone America/Chicago).
2. **Airtable — Search** `Bookings`, `filterByFormula`:
   `AND({Status}="Booked", DATETIME_DIFF(TODAY(), CREATED_TIME(), 'days') <= 7)`.
3. **Airtable — Search** `Priority List` (new leads in last 7 days), same date window.
4. **Code (Run Once for All Items)** — aggregate: total bookings, breakdown by `City` and by
   `Installer`, count of new Priority List entries, top UTM source. Build an HTML table.
5. **Email** to `info@tunedyota.com` — "Tuned Yota weekly digest — week of {{date}}".
6. *(optional)* **Slack** one-line summary to `#bookings`.

> This overlaps a little with the existing **monthly** `submissions-report.js` exec summary —
> intentionally: weekly = operational pulse, monthly = the formal summary. If you'd rather
> not double up, we run digest bi-weekly or fold it in. Your call when we build.

---

## Shared — Error Trigger → Slack (one workflow, reused)

A standalone workflow with an **Error Trigger** node → **Slack** ("post #alerts"):
```
:rotating_light: n8n workflow failed — {{$json.workflow.name}}
Node: {{$json.execution.lastNodeExecuted}}
{{$json.execution.error.message}}
```
Set this as the **Error Workflow** in each workflow's settings so any unhandled failure
posts to the same channel the site already alerts to. (See the n8n error-handling skill.)

---

## Build order when we go live

1. You provide: n8n URL + API key (Cloud or self-hosted), and confirm Option 1 vs 2 for
   Workflow 1.
2. I create the 3 credentials in n8n, build the **Shared Error workflow** first.
3. Build **Workflow 1** (start here — smallest, highest signal), validate → test with a
   sample payload → activate.
4. Build **Workflow 3** (digest — read-only, safe to test), then **Workflow 2** (review
   requests — has real send side-effects, so we test against a single safe record first).
5. For Workflow 1 webhook variant: add the §B `book.js` ping, set `N8N_BOOKING_WEBHOOK_URL`,
   redeploy, confirm a live test booking pings n8n.

**Owner to-dos that unblock these:** n8n URL/key · Workflow-1 option choice ·
`Review Requested` checkbox column · Google review link (from GBP setup).
