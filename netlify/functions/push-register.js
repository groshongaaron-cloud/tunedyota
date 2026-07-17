// netlify/functions/push-register.js
// Installer-token authed: upsert an app device's push token into the "Push Devices"
// Airtable table, keyed to the installer. Called by the Tuned Yota app after the OS
// grants notification permission. Dedups by token (update, not duplicate).
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");

const DEVICES = (env) => env.AIRTABLE_DEVICES_TABLE || "Push Devices";

async function processRegister(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const token = String((body && body.token) || "").trim();
  const platform = String((body && body.platform) || "").trim().toLowerCase();
  if (!token) return { status: "error", error: "missing-token" };
  const c = cfg(env);
  const table = DEVICES(env);
  const fields = { Installer: key, Token: token, Platform: platform };
  try {
    const existing = await list({ token: c.token, baseId: c.baseId, table, filterByFormula: `{Token}="${escapeFormula(token)}"` });
    if (existing.length) { await update({ token: c.token, baseId: c.baseId, table, id: existing[0].id, fields }); return { status: "updated" }; }
    await create({ token: c.token, baseId: c.baseId, table, fields });
    return { status: "registered" };
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processRegister(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "missing-token" ? 400 : 502);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processRegister };
