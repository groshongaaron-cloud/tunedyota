// First-party funnel-step beacon sink. Writes one Funnel Events row per step.
// Always 204 (beacons ignore the response); never throws into the request.
const { cfg, createRecord } = require("./lib/airtable.js");

// Public unauthenticated beacon: cap every string before it reaches Airtable so
// a hostile client can't stuff megabytes into a row.
const cap = (v) => String(v == null ? "" : v).slice(0, 200);

async function processTrack(body, deps) {
  const { fetchImpl = fetch, create = (a) => createRecord({ fetchImpl, ...a }), env = process.env, log = console } = deps;
  const d = body || {};
  if (d.bot_field) return { stored: false, reason: "bot" };
  if (!d.sid || typeof d.step !== "number") return { stored: false, reason: "invalid" };
  const c = cfg(env);
  const table = env.AIRTABLE_FUNNEL_TABLE || "Funnel Events";
  try {
    await create({ token: c.token, baseId: c.baseId, table, fields: {
      Session: cap(d.sid), Step: d.step, "Step Name": cap(d.name),
      "UTM Source": cap(d.utm_source), "UTM Medium": cap(d.utm_medium), "UTM Campaign": cap(d.utm_campaign),
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
