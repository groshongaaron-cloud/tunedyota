# A2P 10DLC Campaign — Registration Content (copy/paste)

Everything to paste into the Twilio/TCR campaign form. Use with
[twilio-adapter-activation.md §5–6](twilio-adapter-activation.md). Keep this in sync
with what we actually text and with `/privacy` + `/terms`.

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

## Message frequency
> Message frequency varies based on the customer's conversation with us (conversational).

---
**Note — recommended code tweak for consistency:** our live auto-reply
(`netlify/functions/twilio-sms.js`, `REPLY`) does not yet include the "Reply STOP to opt
out, HELP for help. Msg & data rates may apply." footer shown in sample #1. Twilio
Advanced Opt-Out still honors STOP/HELP, but adding the footer to the *first* message to a
new contact is best practice and makes the sample match production. Low-risk one-line
change — do before or right after approval.
