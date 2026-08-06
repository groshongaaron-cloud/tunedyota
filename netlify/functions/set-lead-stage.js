// netlify/functions/set-lead-stage.js
// Set a lead's pipeline Stage from the chat thread header — the Status selector
// aligns the conversation with the Leads tab (owner ask 2026-08-06). The Priority
// List is the single source of truth for stage; a person without an active lead
// gets one created (find-or-create via processLeadIngest) so the status has a home
// and shows up in Leads. Mirrors set-nudge.js exactly, swapping the setFollowup
// branch for setStage — one code path for "how a lead field is written."
const { cfg, getRecord, updateRecord, updateTolerant } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView, applyLeadUpdate, processLeadIngest, STAGES } = require("./lib/leads.js");
const { withCors } = require("./lib/cors.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  if ((event.httpMethod || "POST") !== "POST") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const stage = String(body.stage || "").trim();
  // Validate up front so a bad stage never creates a lead.
  if (!STAGES.includes(stage)) return { statusCode: 400, body: JSON.stringify({ error: "bad-stage" }) };

  const c = cfg(env);
  const getImpl = ctx.getImpl || ((a) => getRecord({ ...a }));
  const updateImpl = ctx.updateImpl || ((a) => updateRecord({ ...a }));
  const ingest = ctx.ingestImpl || ((b) => processLeadIngest(b, { env, now }));

  // Resolve the lead: an explicit id, else find-or-create one for the person.
  let leadId = String(body.leadId || "").trim();
  if (!leadId) {
    const name = String(body.name || "").trim() || String(body.phone || "").trim() || String(body.email || "").trim();
    let r;
    try { r = await ingest({ name, phone: body.phone || "", email: body.email || "", vehicle: body.vehicle || "",
      city: body.city || "", channel: body.channel || "chat", source: "chat-status", message: "status set from chat" }); }
    catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
    if (!r || r.status === "error" || !r.recordId) return { statusCode: 400, body: JSON.stringify({ error: (r && r.error) || "no-lead" }) };
    leadId = r.recordId;
  }

  let rec;
  try { rec = await getImpl({ token: c.token, baseId: c.baseId, table: c.priority, id: leadId }); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  const lead = toLeadView(rec);
  // Staging is a real pipeline action, so — like lead-update.js — a non-admin may
  // not re-stage a lead assigned to a DIFFERENT installer. An unassigned lead is
  // fair game (the installer handling the chat is claiming the disposition).
  if (!admin && lead.installer && lead.installer !== key) return { statusCode: 400, body: JSON.stringify({ error: "not-your-market" }) };

  const built = applyLeadUpdate(lead, "setStage", { stage }, now);
  if (built.error) return { statusCode: 400, body: JSON.stringify({ error: built.error }) };
  try {
    await updateTolerant(updateImpl, { token: c.token, baseId: c.baseId, table: c.priority, id: leadId, fields: built.fields },
      ["Stage", "Activity Log"]);
  } catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", leadId, stage }) };
}
module.exports = { handler: withCors(handler) };
