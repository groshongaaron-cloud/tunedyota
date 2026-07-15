# Twilio SMS + Voice Adapter — Activation Runbook

Built + unit-tested. Inert until the steps below. Real business line (612-406-7117)
is untouched — this is verified against a TEMPORARY Twilio number first, then cut
over at port time.

## 1. Netlify env (via clipboard; never commit)
- `TWILIO_AUTH_TOKEN` — from the Twilio Console (Account → API keys & tokens).
- `TWILIO_FORWARD_NUMBERS` — installer cells, E.164, comma-separated, e.g.
  `+1XXXXXXXXXX,+1YYYYYYYYYY,+1ZZZZZZZZZZ`.
- `INTERNAL_TASK_SECRET` — already set (gates the ingest hop). Confirm present.
- (Optional) `TWILIO_PUBLIC_BASE` — only if `event.rawUrl` ever differs from the
  URL Twilio is configured to call. Normally leave unset.
Set for all contexts, then trigger a redeploy (env changes need a deploy).

## 2. Temporary Twilio number + webhooks
Buy a $1/mo number in the Twilio Console (or provision via API). Configure:
- **A CALL COMES IN** (Voice) → Webhook, HTTP POST →
  `https://tunedyota.com/.netlify/functions/twilio-voice`
- **A MESSAGE COMES IN** (Messaging) → Webhook, HTTP POST →
  `https://tunedyota.com/.netlify/functions/twilio-sms`
The `<Dial>` action + transcription callbacks are self-wired (relative to the same
host), so no extra config.

## 3. Live verification (against the temp number)
- Text the temp number → expect an auto-reply SMS + a new `sms` lead in the console
  Unassigned bucket (Channel sms, name "Text <number>", body in the activity log).
- Call the temp number, answer on a forward cell → call bridges; lead notes
  "call answered by installer".
- Call again, let it ring out → hear the greeting, leave a message → within a minute
  the lead's activity log shows `voicemail: <transcript> — <recording url>`.
- Confirm a bad/unsigned POST to either endpoint returns HTTP 403.

## 4. Cutover (later, at port time)
Once 612-406-7117 is ported into the Twilio account, move the two webhooks onto the
ported number and release the temp number. No code change.
