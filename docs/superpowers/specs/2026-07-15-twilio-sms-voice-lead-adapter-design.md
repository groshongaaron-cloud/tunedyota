# Twilio SMS + Voice Lead Adapter — Design

**Date:** 2026-07-15
**Status:** Approved (design), pending implementation plan
**Program:** Multi-channel lead tracker — Adapter #3 (Twilio SMS + Calls). See
`.claude/memory/lead-tracking-program.md`. Follows the Core (`lib/leads.js` +
`/lead-ingest`) shipped 2026-07-14 and the Gmail adapter shipped 2026-07-15.

## Purpose

Turn inbound texts and phone calls to the Tuned Yota business line into tracked
leads in the existing Priority List pipeline, and forward inbound calls to the
installers' cells so a live prospect reaches a human. This is the SMS + Voice
pillar of the multi-channel tracker.

## Context & constraints

- **Number not yet ported.** `612‑406‑7117` is still on T‑Mobile. This adapter is
  built and verified against a **temporary Twilio number**; pointing the real
  business line at these webhooks is a separate **cutover at port time**. Nothing
  in this work goes live on the real number.
- **Twilio is push, not poll.** Twilio POSTs a webhook the instant a text/call
  arrives (contrast the scheduled Gmail poller). The adapter is a set of webhook
  receivers that return TwiML.
- **Dependency-free**, matching the Gmail adapter: TwiML is XML strings; signature
  validation is HMAC‑SHA1 via Node `crypto`; the ingest hop is an HTTP POST. No
  `twilio` SDK.
- **Reuse the Core unchanged.** A bare text/call carries only a phone number (no
  name, no city). `processLeadIngest` requires a `name` and routes by `city`; the
  adapter adapts to that contract rather than modifying the Core.

## Architecture

Webhook receivers → normalize → POST to `/lead-ingest` (with
`x-ty-task: $INTERNAL_TASK_SECRET`, exactly like `gmail-lead-poll.js`, resolving
the base URL via `LEAD_INGEST_URL` → `env.URL` → prod default). All inbound
webhooks validate `X-Twilio-Signature` first (fail-closed).

### Files

| File | Responsibility |
|---|---|
| `netlify/functions/lib/twilio.js` (pure) | `validateTwilioSignature(authToken, url, params, signature)`; TwiML builders `dialTwiml`, `voicemailTwiml`, `smsReplyTwiml`, `hangupTwiml`; `parseInboundSms(params)`, `parseInboundCall(params)`; `ingestLead(body, {env, post})`; `displayName(e164)` / phone helpers. No I/O beyond the injected `post`. |
| `netlify/functions/twilio-sms.js` | Inbound SMS webhook. Validate → `ingestLead` (channel `sms`) → return TwiML `<Message>` auto-reply. |
| `netlify/functions/twilio-voice.js` | Inbound call webhook AND its own `<Dial>` action callback (one function, branched on `DialCallStatus`). Initial leg: log the call as a lead + return `<Dial>` ringing all forward numbers. Action leg: answered → note + `<Hangup>`; no-answer/busy/failed → `<Say>` greeting + `<Record transcribe="true" transcribeCallback=…>`. |
| `netlify/functions/twilio-voice-transcription.js` | Async transcription callback. Validate → `ingestLead` update carrying the transcript (`message`) + recording URL. |

### Security (inbound edge)

Every webhook computes the Twilio signature over the **exact public webhook URL**
(including any query string) plus the POST params, HMAC‑SHA1 with
`TWILIO_AUTH_TOKEN`, base64, and constant-time-compares to `X-Twilio-Signature`.
Mismatch or missing token → `403`. Fail-closed: with no `TWILIO_AUTH_TOKEN` set,
all requests are rejected, so the endpoints can't be spoofed before activation.
The adapter→`/lead-ingest` hop remains gated by `x-ty-task`.

The public URL used for the HMAC is derived from `env.URL` + the function path (or
an explicit `TWILIO_PUBLIC_BASE` override) so it matches what Twilio signs; Twilio
signs the URL it was configured with, so the configured webhook URL and the
computed URL must be byte-identical (documented gotcha; covered by config, not code
guesswork).

## Lead mapping

| Field | SMS | Call / voicemail |
|---|---|---|
| `name` | `Text <formatted From>` | `Caller <formatted From>` |
| `phone` | `From` | `From` |
| `channel` | `sms` | `phone` |
| `source` | `twilio:sms` | `twilio:call` |
| `goals` / `message` | SMS `Body` | `"inbound call"`, then voicemail `TranscriptionText` |
| `city` | (none) → **Unassigned** | (none) → **Unassigned** |

- No city ⇒ `getMarket("")` returns nothing ⇒ Core sets `City="Unassigned"` and no
  `Installer` ⇒ the lead lands in the admin **Unassigned** bucket for triage.
- **Core dedupe by phone** folds repeat texts/calls from one number into a single
  active lead. The full arc of one missed call — initial "inbound call" → (no
  answer) → voicemail transcript — updates the same lead's Activity Log, because
  the initial call leg already created an active lead with that phone. The
  transcript rides in as `message`, which the Core appends to the Activity Log
  (the Core's match branch updates Last Contact + Activity Log, not Goals — so
  Activity Log is the durable home for the transcript; acceptable for MVP).

## Call flow (voice)

1. Inbound call → `twilio-voice.js` (no `DialCallStatus`): validate → `ingestLead`
   ("inbound call") → return `<Dial timeout="20" action="<self>">` containing one
   `<Number>` per entry in `TWILIO_FORWARD_NUMBERS` (rings all three cells at once;
   first to answer wins).
2. Dial completes → Twilio re-POSTs to the same function with `DialCallStatus`:
   - `completed` (answered) → `ingestLead` note "call answered" → `<Hangup>`.
   - `no-answer` / `busy` / `failed` → `<Say>` a short greeting + `<Record
     transcribe="true" transcribeCallback="/twilio-voice-transcription"
     maxLength="120" playBeep="true">`.
3. Transcription ready → Twilio POSTs `twilio-voice-transcription.js` with
   `TranscriptionText` + `RecordingUrl` → validate → `ingestLead` update.

**Routing rationale:** a phone call carries no city, so market-based routing is
impossible; ringing all three cells is the correct default for a three-installer
shop and needs no routing logic. Admin triages the Unassigned lead afterward.

### Voicemail greeting

Played on no-answer, immediately before `<Record>` (owner-authored, verbatim):

> "Hi this is Tuned Yota — I saw we missed your call, sorry about that! I wanted to
> make sure I got back to you personally. Whether you're looking for the OTT tune, a
> Magnuson Supercharger, a build for your vehicle, or a maintenance issue needing a
> fix, or just have a few questions, I'd love to help you get it dialed in. You can
> also shoot a quick text to the same line, 612‑406‑7117, and a team member can begin
> a live chat with you. So we can call you right back, please leave your name and a
> short message after the tone. Thanks, and talk soon!"

- **Rendering:** ships with Twilio TTS using an Amazon **Polly neural** voice
  (`voice="Polly.Matthew-Neural"` or similar) for a natural read — far better than the
  default robotic voice, and instantly maintainable. The greeting text lives as a
  single constant in `lib/twilio.js` so it's trivially editable. The phone number is
  written so TTS reads the digits cleanly. **Future upgrade path:** swap `<Say>` for
  `<Play>` of a recorded MP3 of the owner's own voice (warmer, matches the first-person
  script) — a one-line change once an audio file is hosted; not in this build's scope.
- **Voicemail-coherence tweak (folded in):** the owner's original script steered
  callers to *text* and signed off without inviting a message, which conflicts with
  recording a voicemail. A single sentence — "So we can call you right back, please
  leave your name and a short message after the tone." — was added before the sign-off
  so the `playBeep` + `<Record>` that follows is coherent. Both the text alternative and
  the voicemail path remain open; either way a lead is created.

## Configuration (owner-provided at activation; never git/memory)

- `TWILIO_AUTH_TOKEN` — signature validation (secret; via clipboard).
- `TWILIO_FORWARD_NUMBERS` — installer cells, E.164, comma-separated (owner-held;
  via clipboard).
- `INTERNAL_TASK_SECRET` — already set; gates the ingest hop.
- Optional `TWILIO_PUBLIC_BASE` / `LEAD_INGEST_URL` overrides.
- A temporary Twilio number with **Messaging** webhook → `/twilio-sms` and **Voice**
  webhook → `/twilio-voice`. Provisioned + wired via the Twilio REST API if the
  owner supplies Account SID + auth token, else the owner buys the number in-console
  and pastes the two webhook URLs.

## Error handling

- Bad/absent signature → `403`, no processing.
- `ingestLead` failure never breaks the caller/texter: the handler still returns
  valid TwiML (auto-reply / dial / voicemail). Twilio retries webhooks on `5xx`;
  handlers return `200` with TwiML even when ingest failed (best-effort, logged),
  so Twilio doesn't retry-storm the phone experience. The initial call leg's lead
  means a later voicemail/transcription failure still leaves a follow-up-able lead.
- Every ingest is idempotent-friendly via Core phone-dedupe, so Twilio's
  at-least-once retries can't create duplicate leads.

## Testing

TDD throughout.

- **`lib/twilio.js` unit tests:** signature validation against Twilio's documented
  test vector (known URL + params + token → known signature), plus a tampered-param
  negative; TwiML builder output (well-formed XML, correct attrs, multiple
  `<Number>`); `parseInboundSms`/`parseInboundCall` field mapping; `ingestLead`
  posts the right body + `x-ty-task` header (injected `post`).
- **Handler tests** (injected deps — fake env, fake ingest, sample Twilio param
  bodies): SMS happy path returns reply TwiML + ingests; voice initial leg dials all
  numbers + ingests; voice no-answer branch returns record TwiML; answered branch
  hangs up; transcription callback ingests the transcript; signature failure → 403
  on each.
- **Live verification** against the temp number: real text → lead + auto-reply;
  answered call → forward + lead; unanswered call → voicemail + transcript → lead.

## Out of scope (YAGNI)

- Two-way SMS conversation threading (installers reply from their own phones via the
  existing call/text deep-links).
- Market/geo routing of calls (no city signal on a call).
- Porting mechanics + real-line cutover (tracked separately in
  `lead-tracking-program.md`; happens after this build is verified).
- Meta (FB/IG) adapter — that is Adapter #4.

## Go-live boundary

All code + unit tests land and are verified against a temporary Twilio number.
The real business line is untouched until a deliberate cutover step at port time.
Until then these endpoints are inert on `612‑406‑7117`.
