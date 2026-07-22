// A2P 10DLC campaign resubmission — attempt 6: tie the description to the
// registered brand. Four different descriptions have been rejected with 30886;
// the confirmed root cause (2026-07-22 eve, via Trust Hub API) is that the TCR
// brand's business_name is the legal entity "1st Minnesota Lending, LLC" while
// every description talked only about "Tuned Yota" — reading to a vetter as a
// brand/description mismatch ("make sure the description matches your
// registered brand details"). v6 = v4/v5 content verbatim, with an opening
// sentence declaring Tuned Yota as the LLC's registered DBA. The policy URLs
// (attempt 5's fix, errors since cleared) are re-sent unchanged.
//
// Usage (note the -- separator so netlify keeps the flag):
//   netlify dev:exec -- node scripts/a2p-resubmit-v6-dba.mjs        # dry run
//   netlify dev:exec -- node scripts/a2p-resubmit-v6-dba.mjs --go   # resubmit
//
// --go refuses unless the campaign status is FAILED. Edits IN PLACE (no delete).
// If v6 is ALSO rejected 30886: STOP — file the support ticket
// (docs/operations/a2p-campaign-content.md) with the full six-attempt history.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const MESSAGING_SERVICE_SID = "MGec727e111aecde914cd2178a47c61830";
const CAMPAIGN_SID = "QE2c6890da8086d771620e9b13fadeba0b";
const TERMS_URL = "https://tunedyota.com/terms";
const PRIVACY_URL = "https://tunedyota.com/privacy";

const DESCRIPTION_V6 =
  "Tuned Yota is the registered DBA (doing-business-as) name of 1st Minnesota Lending, LLC, the registered brand on this campaign; all messaging is sent under the Tuned Yota name from its website tunedyota.com. " +
  "Tuned Yota (tunedyota.com) is a Toyota and Lexus vehicle-calibration business located in Lakeville, Minnesota. " +
  "WHO SENDS: Tuned Yota staff and its assigned vehicle installers send messages from our registered business number. " +
  "WHO RECEIVES: existing Tuned Yota customers who have opted in by (1) submitting the booking form at tunedyota.com/find-your-exact-tune with a consent disclosure, (2) texting our business number first, or (3) giving us their number in person and asking us to text them. " +
  "WHY: this CUSTOMER_CARE campaign sends conversational and transactional messages only - appointment confirmations and reminders for scheduled calibration installs, scheduling and follow-up about the customer's vehicle or service request, replies to customer questions, and messages relayed between a customer and their assigned installer. " +
  "Message frequency varies with each customer's conversation. Recipients can reply STOP to opt out or HELP for help at any time. We do not send marketing or promotional messages.";

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. Run via: netlify dev:exec -- node scripts/a2p-resubmit-v6-dba.mjs");
  process.exit(1);
}
const BASE = `https://messaging.twilio.com/v1/Services/${MESSAGING_SERVICE_SID}/Compliance/Usa2p`;
const AUTH = "Basic " + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: AUTH, ...(init.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json };
}

const cur = await api(`${BASE}/${CAMPAIGN_SID}`);
if (cur.status !== 200) { console.error(`Cannot read campaign: HTTP ${cur.status} ${cur.text}`); process.exit(1); }
console.log(`Campaign ${CAMPAIGN_SID}: ${cur.json.campaign_status}`);
for (const e of cur.json.errors || []) console.log(`  error ${e.error_code} [${(e.fields || []).join(",")}]`);

if (!process.argv.includes("--go")) {
  console.log("\n--- DRY RUN (pass --go to resubmit) ---");
  console.log("Description (v6, first sentence new, rest byte-identical to v4/v5):\n" + DESCRIPTION_V6.slice(0, 220) + "…");
  process.exit(0);
}
if (cur.json.campaign_status !== "FAILED") {
  console.error(`Refusing to edit: campaign status is ${cur.json.campaign_status}, not FAILED.`);
  process.exit(1);
}

const form = new URLSearchParams();
form.append("Description", DESCRIPTION_V6);
form.append("MessageFlow", cur.json.message_flow);
for (const s of cur.json.message_samples || []) form.append("MessageSamples", s);
form.append("HasEmbeddedLinks", String(cur.json.has_embedded_links));
form.append("HasEmbeddedPhone", String(cur.json.has_embedded_phone));
form.append("TermsAndConditionsUrl", TERMS_URL);
form.append("PrivacyPolicyUrl", PRIVACY_URL);
form.append("AgeGated", "false");
form.append("DirectLending", "false");

const upd = await api(`${BASE}/${CAMPAIGN_SID}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
if (upd.status !== 200 && upd.status !== 201) { console.error(`Edit FAILED: HTTP ${upd.status} ${upd.text}`); process.exit(1); }
console.log(`\nResubmitted v6: status ${upd.json.campaign_status}`);
console.log("If rejected 30886 again: file the support ticket — six attempts is the hard stop.");
