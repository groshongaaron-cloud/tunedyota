// netlify/functions/chat-harvest.js
// Scheduled sweep (owner directives 2026-08-02): EVERY person who reaches out
// is a CRM data point. A quiet, never-escalated chat/DM session becomes a
// Stage-New lead carrying WHO (name — session's, else the Meta profile's),
// HOW they reached out (Channel facebook/instagram/chat), and WHAT they asked
// (their questions, stamped into Client Notes).
//   - fb/ig sessions mint a lead even with no phone: the platform itself is the
//     contact route ("Chat Session" holds the thread id; Meta's 24h messaging
//     window applies to proactive replies)
//   - widget sessions still need a phone — no reply route once the tab closes
//   - escalated sessions already made a lead at transfer; sms: threads ingest
//     leads on inbound text (twilio-sms.js)
//   - one-shot "Harvested Lead" stamp; skip:no-contact stamps from the v1
//     phone-only sweep are re-considered under capture-all
const { cfg, listAllRecords, updateRecord, createRecord, createTolerant, updateTolerant } = require("./lib/airtable.js");
const { processLeadIngest, logLine, appendActivity } = require("./lib/leads.js");
const { getProfile } = require("./lib/meta-graph.js");

const TABLE = (env) => env.AIRTABLE_CHAT_TABLE || "Chat Sessions";
const QUIET_MS = 12 * 3600 * 1000;         // conversation has gone quiet
const LOOKBACK_MS = 60 * 86400 * 1000;     // don't backfill ancient history
const MAX_PER_RUN = 25;                    // gentle on Airtable + the Leads tab
const PLATFORM_LABEL = { facebook: "Messenger", instagram: "Instagram" };

// The customer's own questions, from the stored transcript JSON. Question-marked
// user turns first; if they never phrased a question, their opening message.
function extractQuestions(transcriptJson) {
  let turns = [];
  try { turns = JSON.parse(transcriptJson || "[]"); } catch { return []; }
  if (!Array.isArray(turns)) return [];
  const user = turns.filter((t) => t && t.role === "user" && String(t.text || "").trim());
  const qs = user.filter((t) => String(t.text).includes("?")).map((t) => String(t.text).trim());
  const picked = (qs.length ? qs : user.slice(0, 1).map((t) => String(t.text).trim()))
    .map((s) => s.slice(0, 200));
  return [...new Set(picked)].slice(0, 3);
}

function questionNotes(questions, now) {
  return questions.reduce((acc, q) => appendActivity(acc, logLine(now, `asked: ${q}`)), "");
}

async function runHarvest(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now || new Date();
  const list = deps.list || ((a) => listAllRecords({ ...a }));
  const update = deps.update || ((a) => updateRecord({ ...a }));
  const create = deps.create || ((a) => createRecord({ ...a }));
  const ingest = deps.ingest || ((b) => processLeadIngest(b, { env }));
  const profile = deps.profile || ((id) => getProfile(id, { env }));
  const c = cfg(env);

  let recs = [];
  try { recs = await list({ token: c.token, baseId: c.baseId, table: TABLE(env) }); }
  catch (e) { return { harvested: 0, error: "store-unavailable" }; }

  const cutFresh = now.getTime() - QUIET_MS, cutOld = now.getTime() - LOOKBACK_MS;
  const due = recs.filter((r) => {
    const f = r.fields || {};
    if ((f.Status || "ai") !== "ai") return false;
    const mark = String(f["Harvested Lead"] || "").trim();
    if (mark && mark !== "skip:no-contact") return false;   // v1 phone-only skips get a second look
    if (/^sms:/.test(String(f["Session ID"] || ""))) return false;
    const t = Date.parse(f["Last Activity"] || "");
    return !isNaN(t) && t <= cutFresh && t >= cutOld;
  }).slice(0, MAX_PER_RUN);

  let harvested = 0, skipped = 0;
  for (const r of due) {
    const f = r.fields || {};
    const stamp = (v) => update({ token: c.token, baseId: c.baseId, table: TABLE(env), id: r.id,
      fields: { "Harvested Lead": v } }).catch(() => {});
    const sid = String(f["Session ID"] || "");
    const page = String(f["Page Context"] || "");
    const isDm = page === "facebook" || page === "instagram";
    const channel = isDm ? page : "chat";
    const phone = String(f.Phone || "").trim();
    const notes = questionNotes(extractQuestions(f.Transcript), now);

    if (phone) {
      // Normalized gate: dedupes against active leads by phone. Then the
      // questions + thread ref ride onto whichever record it touched.
      const out = await ingest({
        name: String(f["Customer Name"] || "").trim() || `Chat ${phone}`,
        phone, channel, source: `chat-harvest:${channel}`,
        city: f.City || "", vehicle: f.Vehicle || "",
        message: `quiet chat harvested (session ${sid || r.id})`,
      }).catch(() => null);
      if (out && out.recordId) {
        const patch = { "Chat Session": sid };
        if (notes) patch["Client Notes"] = notes;
        await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority,
          id: out.recordId, fields: patch }, ["Chat Session", "Client Notes"]).catch(() => {});
        await stamp(out.recordId); harvested++;
      } else { await stamp("error"); skipped++; }
      continue;
    }

    if (!isDm) { await stamp("skip:no-contact"); skipped++; continue; }

    // Phone-less DM: the platform is the contact route. Real name from the
    // session, else the Meta profile; else a reachable-route placeholder that
    // isPlaceholderName recognizes so a later real name upgrades it.
    const senderId = sid.replace(/^(fb|ig):/, "").replace(/:\d+$/, "");
    let name = String(f["Customer Name"] || "").trim();
    if (!name) name = (await profile(senderId).catch(() => null)) || "";
    if (!name) name = `Chat (${PLATFORM_LABEL[channel]}) ${sid}`;
    const fields = { Name: name, City: f.City || "Unassigned", Vehicle: f.Vehicle || "",
      Channel: channel, Source: `chat-harvest:${channel}`, Stage: "New",
      "Chat Session": sid,
      "Last Contact": new Date(now).toISOString().slice(0, 10),
      "Activity Log": logLine(now, `${channel}: quiet DM harvested (session ${sid || r.id}) — no phone/email captured; reply via the DM thread`),
      ...(notes ? { "Client Notes": notes } : {}) };
    const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
      ["Chat Session", "Client Notes", "Source", "Channel", "Activity Log", "Last Contact"]).catch(() => null);
    if (rec && rec.id) { await stamp(rec.id); harvested++; }
    else { await stamp("error"); skipped++; }
  }
  return { harvested, skipped, scanned: due.length };
}

async function handler() {
  const out = await runHarvest({});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, runHarvest, extractQuestions };
