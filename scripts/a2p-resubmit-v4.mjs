// A2P 10DLC campaign resubmission — attempt 4 (v4 content, pre-approved edits only).
// v3 was rejected 3x with error 30886 (invalid USE_CASE_DESCRIPTION); a support ticket
// is open asking for reviewer-level specifics. Do NOT run --go until Twilio support
// replies (docs/operations/a2p-campaign-content.md holds the ticket draft + status).
//
// v4 changes vs the live v3 campaign — everything else is byte-identical:
//   1. Description: "existing and prospective Tuned Yota customers" ->
//      "existing Tuned Yota customers" (drops the marketing-flavored "prospective").
//   2. Sample 3: proactive openings offer ("want me to hold one for you?") ->
//      follow-up to a customer-REQUESTED reschedule (clearly customer care).
//
// Usage (env comes from Netlify):
//   netlify dev:exec node scripts/a2p-resubmit-v4.mjs          # dry run: status + payload
//   netlify dev:exec node scripts/a2p-resubmit-v4.mjs --go     # delete FAILED campaign, file v4
//
// --go refuses to touch a campaign that is PENDING/IN_PROGRESS (support may have
// re-queued it) or VERIFIED (approved — set TWILIO_MESSAGING_SERVICE_SID instead).

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const MESSAGING_SERVICE_SID = "MGec727e111aecde914cd2178a47c61830";
const BRAND_SID = "BNc255951cb13aee286ebf5194c0b87e53";

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. Run via: netlify dev:exec node scripts/a2p-resubmit-v4.mjs");
  process.exit(1);
}

const BASE = `https://messaging.twilio.com/v1/Services/${MESSAGING_SERVICE_SID}/Compliance/Usa2p`;
const AUTH = "Basic " + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

const DESCRIPTION_V4 =
  "Tuned Yota (tunedyota.com) is a Toyota and Lexus vehicle-calibration business located in Lakeville, Minnesota. " +
  "WHO SENDS: Tuned Yota staff and its assigned vehicle installers send messages from our registered business number. " +
  "WHO RECEIVES: existing Tuned Yota customers who have opted in by (1) submitting the booking form at tunedyota.com/find-your-exact-tune with a consent disclosure, (2) texting our business number first, or (3) giving us their number in person and asking us to text them. " +
  "WHY: this CUSTOMER_CARE campaign sends conversational and transactional messages only - appointment confirmations and reminders for scheduled calibration installs, scheduling and follow-up about the customer's vehicle or service request, replies to customer questions, and messages relayed between a customer and their assigned installer. " +
  "Message frequency varies with each customer's conversation. Recipients can reply STOP to opt out or HELP for help at any time. We do not send marketing or promotional messages.";

// Unchanged from v3 (matches the live campaign byte-for-byte).
const MESSAGE_FLOW =
  "End users provide express consent to receive text messages in one of three ways: " +
  '(1) By submitting the booking/contact form at https://tunedyota.com/find-your-exact-tune, where they enter their phone number and see this disclosure at the submit button: "By submitting, you agree we may contact you about your request by phone, text, and email. Message frequency varies and message & data rates may apply; reply STOP to opt out, HELP for help. Consent isn\'t a condition of purchase. See our Privacy Policy & Terms." ' +
  "(2) By texting our business line, +1 612-406-7117, which starts the conversation. " +
  "(3) By verbally giving their phone number to staff at an in-person event and asking us to text them. " +
  "Consent is not a condition of any purchase. Mobile opt-in data and consent are never shared with third parties or affiliates. " +
  "Details: https://tunedyota.com/privacy and https://tunedyota.com/terms.";

const MESSAGE_SAMPLES = [
  // 1. auto-reply to an inbound customer text (unchanged)
  "Thanks for texting Tuned Yota! We got your message and a team member will reach out shortly. For the fastest help, reply with your vehicle + what you're after (OTT tune, supercharger, build, or a question). Msg & data rates may apply. Reply STOP to opt out, HELP for help.",
  // 2. appointment confirmation (unchanged)
  "Tuned Yota: You're confirmed for your OTT calibration install on Sat 8/16 at our Rochester, MN event at 10:00 AM. Details: https://tunedyota.com. Reply here with any questions. Reply STOP to opt out.",
  // 3. REFRAMED: reschedule the customer asked for, not an unsolicited openings offer
  "Tuned Yota: Following up on the reschedule you requested - your Tundra calibration install is now Sat 8/23 at our Sioux Falls event at 10:00 AM. Reply here with any questions. Reply STOP to opt out.",
  // 4. installer relay to the customer (unchanged)
  "Tuned Yota (Noah, your installer): Good question - the Med-Spicy tow calibration is a great fit for your setup. Happy to walk you through it. Reply STOP to opt out.",
];

// Non-content fields, mirrored from the live campaign so only the two edits change.
const STATIC_FIELDS = {
  BrandRegistrationSid: BRAND_SID,
  UsAppToPersonUsecase: "CUSTOMER_CARE",
  HasEmbeddedLinks: "true",
  HasEmbeddedPhone: "true",
  OptOutMessage:
    "You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.",
  HelpMessage: "Reply STOP to unsubscribe. Msg&Data Rates May Apply.",
};
const OPT_IN_KEYWORDS = ["Start"];
const OPT_OUT_KEYWORDS = ["OPTOUT", "CANCEL", "END", "QUIT", "UNSUBSCRIBE", "REVOKE", "STOP", "STOPALL"];
const HELP_KEYWORDS = ["HELP", "INFO"];

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: AUTH, ...(init.headers || {}) } });
  const text = await res.text().catch(() => "");
  let json = null;
  try { json = JSON.parse(text); } catch { /* DELETE returns empty body */ }
  return { status: res.status, json, text };
}

const list = await api(`${BASE}?PageSize=50`);
if (list.status !== 200) {
  console.error(`Failed to read campaign status: HTTP ${list.status} ${list.text}`);
  process.exit(1);
}
const existing = list.json.compliance?.[0] ?? null;

if (existing) {
  console.log(`Current campaign: ${existing.sid}`);
  console.log(`  status:  ${existing.campaign_status}`);
  console.log(`  updated: ${existing.date_updated}`);
  for (const e of existing.errors ?? []) console.log(`  error:   ${e.error_code} ${e.description} [${(e.fields || []).join(", ")}]`);
} else {
  console.log("No campaign currently registered on the Messaging Service.");
}

if (!process.argv.includes("--go")) {
  console.log("\n--- DRY RUN (pass --go to submit) ---");
  console.log("\nDescription (v4):\n" + DESCRIPTION_V4);
  console.log("\nSample 3 (v4, reframed):\n" + MESSAGE_SAMPLES[2]);
  console.log("\nAll other fields are byte-identical to the live v3 campaign.");
  console.log("Wait for Twilio support's reply before running --go; if support asks for");
  console.log("different wording, edit this script first (and the doc: docs/operations/a2p-campaign-content.md).");
  process.exit(0);
}

if (existing && existing.campaign_status !== "FAILED") {
  console.error(`\nRefusing to resubmit: campaign status is ${existing.campaign_status}, not FAILED.`);
  console.error(existing.campaign_status === "VERIFIED"
    ? "Campaign is APPROVED - do not delete it. Set TWILIO_MESSAGING_SERVICE_SID and run the go-live checklist (twilio-adapter-activation.md section 6)."
    : "It may be back under review (e.g. support re-queued it). Check again later.");
  process.exit(1);
}

if (existing) {
  const del = await api(`${BASE}/${existing.sid}`, { method: "DELETE" });
  if (del.status !== 204) {
    console.error(`Failed to delete FAILED campaign ${existing.sid}: HTTP ${del.status} ${del.text}`);
    process.exit(1);
  }
  console.log(`\nDeleted FAILED campaign ${existing.sid}.`);
}

const form = new URLSearchParams();
for (const [k, v] of Object.entries(STATIC_FIELDS)) form.append(k, v);
form.append("Description", DESCRIPTION_V4);
form.append("MessageFlow", MESSAGE_FLOW);
for (const s of MESSAGE_SAMPLES) form.append("MessageSamples", s);
for (const k of OPT_IN_KEYWORDS) form.append("OptInKeywords", k);
for (const k of OPT_OUT_KEYWORDS) form.append("OptOutKeywords", k);
for (const k of HELP_KEYWORDS) form.append("HelpKeywords", k);

const create = await api(BASE, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
if (create.status !== 201) {
  console.error(`Submission FAILED: HTTP ${create.status} ${create.text}`);
  process.exit(1);
}
console.log(`\nSubmitted v4 campaign: ${create.json.sid} (status: ${create.json.campaign_status})`);
console.log("TCR vetting takes 1-7 business days. Recheck with the dry run of this script.");
console.log("On approval: set TWILIO_MESSAGING_SERVICE_SID, set branded opt-out/HELP copy in");
console.log("Opt-Out Management, then run the section 6 smoke tests (twilio-adapter-activation.md).");
