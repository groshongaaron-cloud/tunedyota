// A2P 10DLC campaign fix — attempt 5: add the required policy-URL fields.
// v4 (2026-07-22) cleared the 3x-rejected 30886 description but was rejected with
// 30882 [TERMS_AND_CONDITIONS_URL] + 30908 [PRIVACY_POLICY_URL]: TCR now requires
// TermsAndConditionsUrl and PrivacyPolicyUrl as explicit campaign fields on new
// submissions, and v4's create never sent them (the URLs only appeared inside the
// MessageFlow text). Both pages are live, public, and carrier-compliant (SMS
// sections hardened same day: canonical no-share/sell sentence in /privacy, no
// affiliate-marketing sentence in /terms).
//
// This script EDITS the existing FAILED campaign in place (no delete/recreate):
// POST to the Usa2p instance with the two URL fields. AgeGated/DirectLending are
// included because campaign edits have required them before (v2, 2026-07-20).
//
// Usage (env comes from Netlify; note the -- separator so netlify keeps the flag):
//   netlify dev:exec -- node scripts/a2p-fix-url-fields.mjs        # dry run
//   netlify dev:exec -- node scripts/a2p-fix-url-fields.mjs --go   # resubmit
//
// --go refuses unless the campaign status is FAILED.

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const MESSAGING_SERVICE_SID = "MGec727e111aecde914cd2178a47c61830";
const CAMPAIGN_SID = "QE2c6890da8086d771620e9b13fadeba0b";

const TERMS_URL = "https://tunedyota.com/terms";
const PRIVACY_URL = "https://tunedyota.com/privacy";

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. Run via: netlify dev:exec -- node scripts/a2p-fix-url-fields.mjs");
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

// Both URLs must be live and public before resubmitting — TCR fetches them.
for (const u of [TERMS_URL, PRIVACY_URL]) {
  const r = await fetch(u);
  if (!r.ok) {
    console.error(`ABORT: ${u} answered HTTP ${r.status} — fix the page/deploy first.`);
    process.exit(1);
  }
}
console.log("Both policy URLs answer 200.");

const cur = await api(`${BASE}/${CAMPAIGN_SID}`);
if (cur.status !== 200) {
  console.error(`Cannot read campaign: HTTP ${cur.status} ${cur.text}`);
  process.exit(1);
}
console.log(`Campaign ${CAMPAIGN_SID}: ${cur.json.campaign_status}`);
for (const e of cur.json.errors || []) console.log(`  error ${e.error_code} [${(e.fields || []).join(",")}]`);

if (!process.argv.includes("--go")) {
  console.log("\n--- DRY RUN (pass --go to resubmit) ---");
  console.log(`Would POST: TermsAndConditionsUrl=${TERMS_URL}`);
  console.log(`            PrivacyPolicyUrl=${PRIVACY_URL}`);
  console.log("            AgeGated=false, DirectLending=false");
  process.exit(0);
}

if (cur.json.campaign_status !== "FAILED") {
  console.error(`Refusing to edit: campaign status is ${cur.json.campaign_status}, not FAILED.`);
  process.exit(1);
}

const form = new URLSearchParams();
form.append("TermsAndConditionsUrl", TERMS_URL);
form.append("PrivacyPolicyUrl", PRIVACY_URL);
form.append("AgeGated", "false");
form.append("DirectLending", "false");

const upd = await api(`${BASE}/${CAMPAIGN_SID}`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: form.toString(),
});
if (upd.status !== 200 && upd.status !== 201) {
  console.error(`Edit FAILED: HTTP ${upd.status} ${upd.text}`);
  console.error("If the param is rejected as unknown, resubmit via Console instead:");
  console.error("Messaging > Services > US A2P Compliance > Edit campaign, fill the two URL fields.");
  process.exit(1);
}
console.log(`\nResubmitted: status ${upd.json.campaign_status}`);
console.log("TCR vetting takes 1-7 business days; the hourly watcher Slacks on any change.");
