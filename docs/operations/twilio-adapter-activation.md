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

## 7. Parked dev tasks (future session — not blocking registration)
Low-risk code hardening, deferred 2026-07-20. None block A2P registration (Console work).
1. **STOP/HELP/START inbound guard** — `twilio-sms.js` has no keyword handling; add a guard
   that returns empty TwiML for opt-out/help/resubscribe keywords (no junk lead, no auto-reply).
2. **Messaging Service support in `sendSms`** — env-gate `TWILIO_MESSAGING_SERVICE_SID`; send
   via `MessagingServiceSid` when set, fall back to `From`. Paste the SID after approval.
3. **(optional) Delivery status callback** — a `twilio-status` function logging failed sends
   (30034/30007) for monitoring.
