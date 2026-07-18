# Installer Chat — Design Spec

**Date:** 2026-07-17 · **Status:** Approved design, pre-implementation
**Feature:** Site-wide AI chat ("Chat with an OTT installer NOW") with live-installer escalation over Twilio SMS, tied to the Priority List CRM.

## 1. Summary

A floating chat widget on every customer-facing page. An AI agent (Claude Sonnet 4.6, NEPQ-trained persona, deep business knowledge) answers first — greeting every chat with **"Thank you for using Tuned Yota's chat agent."** When the customer asks for a live person, hits a guardrail, or the AI can't answer properly, the AI qualifies the customer (contact method, vehicle make/model/year, location — explaining it asks so it can connect them with their *nearest* OTT installer), routes to that market's installer, notifies them by SMS + web push, creates a CRM lead, gives the customer the installer's direct contact info, and logs the unanswerable question to an improvement repository. If the customer stays on the page, the installer's SMS replies relay back into the widget (conversation stays on the page — approved as "Option A").

Everything runs on the existing stack: Netlify functions, Airtable, Twilio, Claude API. No new vendors.

## 2. Widget (frontend)

- `site/chat.js` + `site/chat.css`, vanilla JS like the rest of the site. Included on every customer-facing page.
- Floating pill button, bottom-right. Label by page context:
  - Default: **"Chat with an OTT installer NOW"**
  - AMSOIL pages (`amsoil-*.html`): **"Chat with a AMSOIL Fluid Specialist"**
  - Magnuson page: **"Chat with a Magnuson Supercharger Specialist"**
- Page context (which label/page the visitor is on) is sent with every message so the agent knows which persona emphasis applies.
- Panel opens in place; full-width bottom sheet on mobile. Session ID (UUID) in `sessionStorage`.
- While a session is `escalated`, the widget polls `GET /chat?session=…&since=…` every ~3s for installer replies. No websockets.

## 3. Chat function (`netlify/functions/chat.js`)

- `POST` (send message) and `GET` (poll for new messages). CORS same-origin.
- Loads/creates the session row in Airtable **Chat Sessions**, appends the user turn, calls Claude, appends the reply, returns it.
- **Model:** `claude-sonnet-4-6` (same tier as inbox-sweep's NEPQ drafts). Short, SMS-length replies. No streaming — replies are short; the widget shows a typing indicator during the request.
- **System prompt** (frozen for prompt caching; volatile context appended after the cached prefix): greeting rule, NEPQ conversational method (reuse material from `lib/email-draft.js`), business knowledge assembled from repo data (markets + installers, event schedule via the Airtable-backed events source, calibration reference, AMSOIL fluids, OTT product basics), page-context note, and the guardrails below.
- **Guardrails (hard rules — escalate instead of answering):**
  1. No custom/negotiated price quotes (published prices OK).
  2. No fitment guarantees (typical compatibility OK; specifics defer to installer).
  3. No booking changes (may link to the booking page).
  4. No warranty/legal/emissions-compliance claims.
- **Escalation** is implemented as a Claude tool (`transfer_to_installer`) whose schema requires: `contactMethod`+value, `vehicleMake`, `vehicleModel`, `modelYear`, `city`, `state`, `questionSummary`. The model is instructed to collect these conversationally (explaining why) before calling it.

## 4. Escalation pipeline

Triggered by the `transfer_to_installer` tool call. All steps best-effort with the same never-break-the-customer discipline as `book-background.js`:

1. **Route:** `getMarket(city)` → `keyToInstaller(market.inst)`. Unknown city → unassigned lead + owner (Aaron) as fallback installer.
2. **CRM lead:** Priority List record — stage `New`, new channel value `chat` (added to `CHANNELS` in `lib/leads.js`), installer assigned, full transcript appended to Activity Log.
3. **Notify installer:** SMS via new `sendSms` in `lib/twilio.js` (Twilio REST, from `TWILIO_FROM_NUMBER` — new env var) with customer name, number, vehicle, and question; plus web push via existing `lib/webpush.js`.
4. **Tell customer:** widget message with the installer's name and phone ("here's {name}'s direct line — they've been sent your question").
5. **Log to improvement repository:** row in Airtable **Chat Escalations**.
6. Session status → `escalated`.

## 5. SMS relay (`twilio-sms.js` changes)

- Inbound SMS whose `From` matches an installer phone **and** that installer has an active `escalated` session → append as installer message to that session (visible to customer via polling). No lead ingest, no auto-reply for that message.
- Multiple active sessions for one installer → route to the most recently active; the notification SMS includes the customer's direct number as the fallback path.
- All other inbound SMS: existing behavior unchanged (lead ingest + auto-reply). Tests must prove this.

## 6. Data model (Airtable, added to `setup-airtable.mjs`)

| Table | Fields |
|---|---|
| **Chat Sessions** | Session ID (primary) · Status (`ai`/`escalated`/`closed`) · Page Context · Customer Name · Phone · Vehicle · City · Installer · Transcript (long text, JSON array of turns) · Created · Last Activity |
| **Chat Escalations** | Question (primary) · Reason (`asked-for-human`/`guardrail`/`no-answer`) · Page Context · Session ID · Date · Status (`New`/`Answer added`) |

Lifecycle: sessions close after 30 min inactivity (`ai`) / 2 h (`escalated`). Closed sessions reject new messages; widget offers to start fresh.

## 7. Abuse & cost control

- Caps: 40 messages/session, 1,000 chars/message, `max_tokens: 500` per reply; together these bound worst-case spend below ~$0.60/session. Over-cap → polite refusal + booking-page link.
- Frozen cached system prompt (Sonnet 4.6 min cacheable prefix 2,048 tokens — the prompt exceeds this): typical conversation ≈ $0.02–0.05.
- `ANTHROPIC_API_KEY` already in Netlify env; new env var: `TWILIO_FROM_NUMBER`.

## 8. Error handling

- Claude API failure → widget shows "text/call {owner phone}" fallback message; session preserved.
- Airtable failure on session write → conversation continues from in-request memory for that turn; error logged.
- Escalation sub-steps are individually try/caught (mirror `book-background.js`); customer always gets the installer contact info even if SMS/push/CRM writes fail.
- Twilio signature validation on the webhook is unchanged.

## 9. Testing

- `node --test`, injected deps (repo convention): chat handler (greeting, guardrail → escalation tool, caps, session lifecycle), escalation pipeline (routing, lead + transcript, escalation log, unknown-city fallback), relay routing (installer reply → session; non-installer SMS → existing behavior unchanged), `sendSms` helper.
- Playwright page test for the widget (open, send, render reply, context-aware label), like `tests/book-page.test.mjs`.

## 10. Out of scope (v1)

- Chat history for returning visitors (each visit is a fresh session).
- Installer-side web UI for chat (installers use SMS; console UI can come later).
- Attachments/images in chat.
- SMS conversation continuing after the customer leaves the page (customer already has the installer's direct number; the installer has theirs).

## 11. Decisions log

- AI-first agent, NEPQ persona, fixed greeting — owner decision.
- Escalation stays on-page with SMS relay in (Option A) — owner decision.
- Lead created at escalation only — owner decision.
- Every page, context-aware labels — owner decision.
- All four guardrails + escalation repository — owner decision.
- Existing-stack architecture (Approach A) over Managed Agents / SaaS chat — owner decision.
