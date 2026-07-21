# A2P 10DLC Campaign — Registration Content (copy/paste)

Everything to paste into the Twilio/TCR campaign form. Use with
[twilio-adapter-activation.md §5–6](twilio-adapter-activation.md). Keep this in sync
with what we actually text and with `/privacy` + `/terms`.

## A2P 10DLC — overview & vetting (reference)
A **Campaign** defines the type of messages we send (for us: customer care —
conversational + transactional). It is tied to our registered A2P **Brand** and linked
through a **Messaging Service**, where our 10DLC number(s) are assigned for higher
deliverability and to avoid carrier penalties on unregistered traffic.

Every Campaign is **vetted by The Campaign Registry (TCR)** — typically **1–7 business
days** for standard use cases. TCR assigns a **trust score** that affects throughput and
eligibility, based on Brand verification, messaging history, campaign type, volume/
throughput patterns, and risk indicators. Some special use cases qualify for higher
throughput or reduced fees but need extra approvals.

**Required information to complete registration → where ours lives:**
| Required item | Our content |
| --- | --- |
| Use case type | Customer Care (below) |
| Campaign description | § Campaign description |
| Sample messages | § Sample messages |
| Message contents: embedded links, privacy-policy link, terms link | https://tunedyota.com/privacy · https://tunedyota.com/terms (referenced in samples + CTA) |
| End-user consent details | § Opt-in / Call-to-Action |
| Opt-in / opt-out / help keywords + messages | § Opt-in keywords + confirmation · § Opt-out (STOP) · § HELP |

---

- **Business / Brand:** Tuned Yota — Toyota & Lexus performance tuning (Authorized OTT
  installer, Magnuson dealer, Authorized AMSOIL dealer). Website: https://tunedyota.com
- **Number:** +1 612-406-7117
- **Use case:** Customer Care (conversational + transactional). **Not** marketing.

## STATUS 2026-07-20: v3 REJECTED (attempt 3, still 30886 only — confirmed via API).
## Per the 3-attempt rule: escalate to Twilio SUPPORT TICKET (draft below), do NOT
## blind-edit a 4th time. Suspected cause: "prospective customers" + sample 3's
## proactive sales follow-up read as MARKETING inside a CUSTOMER_CARE campaign.

## STATUS 2026-07-21: v4 PREPARED, NOT FILED — waiting on the support ticket reply.
## Pre-approved edits (only two changes vs v3, everything else byte-identical):
##   1. Description WHO RECEIVES: drop "and prospective" → "existing Tuned Yota customers".
##   2. Sample 3: proactive openings offer → follow-up to a customer-REQUESTED reschedule
##      (see § Sample messages, v4 alternative under sample 3).
## Submit: `netlify dev:exec node scripts/a2p-resubmit-v4.mjs` (dry run), then `--go`.
## The script refuses to touch a campaign that is under review or already VERIFIED.
## If support's reply asks for different wording, edit the script + this doc first.

## Twilio support ticket draft (file at help.twilio.com → Messaging → A2P 10DLC)
> Subject: A2P 10DLC campaign rejected 3x with error 30886 only — request specific
> guidance on USE_CASE_DESCRIPTION
>
> Account SID: AC470…3f6 (paste the full SID from the rejection email / Twilio Console — GitHub push protection bars committing it verbatim)
> Messaging Service: MGec727e111aecde914cd2178a47c61830
> Campaign: QE2c6890da8086d771620e9b13fadeba0b (TCR CMd54223c92466ff7e01967f327d3bb495)
> Brand: BNc255951cb13aee286ebf5194c0b87e53 (approved/verified) · Use case: CUSTOMER_CARE
>
> Our campaign has been rejected three times. After fixing all other errors from the
> first review (30893/30907/30909 resolved — website, CTA, and samples now pass), the
> last two rejections cite ONLY error 30886 (invalid campaign description), most
> recently on 2026-07-20 at 07:01 UTC. The current description states mechanically who
> sends (Tuned Yota staff/installers from our registered business number), who receives
> (customers who opted in via our web form with consent disclosure, by texting us
> first, or by in-person request), and why (appointment confirmations/reminders,
> scheduling and service follow-ups, replies to questions, installer-customer relay),
> plus frequency, STOP/HELP, and a no-marketing statement.
>
> Could you tell us specifically which part of the USE_CASE_DESCRIPTION is failing
> vetting? In particular: does the phrase "existing and prospective customers," or a
> sample message offering appointment openings, conflict with the CUSTOMER_CARE use
> case? We are happy to edit the description and samples to whatever the reviewer
> needs — we would just like reviewer-level specifics rather than a fourth guess, and
> a manual re-review once corrected.

## Campaign description (v3, filed 2026-07-20 — v2 was rejected w/ 30886; TCR wants
## WHO SENDS / WHO RECEIVES / WHY stated mechanically, not implied)
> Tuned Yota (tunedyota.com) is a Toyota and Lexus vehicle-calibration business located
> in Lakeville, Minnesota. WHO SENDS: Tuned Yota staff and its assigned vehicle
> installers send messages from our registered business number. WHO RECEIVES: existing
> and prospective Tuned Yota customers who have opted in by (1) submitting the booking
> form at tunedyota.com/find-your-exact-tune with a consent disclosure, (2) texting our
> business number first, or (3) giving us their number in person and asking us to text
> them. WHY: this CUSTOMER_CARE campaign sends conversational and transactional messages
> only - appointment confirmations and reminders for scheduled calibration installs,
> scheduling and follow-up about the customer's vehicle or service request, replies to
> customer questions, and messages relayed between a customer and their assigned
> installer. Message frequency varies with each customer's conversation. Recipients can
> reply STOP to opt out or HELP for help at any time. We do not send marketing or
> promotional messages.

## Opt-in / Call-to-Action / message flow  (most-scrutinized field — paste verbatim)
> End users provide express consent to receive text messages in one of three ways:
> (1) By submitting the booking/contact form at
> https://tunedyota.com/find-your-exact-tune, where they enter their phone number and
> see this disclosure at the submit button: "By submitting, you agree we may contact you
> about your request by phone, text, and email. Message frequency varies and message &
> data rates may apply; reply STOP to opt out, HELP for help. Consent isn't a condition
> of purchase. See our Privacy Policy & Terms."
> (2) By texting our business line, +1 612-406-7117, which starts the conversation.
> (3) By verbally giving their phone number to staff at an in-person event and asking us
> to text them.
> Consent is not a condition of any purchase. Mobile opt-in data and consent are never
> shared with third parties or affiliates. Details: https://tunedyota.com/privacy and
> https://tunedyota.com/terms.

- **Opt-in type(s) to check:** Web form · Verbal · Existing customer conversation.

## Sample messages (paste 3–4)
1. *(auto-reply to an inbound customer text)*
   > Thanks for texting Tuned Yota! We got your message and a team member will reach out
   > shortly. For the fastest help, reply with your vehicle + what you're after (OTT tune,
   > supercharger, build, or a question). Msg & data rates may apply. Reply STOP to opt
   > out, HELP for help.
2. *(appointment confirmation)*
   > Tuned Yota: You're confirmed for your OTT calibration install on Sat 8/16 at our
   > Rochester, MN event at 10:00 AM. Details: https://tunedyota.com. Reply here with any
   > questions. Reply STOP to opt out.
3. *(scheduling follow-up — v3, REJECTED wording; kept for the support-ticket reference)*
   > Hi from Tuned Yota — following up on your Tundra tune. We have two openings at the
   > Sioux Falls event next weekend; want me to hold one for you? Reply STOP to opt out.

   *(v4 alternative — responds to a reschedule the CUSTOMER requested; use this on resubmit)*
   > Tuned Yota: Following up on the reschedule you requested — your Tundra calibration
   > install is now Sat 8/23 at our Sioux Falls event at 10:00 AM. Reply here with any
   > questions. Reply STOP to opt out.
4. *(installer relay to the customer)*
   > Tuned Yota (Noah, your installer): Good question — the Med-Spicy tow calibration is a
   > great fit for your setup. Happy to walk you through it. Reply STOP to opt out.

## Opt-out (STOP) response
> You're unsubscribed from Tuned Yota texts and won't receive more messages. Reply START
> to resubscribe, or call (612) 406-7117.

## HELP response
> Tuned Yota: for help, call or text (612) 406-7117 or email info@tunedyota.com. Msg &
> data rates may apply. Reply STOP to unsubscribe.

## Opt-in / resubscribe keywords + confirmation
Twilio US defaults (leave enabled) — these resubscribe a user who previously texted STOP.
We do **not** run a text-to-join keyword campaign; primary opt-in is the web form, an
inbound text, or a verbal in-person request.
- **Keywords:** START · YES · UNSTOP
- **Opt-in confirmation message (paste):**
  > Tuned Yota: You're re-subscribed and will receive text updates about your requests
  > again. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
- **Tight-limit alternative:**
  > Tuned Yota: You're subscribed. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

## Message frequency
> Message frequency varies based on the customer's conversation with us (conversational).

---
## Where the disclosures live (all shipped 2026-07-20)
Consent + opt-out language is consistent across every customer touchpoint carriers may
cross-check:
- **Privacy Policy** https://tunedyota.com/privacy · **Terms** https://tunedyota.com/terms
- **Booking form** (`find-your-exact-tune`) — consent line at the submit button.
- **Chat widget** (`site/chat.js`) — fine-print disclosure under the input.
- **Inbound auto-reply** (`netlify/functions/twilio-sms.js`) — now carries the
  "Msg & data rates may apply. Reply STOP to opt out, HELP for help." footer.
- **Customer emails** (`lib/templates.js`) — booking, lead, waitlist, and reminder each
  carry the SMS opt-out line + Privacy link.

Guarded by `tests/legal-compliance.test.js`. Keep this doc in sync with the live copy —
any change to what we text customers must be reflected in `/privacy` + `/terms` first.
