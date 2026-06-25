// First-party funnel-step beacon sink. Writes one Funnel Events row per step.
// Always 204 (beacons ignore the response); never throws into the request.
const { cfg, createRecord } = require("./lib/airtable.js");

async function processTrack(body, deps) {
  const { fetchImpl = fetch, create = (a) => createRecord({ fetchImpl, ...a }), env = process.env, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { stored: false, reason: "bot" };
  if (!d.sid || typeof d.step !== "number") return { stored: false, reason: "invalid" };
  const c = cfg(env);
  const table = env.AIRTABLE_FUNNEL_TABLE || "Funnel Events";
  try {
    await create({ token: c.token, baseId: c.baseId, table, fields: {
      Session: String(d.sid), Step: d.step, "Step Name": d.name || "",
      "UTM Source": d.utm_source || "", "UTM Medium": d.utm_medium || "", "UTM Campaign": d.utm_campaign || "",
    } });
    return { stored: true };
  } catch (e) { if (log.error) log.error("track", e.message); return { stored: false, reason: "store" }; }
}

async function handler(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { /* ignore */ }
  await processTrack(body, { fetchImpl: fetch });
  return { statusCode: 204, body: "" };
}
module.exports = { handler, processTrack };
