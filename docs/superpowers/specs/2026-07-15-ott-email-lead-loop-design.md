# OTT Email Lead Loop (Gmail adapter) — Design Spec

**Date:** 2026-07-15 · **Status:** Approved for planning · **Owner:** Aaron Groshong
**Sub-project #2 (Email/Gmail adapter)** of the Multi-Channel Lead Tracking program ([[lead-tracking-program]]).

---

## 1. Goal

Close the loop on the Facebook-Ads leads OTT emails to `info@tunedyota.com`:
1. **Ingest** — each OTT lead email becomes a tracked lead in the console (via the already-live `/lead-ingest`), with the email's thread/reply identifiers captured so it can be answered later.
2. **Confirm completion** — when the resulting tune is **marked Completed at close-out**, the system **automatically replies in the original email thread** confirming the lead is done, and stamps the lead so it's recorded and never double-sent.

This answers OTT's "did the retailer service this lead?" automatically, and nothing slips.

## 2. Why / context

OTT emails arrive at `info@tunedyota.com` (Google Workspace) with subject **"A New Lead From Facebook Ads"** (from the OTT / `marketingteam.live` pipeline; Aaron is a recipient/CC). Today these are worked manually with no tracking and no completion confirmation back to OTT. The Core lead tracker (pipeline, `/lead-ingest`, close-out) is already live — this adapter feeds it and adds the completion-reply loop. Purely additive.

## 3. Scope

**In:** a Gmail connection to `info@tunedyota.com` (Gmail API, stored OAuth refresh token); a scheduled **ingest poll** that finds new OTT lead emails, parses them, POSTs to `/lead-ingest` with the email's thread/message/reply refs, and labels them processed; a small Core extension so `/lead-ingest` persists those email refs; four new Priority List columns; a scheduled **completion-reply sweep** that detects OTT-lead bookings marked Completed and sends a templated in-thread reply, then stamps the lead; unit tests for the parser, the poll orchestration, and the sweep.

**Out:** parsing/ingesting non-OTT emails or other subjects; two-way email conversations beyond the single completion reply; changing the installer close-out UI (the sweep observes the booking's Completed status — it does not modify close-out); Gmail push/Pub/Sub (polling is sufficient); handling attachments; the Twilio/Meta adapters (separate sub-projects).

## 4. Data model — four new Priority List columns

Added the same schema-token way as the Core's six (see [[airtable-metadata-api]]). Additionally, the existing `Channel` single-select gains an **`ott-national`** option (for the OTT-national tag).

| Column | Type | Purpose |
|---|---|---|
| `Email Thread` | Single line text | Gmail `threadId` — reply lands in the same thread. |
| `Email Message-Id` | Single line text | The source message's RFC `Message-ID` header — used as `In-Reply-To`/`References`. |
| `Reply-To` | Single line text | Where the completion reply is addressed (from the email's `Reply-To`, else `From`). |
| `OTT Reply Sent` | Date | Stamped when the completion reply is sent — the idempotency guard (exactly one reply). |

## 5. Gmail access

- **Gmail API** on `info@tunedyota.com` via an **OAuth2 refresh token** stored in Netlify env: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`. Access tokens are minted per-run with `google-auth-library` (already a repo dependency) — no new deps.
- **Scopes:** `https://www.googleapis.com/auth/gmail.modify` (read messages + add/remove labels) **and** `https://www.googleapis.com/auth/gmail.send` (send the in-thread reply).
- **Thin Gmail client** `netlify/functions/lib/gmail.js`: `listMessages(query)`, `getMessage(id)`, `addLabel(id, label)`, `sendReply({threadId, to, inReplyTo, references, subject, body})`. All take an injected token-getter + fetch so they unit-test without network.
- **Owner setup (I own the automatable parts):** owner creates a Google Cloud OAuth client (Desktop/Web) + enables the Gmail API in their Google Cloud project, and clicks **Allow** on a consent URL I generate; I capture the returned refresh token via clipboard → `netlify env:set` (never printed). Exact click-steps + the consent URL are produced in the implementation plan's setup task. (Alternative considered: a Workspace service account with domain-wide delegation — avoids consent but needs admin-console delegation; rejected as heavier for a single mailbox.)

## 6. Components

### 6.1 `lib/ott-email.js` — pure parser
`parseOttLeadEmail(message)` → `{ name, phone, email, vehicle, goals, channel, source, replyTo, threadId, messageIdHeader }`.
- Input: a normalized message object `{ headers: {from,to,cc,replyTo,subject,messageId,date}, textBody, htmlBody, threadId }` produced by `lib/gmail.js`.
- `channel` = **`"ott-national"`** — these are OTT's national Facebook-Ads leads distributed to retailers, tracked as their own category (owner's choice). `source` = `"ott-national:fb-ads"` so the pathway is auditable. **This adds `ott-national` to the Core in three places (small, in-scope):** (a) the `CHANNELS` enum in `netlify/functions/lib/leads.js`; (b) the `Channel` single-select options in Airtable (a `ott-national` choice); (c) the console icon map `CHAN_ICON` in `site/installer.html` (e.g. `ott-national: "🇺🇸"` or a badge). The `+ Log a lead` channel dropdown also gains `ott-national`.
- Extracts whatever customer detail the email actually contains (name/phone/email/vehicle) plus **always** the email refs (`threadId`, `messageIdHeader`, `replyTo`).
- **Concrete extraction rules are derived TDD-style from real captured samples in implementation Task 1** — the *contract* (inputs/outputs above) is fixed here; the field-locating patterns come from fixtures, because a parser must be built against real data. If a field isn't present in the email, it's returned empty and the lead still tracks on its email refs.

### 6.2 `gmail-lead-poll` — scheduled ingest (every 10 min)
1. `listMessages('subject:"A New Lead From Facebook Ads" -label:ty-ingested newer_than:30d')`.
2. For each: `getMessage` → normalize → `parseOttLeadEmail`.
3. POST to `/.netlify/functions/lead-ingest` with header `x-ty-task: $INTERNAL_TASK_SECRET` and body `{ name, phone, email, vehicle, goals, channel, source, emailThread, emailMessageId, replyTo }`.
4. On a 2xx, `addLabel(id, 'ty-ingested')` so it never reprocesses. On parse failure, label `ty-ingest-failed` (visible, not silently dropped) and continue the batch.

### 6.3 Core extension — persist email refs
`processLeadIngest` (in `lib/leads.js`) accepts optional `d.emailThread` / `d.emailMessageId` / `d.replyTo` and writes them to `Email Thread` / `Email Message-Id` / `Reply-To` (added to the create field set + the `createTolerant` optional-keys list, and to the dedupe-append path so a re-ingest of the same lead keeps its refs). No behavior change when absent.

### 6.4 `ott-reply-sweep` — scheduled completion reply (every 15 min)
1. List Priority List leads where `Email Thread` is set, `OTT Reply Sent` is empty, and `Converted Booking` is set.
2. For each, fetch the linked Bookings record; if `Status === "Completed"`:
   - Build a reply: `to` = `Reply-To`, `threadId` = `Email Thread`, `inReplyTo`/`references` = `Email Message-Id`, `subject` = `"Re: A New Lead From Facebook Ads"`, body = the completion template (§6.5).
   - `sendReply(...)` via Gmail.
   - On success, stamp `OTT Reply Sent` = today (Central). Idempotent — the stamp prevents a second send.
3. Reuses the existing `Converted Booking` link (set by the Core's convert-to-booking) — no close-out code changes.

### 6.5 Completion reply template
Plain, in-thread, e.g.:
> Hi John — this lead has been completed. The customer's {vehicle} was tuned on {completionDate} by {installer} at Tuned Yota (an OTT retailer). Thanks!
> — Aaron, Tuned Yota

`{vehicle}`/`{installer}`/`{completionDate}` come from the linked booking; blanks degrade gracefully. Final wording is owner-adjustable (one template constant).

## 7. Data flow

```
OTT email → gmail-lead-poll (parse) → POST /lead-ingest {..., emailThread, emailMessageId, replyTo}
          → Priority List lead (Stage New, email refs stored) → label ty-ingested
installer works it → convert-to-booking (Converted Booking link) → close-out marks booking Completed
ott-reply-sweep: lead has thread + booking Completed + not yet replied
          → Gmail sendReply (in original thread) → stamp OTT Reply Sent
```

## 8. Error handling & idempotency
- **Ingest dedupe:** the `ty-ingested` Gmail label (added only on a successful post) means a message is processed once; a crash before labeling just reprocesses next run, and `/lead-ingest`'s own phone/email dedupe prevents a duplicate lead.
- **Reply dedupe:** `OTT Reply Sent` gates the sweep — exactly one reply per lead.
- **Gmail auth/API failure:** logged, run is a no-op, retried next schedule (both jobs are stateless + idempotent).
- **Parse failure:** that message is labeled `ty-ingest-failed` and skipped; the batch continues.
- **Missing columns / env:** the poll no-ops if Gmail env is unset; `/lead-ingest` tolerates the four columns being absent (writes drop gracefully) — so the adapter is inert-safe until setup completes.

## 9. Testing
- **`parseOttLeadEmail`** — unit tests against 1–2 real captured email fixtures (Task 1): asserts extracted fields + email refs; a boilerplate-only email still yields the refs + `channel`.
- **`gmail-lead-poll`** — mock `lib/gmail.js` + fetch: asserts query, parse→post shape (incl. email refs + task-secret header), label-on-success, skip+label-on-parse-failure, and that an already-labeled message isn't reprocessed.
- **`ott-reply-sweep`** — mock Airtable + Gmail: selects only (thread set + Converted Booking Completed + `OTT Reply Sent` empty); composes correct `threadId`/`In-Reply-To`; stamps on success; idempotent (a stamped lead is skipped); a non-Completed booking is skipped.
- **Core extension** — `processLeadIngest` persists the three email refs on create and preserves them on dedupe-append.
- **`lib/gmail.js`** — token/request shaping unit-tested with injected fetch.
- Full `node --test` green; ship via the `ship` skill (no SEO inputs).

## 10. Owner setup
1. **Google Cloud (owner, one-time):** enable the Gmail API; create an OAuth client; grant consent via my generated URL for `info@tunedyota.com`. I capture `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` via clipboard → `netlify env:set`.
2. **Airtable (via schema token, like the Core):** add the four §4 columns.
3. **Provide one real sample email** (full headers + body) so Task 1 can finalize the parser + confirm the reply target. Digits may be X'd if the layout is identical.
4. No code secrets beyond the Gmail env; `INTERNAL_TASK_SECRET` (adapter auth) is already set.

## 11. Out of scope / future
- Twilio SMS/calls adapter (#3) and Meta FB/IG adapter (#4).
- Multi-message email conversations / customer replies.
- Gmail push (Pub/Sub) real-time ingest — revisit only if a 10-min poll is too slow.

Related: [[lead-tracking-program]], [[monthly-ott-calibration-report]], [[ott-policy-standards]], [[email-sending-infra]], [[certificate-v2-dashboard-program]], [[airtable-metadata-api]], [[installer-console-access]].
