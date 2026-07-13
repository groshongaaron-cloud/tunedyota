// netlify/functions/push-subscribe.js
// Installer-token authed: upsert a browser PushSubscription into the "Web Push Subs"
// Airtable table, keyed to the installer, deduped by endpoint. Called by the console
// after the browser grants notification permission.
const { cfg, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");

const SUBS = (env) => env.AIRTABLE_WEBPUSH_TABLE || "Web Push Subs";

async function processSubscribe(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const sub = body && body.subscription;
  const endpoint = sub && String(sub.endpoint || "").trim();
  if (!endpoint) return { status: "error", error: "missing-subscription" };
  const c = cfg(env);
  const table = SUBS(env);
  const fields = { Installer: key, Endpoint: endpoint, Subscription: JSON.stringify(sub) };
  try {
    const existing = await list({ token: c.token, baseId: c.baseId, table, filterByFormula: `{Endpoint}="${endpoint}"` });
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
  const out = await processSubscribe(body, { key });
  const code = out.status !== "error" ? 200 : (out.error === "missing-subscription" ? 400 : 502);
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processSubscribe };
