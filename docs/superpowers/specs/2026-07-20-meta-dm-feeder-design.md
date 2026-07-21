# Meta DM Feeder (Messenger + Instagram) — Design

**Date:** 2026-07-20
**Program:** Lead-feeder program — the next feeder after email (inbox-intelligence) and SMS/voice (Twilio adapter), anticipated by the inbox-intelligence spec's "future feeders" note. Approved by Aaron 2026-07-20.
**Owner decisions this spec encodes:** the **AI agent answers DMs live** (same NEPQ persona and guardrails as the site chat widget — not monitor-only, not draft-and-approve); Tuned Yota's Facebook Page and Instagram professional account exist and are already linked, so both channels are specced, phased by Meta's access rules.

## Goal

A Facebook Messenger PM or Instagram DM to Tuned Yota gets an instant AI answer, escalates to the right market's installer exactly like website chat (CRM lead, SMS + web push, console **Chats inbox**), and the installer's inbox reply is delivered back into the customer's DM thread. Today nothing watches these inboxes; leads live or die on someone checking the Meta apps.

## Approach chosen

**DMs become another front-end to the existing chat stack.** `netlify/functions/chat.js` already exports the whole conversation engine (`processChat`, `escalate`; `lib/chat-agent.js` exports `runChat`), the session store is source-agnostic, and the installer Chats inbox lists sessions regardless of origin. The feeder is therefore a thin webhook + delivery adapter — no second AI brain, no new inbox. Rejected: monitor-only (loses the instant-response advantage, response time = human latency) and draft-review (Meta has no draft surface; DMs expect speed; would need new review UI).

## 1. Webhook — `netlify/functions/meta-dm.js`

- **GET** = Meta's subscription handshake: echo `hub.challenge` when `hub.verify_token` equals env `META_VERIFY_TOKEN`; else 403.
- **POST** = events. **Authentication: verify `X-Hub-Signature-256`** (HMAC-SHA256 of the raw body with `META_APP_SECRET`, constant-time compare via existing `secretEquals`) — invalid → 403, never processed.
- One endpoint serves both `object: "page"` (Messenger) and `object: "instagram"` (DMs) — Meta subscription config differs, payload handling is shared. Normalizer extracts, per messaging event: `{platform: "facebook"|"instagram", senderId, mid, text, isEcho}`. Echo (`is_echo`), delivery, read, and non-text-without-attachment events are acknowledged and skipped (attachments get a graceful "got it — can you tell me a bit about it in a message?" style handling: the turn records `[attachment]`).
- **Always 200** a signature-valid POST even when processing fails (Meta disables webhooks that error persistently); failures are logged and Slack-notified via `notifyOwner`.
- **Dedupe:** Meta retries deliveries. Each ingested turn stores its `mid`; an event whose `mid` already exists in the session transcript is skipped. (Extra turn field is invisible to the widget/inbox — both read only `role`/`text`.)

## 2. Conversation bridge

- **Session mapping:** session id `fb:<PSID>` / `ig:<IGSID>` (well under the 64-char cap), `pageContext` `"facebook"` / `"instagram"` (falls to the default persona label; channel is visible in the inbox via context). Customer name best-effort from the Graph profile API on first contact.
- **The bridge calls `processChat({session, message, page}, deps)` directly** — same guardrails, MAX_MESSAGES cap, escalation tool, and installer-notify behavior as the widget. The returned `reply` (including the capped-path reply) is **delivered via the Graph Send API** instead of widget polling.
- **Expired/closed sessions:** `processChat` returns `{expired}` for stale sessions (30 min ai / 2 h escalated — unchanged). The feeder then starts a fresh session id `fb:<PSID>:<timestamp>` and re-sends the message. Meta's own thread preserves visible history; the CRM keeps the lead. Session lookup = deterministic: try the bare id first; on expired, mint the suffixed id (and reuse a live suffixed session found by the most recent turn — the feeder tracks the active id per sender by querying the store).
- **Escalation parity:** the `transfer_to_installer` tool inside `processChat` already routes by market, creates the Priority List lead (channels `facebook` / `instagram` **already exist** in `lib/leads.js` CHANNELS), SMSes + web-pushes the installer, and logs to Chat Escalations. Escalated DM sessions appear in the console Chats inbox beside website chats.
- **Visibility:** first message of a brand-new DM session Slack-notifies the owner ("New Facebook DM from <name>: <first 120 chars>") via `notifyOwner` — best-effort, never blocking.

## 3. Outbound delivery — `lib/meta-graph.js`

- `sendDm({ platform, recipientId, text }, deps)` → POST `https://graph.facebook.com/<META_GRAPH_VERSION>/me/messages` with `{recipient: {id}, message: {text}}` and the Page access token (`META_PAGE_TOKEN` — serves both Messenger and linked-IG messaging). Deps-injected fetch; returns `{ok}` / `{ok:false, error, code}`; never throws.
- `getProfile(senderId, platform, deps)` → best-effort display name.
- `verifySignature(rawBody, header, appSecret)` → pure, tested.
- **Installer replies flow back to Meta:** the two places an installer turn is appended — `installerOp` reply (console inbox) and the Twilio SMS relay — gain a deps-injected `deliver(sess, turn)` hook that, when `sess.id` starts with `fb:`/`ig:`, sends the text via `sendDm`. No-op for web sessions. Fire-and-forget with the same sync-throw-safe wrapper as the chat notify.
- **24-hour window:** the AI's instant replies keep the window open on the front end. If an installer reply is rejected because the standard messaging window lapsed (customer silent > 24 h), the feeder appends a system-visible note to the transcript ("⚠ Meta window closed — reach the customer at <phone>") and Slack-notifies; the escalation flow already captured the customer's phone as the fallback channel. No message tags / human-agent tag in v1 (tracked out of scope).

## 4. Meta app & phased go-live (owner runbook: `docs/operations/meta-dm-activation.md`)

- **Phase A — Messenger (days):** a Meta **Business-type app** in **Development Mode** receives live webhooks and sends replies for a Page its admin owns — no App Review. Owner clicks: create app → add Messenger product → generate Page token (`pages_messaging` + `pages_manage_metadata`) → set webhook callback `https://tunedyota.com/.netlify/functions/meta-dm` + verify token → subscribe the Page to `messages`. Env to set: `META_APP_SECRET`, `META_PAGE_TOKEN`, `META_VERIFY_TOKEN` (+ optional `META_GRAPH_VERSION`, default `v22.0`).
- **Phase B — Instagram (days-to-weeks, Meta-gated):** identical code; subscribing the `instagram` object's `messages` field requires **Advanced Access on `instagram_manage_messages`** via App Review (screencast) and typically **Business Verification**. Submitted once Messenger is proven live. IG account is already professional + Page-linked (confirmed by owner).
- Runbook documents both click-paths, the review-submission script, and the env handoff (clipboard flow, secrets never in chat/repo).

## 5. Errors & security

- Fail-closed: missing `META_APP_SECRET`/`META_VERIFY_TOKEN` → handshake and POSTs refuse (503/403). Missing `META_PAGE_TOKEN` → inbound still ingests + escalates (leads are never lost); outbound sends are skipped with a Slack alert.
- All Graph/Slack/Twilio side-effects best-effort; the webhook response path never depends on them.
- No new data stores: Chat Sessions, Chat Escalations, Priority List, and the existing env/secrets posture cover everything.

## 6. Testing & ship

TDD (`node --test`, deps-injected, no live Meta calls):
- `tests/meta-graph.test.js` — signature verify (valid/invalid/missing), sendDm request shape + token/env fail-closed, window-lapse error mapping.
- `tests/meta-dm.test.js` — handshake GET (good/bad token), POST 403 on bad signature, page + instagram payload normalization, echo/read/delivery skip, mid dedupe, session id mapping + expired-session re-mint, reply delivered via sendDm, capped-path delivery, new-session Slack notify, lead/escalation parity (mocked processChat), always-200 discipline.
- `tests/chat-deliver.test.js` — installer reply on `fb:`-prefixed session triggers deliver; web session no-op; window-lapse note + notify; SMS-relay path parity; existing chat/twilio suites untouched.
- Ship: full `npm test`, commit, push; live verify = GET handshake responds 403 pre-env (deployed + fail-closed), then full loop on Phase A activation day (real DM → AI reply → escalate → inbox reply → DM).

## Out of scope (tracked)

- Instagram story replies/mentions, post/ad comments, click-to-message ad postbacks.
- Message tags / `HUMAN_AGENT` tag (7-day window) — revisit if window-lapse notes become frequent.
- Attachment/media understanding (images in DMs) — v1 acknowledges and asks for text.
- Auto-submitting Meta App Review — owner action with our prepared script.
