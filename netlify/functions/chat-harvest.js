// netlify/functions/chat-harvest.js
// Scheduled sweep (owner directive 2026-08-02): a chat/DM conversation that
// captured contact info but never escalated is a warm identified prospect —
// mint it as a Stage-New lead tagged to its platform instead of letting it
// evaporate in the Chat Sessions table.
//   - escalated sessions already made a lead at transfer time (chat.js escalate)
//   - sms: sessions already ingest a lead per inbound text (twilio-sms.js)
//   - each session is considered exactly once ("Harvested Lead" stamp)
//   - phone-less sessions are stamped skip:no-contact (nothing to dedupe or dial;
//     they stay reachable in the console's Chats tab)
const { cfg, listAllRecords, updateRecord } = require("./lib/airtable.js");
const { processLeadIngest } = require("./lib/leads.js");

const TABLE = (env) => env.AIRTABLE_CHAT_TABLE || "Chat Sessions";
const QUIET_MS = 12 * 3600 * 1000;         // conversation has gone quiet
const LOOKBACK_MS = 60 * 86400 * 1000;     // don't backfill ancient history
const MAX_PER_RUN = 25;                    // gentle on Airtable + the Leads tab

async function runHarvest(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const update = deps.update || ((a) => updateRecord({ ...a }));
  const ingest = deps.ingest || ((b) => processLeadIngest(b, { env }));
  const c = cfg(env);

  let recs = [];
  try { recs = await list({ token: c.token, baseId: c.baseId, table: TABLE(env) }); }
  catch (e) { return { harvested: 0, error: "store-unavailable" }; }

  const cutFresh = now.getTime() - QUIET_MS, cutOld = now.getTime() - LOOKBACK_MS;
  const due = recs.filter((r) => {
    const f = r.fields || {};
    if ((f.Status || "ai") !== "ai") return false;
    if (String(f["Harvested Lead"] || "").trim()) return false;
    if (/^sms:/.test(String(f["Session ID"] || ""))) return false;
    const t = Date.parse(f["Last Activity"] || "");
    return !isNaN(t) && t <= cutFresh && t >= cutOld;
  }).slice(0, MAX_PER_RUN);

  let harvested = 0, skipped = 0;
  for (const r of due) {
    const f = r.fields || {};
    const stamp = async (v) => update({ token: c.token, baseId: c.baseId, table: TABLE(env), id: r.id,
      fields: { "Harvested Lead": v } }).catch(() => {});
    const phone = String(f.Phone || "").trim();
    if (!phone) { await stamp("skip:no-contact"); skipped++; continue; }
    const page = String(f["Page Context"] || "");
    const channel = page === "facebook" || page === "instagram" ? page : "chat";
    const out = await ingest({
      name: String(f["Customer Name"] || "").trim() || `Chat ${phone}`,
      phone, channel, source: `chat-harvest:${channel}`,
      city: f.City || "", vehicle: f.Vehicle || "",
      message: `quiet chat harvested (session ${f["Session ID"] || r.id})`,
    }).catch(() => null);
    if (out && out.recordId) { await stamp(out.recordId); harvested++; }
    else { await stamp("error"); skipped++; }
  }
  return { harvested, skipped, scanned: due.length };
}

async function handler() {
  const out = await runHarvest({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runHarvest };
