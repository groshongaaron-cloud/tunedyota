// netlify/functions/ott-reply-sweep.js
// Scheduled: for each OTT-national lead whose converted booking is Completed and whose
// OTT reply hasn't been sent, reply in the original email thread and stamp the lead.
const { cfg, listAllRecords, getRecord, updateTolerant, updateRecord } = require("./lib/airtable.js");
const gmailLib = require("./lib/gmail.js");

function buildReplyBody(bf) {
  const veh = bf.Vehicle || "vehicle"; const inst = bf.Installer || "our installer";
  const date = (bf["Calibration Date"] || bf["Event Date"] || "").slice(0, 10);
  return `Hi John — this lead has been completed. The customer's ${veh} was tuned${date ? " on " + date : ""} by ${inst} at Tuned Yota (an OTT retailer). Thanks!\n\n— Aaron, Tuned Yota`;
}

async function runReplySweep(deps = {}) {
  const env = deps.env || process.env;
  const today = deps.today || new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const c = cfg(env);
  const gmail = deps.gmail || gmailLib;
  const listLeads = deps.listLeadsImpl || ((a) => listAllRecords({ ...a }));
  const getBooking = deps.getBookingImpl || ((a) => getRecord({ ...a }));
  const updateLead = deps.updateLeadImpl || ((a) => updateRecord({ ...a }));
  let leads;
  try { leads = await listLeads({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { return { replied: 0, error: "store-unavailable" }; }
  let replied = 0;
  for (const l of leads) {
    const f = l.fields || {};
    if (!f["Email Thread"] || f["OTT Reply Sent"] || !f["Converted Booking"]) continue;
    let bk;
    try { bk = await getBooking({ token: c.token, baseId: c.baseId, table: c.bookings, id: f["Converted Booking"] }); }
    catch (e) { continue; }
    if (!bk || (bk.fields || {}).Status !== "Completed") continue;
    try {
      await gmail.sendReply({ threadId: f["Email Thread"], to: f["Reply-To"] || "",
        inReplyTo: f["Email Message-Id"] || "", references: f["Email Message-Id"] || "",
        subject: "Re: A New Lead From Facebook Ads", body: buildReplyBody(bk.fields || {}) }, { env });
      await updateTolerant(updateLead, { token: c.token, baseId: c.baseId, table: c.priority, id: l.id,
        fields: { "OTT Reply Sent": today } }, ["OTT Reply Sent"]);
      replied++;
    } catch (e) { /* leave unstamped → retried next run */ }
  }
  return { replied, scanned: leads.length };
}
async function handler() { const out = await runReplySweep({}); return { statusCode: 200, body: JSON.stringify(out) }; }
module.exports = { handler, runReplySweep, buildReplyBody };
