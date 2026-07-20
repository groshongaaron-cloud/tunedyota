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

## 4. Cutover (at port time)
Once 612-406-7117 is ported into the Twilio account, move the two webhooks onto the
ported number and release the temp number. No code change.
**Status: port COMPLETE (2026-07-20).** Webhooks already point at the ported number
(SmsUrl → `/twilio-sms`, VoiceUrl → `/twilio-voice`); `TWILIO_FROM_NUMBER=+16124067117`.

## 5. A2P 10DLC registration — REQUIRED before outbound SMS works
US carriers block un-registered application-to-person SMS (error **30034**). Register
in Twilio Console → Messaging → Regulatory Compliance / A2P 10DLC. A Campaign is vetted
by The Campaign Registry (**1–7 business days**), which assigns a trust score affecting
throughput. **All copy/paste fields + the A2P overview are in
[a2p-campaign-content.md](a2p-campaign-content.md)** — use it alongside these steps.
1. **Brand** — register the Tuned Yota business (legal name, EIN, address, website
   `https://tunedyota.com`, contact email).
2. **Campaign** — use case "Customer Care" / "Mixed" (conversational + transactional).
   The campaign form requires the disclosures we now publish:
   - **Privacy Policy URL:** `https://tunedyota.com/privacy` (contains the SMS section,
     STOP/HELP, "message & data rates may apply", and the mandatory *"we do not share
     mobile opt-in/consent with third parties for marketing"* language — the #1 rejection
     reason).
   - **Terms URL:** `https://tunedyota.com/terms` (SMS program terms).
   - **Opt-in description + screenshot:** the booking form at
     `https://tunedyota.com/find-your-exact-tune` shows the consent line under "Send My
     Request" (contact-by-text disclosure, frequency/rates, STOP/HELP, consent-not-a-
     condition-of-purchase). Provide 2–3 sample messages.
3. **Attach the ported number** to the approved campaign (Messaging Service or number
   assignment).

## 6. Go-live compliance checklist (do NOT skip)
- [ ] Privacy Policy live at `/privacy` with the SMS section — **published**.
- [ ] Terms live at `/terms` with the SMS program terms — **published**.
- [ ] Booking-form consent line references Privacy + Terms — **published**.
- [ ] A2P brand + campaign **approved** (check Console status; can take hours–days).
- [ ] Ported number attached to the approved campaign.
- [ ] **STOP/HELP** honored: Twilio Advanced Opt-Out handles STOP/START/HELP by default
      — confirm it is **enabled** on the number/Messaging Service (do not disable).
- [ ] Live smoke test (see §3) against 612-406-7117: inbound text → auto-reply + lead;
      chat-escalation SMS → installer cell; installer reply → relay into chat; missed
      call → greeting + forward + voicemail transcript.
- [ ] Send a real test text and confirm no 30034; verify a STOP reply stops further texts.

Keep the published Privacy/Terms in sync with actual practice — any change to what we
text customers must be reflected there before it ships.

## 7. Parked dev tasks — ALL SHIPPED 2026-07-20
1. **STOP/HELP/START inbound guard** ✅ — `smsKeywordType` in `lib/twilio.js`; the webhook
   returns empty TwiML for standalone opt-out/help/resubscribe keywords (no junk lead, no
   relay, no auto-reply — Twilio's Advanced Opt-Out owns those replies). Embedded phrases
   ("please stop by Saturday") still flow through normally.
2. **Messaging Service support in `sendSms`** ✅ — set `TWILIO_MESSAGING_SERVICE_SID` in
   Netlify env after campaign approval (`MGec727e111aecde914cd2178a47c61830`) and sends go
   through the campaign-linked service; unset, it falls back to raw `From`.
3. **Delivery status callback** ✅ — `twilio-status` function: signature-validated, logs
   failed/undelivered sends and Slack-alerts the owner (`SLACK_WEBHOOK_URL`) with the error
   meaning (30034 unregistered-A2P, 30007 carrier-filtered, …). `sendSms` auto-attaches
   `StatusCallback` whenever `TWILIO_PUBLIC_BASE`/`URL` is available.

**On approval day:** paste the Messaging Service SID into `TWILIO_MESSAGING_SERVICE_SID`,
set the branded opt-out/HELP responses in the Messaging Service's Opt-Out Management
(copy in docs/operations/a2p-campaign-content.md), then run the §6 smoke tests.
