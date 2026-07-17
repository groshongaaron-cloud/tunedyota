# Tuned Yota n8n — Import & Setup Guide

Four importable workflows live in [`workflows/`](workflows/). They are **additive and
fire-and-forget**: the booking critical path in `book.js` is unchanged, and if n8n is down
nothing about booking breaks. Design rationale: [additive-workflows-draft.md](additive-workflows-draft.md).

> **These JSON files were hand-authored for n8n Cloud without a live instance to validate
> against.** Node `typeVersion`s and parameter shapes drift between n8n releases. On import,
> **open each node once** to confirm it loads without a red error, re-map credentials, and run
> the validate → test gates below before activating. Treat the JSON as a 95%-done scaffold,
> not a guaranteed-clean import.

---

## 0. One-time: create 3 credentials in n8n

In n8n → **Credentials → New**:

1. **Airtable Personal Access Token** (type: *Airtable Personal Access Token*)
   - Name it exactly **`Airtable PAT`** (the JSON references that name).
   - Token: your rotated data-scoped PAT (base `appMYG0QlSZTCYxUU`, tables `Bookings` +
     `Priority List`). Create a **separate** credential here — don't reuse the Netlify env value by hand.
2. **Resend API** (type: *Header Auth*)
   - Name it exactly **`Resend API`**.
   - Header **Name:** `Authorization`  ·  **Value:** `Bearer re_your_resend_key`
3. **TY Notify Relay** (type: *Header Auth*) — Slack posts go through the site's
   `/notify` relay, NOT a raw Slack webhook (the webhook stays server-side; rotating
   Slack never touches n8n — see `netlify/functions/notify.js`).
   - Name it exactly **`TY Notify Relay (x-ty-notify)`**.
   - Header **Name:** `x-ty-notify`  ·  **Value:** the Netlify `NOTIFY_TOKEN` env value.
   - Restrict allowed domains to `tunedyota.com`.

---

## 1. Import the workflows

n8n → **Workflows → Import from File**, one at a time, in this order:

| Order | File | What it does |
|---|---|---|
| 1 | `0-shared-error-to-slack.json` | Error Trigger → Slack `#alerts`. Reused by the others. |
| 2 | `1-new-booking-to-slack.json` | Webhook → Slack `#bookings` the instant a booking lands. |
| 3 | `3-weekly-digest.json` | Mon 07:00 CT → email `info@` a week's booking pulse. |
| 4 | `2-post-event-review-request.json` | Daily 10:00 CT → review-request emails to recent customers. |

(2 and 3 are swapped on purpose — build/test the read-only digest before the one that
**sends customer email**.)

---

## 2. Per-workflow finish steps

### Map the Slack relay credential
Every Slack node POSTs to `https://tunedyota.com/.netlify/functions/notify` (2026-07-16:
replaced the pasted-webhook design — the raw Slack webhook no longer appears in any
workflow). Open each Slack HTTP Request node → **Authentication → Generic Credential →
Header Auth** → pick **`TY Notify Relay (x-ty-notify)`**. (Nodes: WF0 `Slack #alerts`;
WF1 `Slack #bookings` + `Slack email-failed note`; WF2 `Slack summary`; WF3 `Slack one-liner`.)

### Map credentials
Open each Airtable node → pick the **`Airtable PAT`** credential. Each Resend HTTP node
(WF2 `Send via Resend`, WF3 `Email digest to owner`, WF1 `Email owner`) →
under **Authentication → Generic Credential → Header Auth**, pick **`Resend API`**.

### Set the shared error workflow
For WF1, WF2, WF3: **Workflow settings (⋯ menu) → Error Workflow → `TY — Shared Error → Slack`.**
Any unhandled failure then posts to `#alerts`.

### WF2 only — two owner inputs
1. In the **`Build review emails`** Code node, replace `REPLACE_WITH_GOOGLE_REVIEW_LINK`
   with your GBP "write a review" short link (Business Profile → Ask for reviews → copy link).
2. Add a **`Review Requested`** checkbox column to the Airtable **Bookings** table (same way
   the `Modifications` column was added — Airtable UI). The workflow ticks it after sending so
   nobody is emailed twice. Without it, the `filterByFormula` clause `{Review Requested}!=TRUE()`
   won't filter and customers could get repeat emails — **add the column before activating.**

---

## 3. Validate → verify → test → activate (every workflow)

Do **not** activate straight off a clean import. Per workflow:

1. **Validate** — n8n flags red nodes on import; resolve all. If you have the n8n-mcp tools
   connected, run `n8n_validate_workflow({ id })` and fix every error.
2. **Verify wiring** — open the canvas, confirm the connections match the table above
   (WF1's Webhook fans out to *both* the Slack post and the IF node).
3. **Test with safe data:**
   - **WF1:** click **Execute Workflow** (listens), then `curl` a sample payload (below).
     Confirm the Slack post appears.
   - **WF3:** **Execute Workflow** once. Confirm the digest email arrives at `info@`. Read-only
     on Airtable — safe.
   - **WF2:** ⚠️ **sends real email.** First, temporarily narrow the `filterByFormula` to a
     single known test record (e.g. add `, {Email}="you@yourdomain.com"`), Execute once, confirm
     the email looks right and `Review Requested` flips to true, then restore the formula.
4. **Activate** the toggle only after the above passes.

### WF1 — wire the live webhook (the one code change)
WF1 receives bookings from the site. The code side already shipped (`lib/n8n.js` + a
fire-and-forget `ping` in `book.js`) and is **dark until you set one env var**:

1. Copy WF1's **Production** webhook URL (from the Webhook node — looks like
   `https://<you>.app.n8n.cloud/webhook/ty-booking`).
2. In **Netlify → Site settings → Environment variables**, add
   **`N8N_BOOKING_WEBHOOK_URL`** = that URL. Redeploy (or trigger a deploy).
   ⚠️ **Use `/webhook/ty-booking`, NOT `/webhook-test/ty-booking`.** The test URL only
   listens while the n8n editor is open clicking "Listen for test event" — it returns 404
   for live traffic, so `pingN8n` silently no-ops and no execution is ever created. (This
   exact mix-up broke WF1 once; the curl sample below uses the test URL on purpose.)
3. Make a real test booking on the site → confirm the `#bookings` Slack post fires.

Until that env var is set, `book.js` simply skips the ping — zero effect on booking.

```bash
# Sample WF1 payload for manual testing (matches book.js):
curl -X POST 'https://<you>.app.n8n.cloud/webhook-test/ty-booking' \
  -H 'Content-Type: application/json' \
  -d '{"event":"booking","status":"booked","name":"Test Driver","email":"t@x.com",
       "phone":"(612) 555-0100","vehicle":"Tundra","city":"Twin Cities","state":"MN",
       "slot":"9:20","eventLabel":"June 20, 2026","emailFailed":false,
       "installer":{"key":"aaron","name":"Aaron Groshong","phone":"(612) 406-7117"},
       "utm":{"source":"google","campaign":"spring"}}'
```

---

## 4. Optional add-ons (not built yet)

- **+7-day review nudge** for non-openers — copy + targeting drafted in
  [review-request-email.md](review-request-email.md). Needs `Review Nudged` (and optionally
  `Review Opened`) columns + Resend open-tracking. Say the word and I'll build WF4.
- ~~**WF1 owner email**~~ — DONE 2026-07-16: WF1's `Email owner` node emails `info@` on
  every booking (Resend, parallel to the Slack post; flags a failed customer-confirmation
  email in the body). Verified live (execution 66).

---

## Field reference (book.js → WF1 webhook payload)

`name, email, phone, vehicle, goals, mods, city, state, slot, eventDateISO, eventLabel,
installer{key,name,email,phone}, source, utm{source,medium,campaign}, emailFailed` — all
under `{{$json.body.*}}` inside n8n (webhook data is nested under `body`).
