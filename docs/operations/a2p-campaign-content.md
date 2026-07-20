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

## Campaign description
> Tuned Yota sends conversational and transactional text messages to customers who
> contact us about our vehicle-tuning services. Messages include appointment
> confirmations and reminders, scheduling and follow-up about a customer's build or
> service, replies to customer questions, and messages relayed between a customer and
> their assigned installer. We only message people who have contacted us or given us
> their number for this purpose. We do not send promotional or marketing content.

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
   > Rochester, MN event at 10:00 AM. Reply here with any questions. Reply STOP to opt out.
3. *(scheduling follow-up)*
   > Hi from Tuned Yota — following up on your Tundra tune. We have two openings at the
   > Sioux Falls event next weekend; want me to hold one for you? Reply STOP to opt out.
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
