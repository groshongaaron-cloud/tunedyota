// netlify/functions/installer-prefs.js
// Installer-token authed per-installer preferences (currently: console theme). GET returns
// the saved prefs; POST {theme} upserts an {Installer, Theme} record in the
// "Installer Prefs" Airtable table, deduped by installer key — the same upsert pattern as
// push-subscribe.js. Fail-soft: a missing table or Airtable outage returns
// store-unavailable and the console falls back to per-device (localStorage) persistence.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");

const PREFS = (env) => env.AIRTABLE_INSTALLER_PREFS_TABLE || "Installer Prefs";
// Must match the switcher options in site/installer.html.
const THEMES = ["night", "field", "heritage"];

const normalizeTheme = (t) => (THEMES.includes(t) ? t : "");

async function processGetPrefs(deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  try {
    const recs = await list({ token: c.token, baseId: c.baseId, table: PREFS(env),
      filterByFormula: `{Installer}="${escapeFormula(key)}"` });
    const f = (recs[0] && recs[0].fields) || {};
    return { status: "ok", theme: normalizeTheme(String(f.Theme || "")) };
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
}

async function processSetPrefs(body, deps) {
  const { env = process.env, fetchImpl = fetch, key,
          list = (a) => listRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const theme = String((body && body.theme) || "");
  if (!THEMES.includes(theme)) return { status: "error", error: "invalid-theme" };
  const c = cfg(env);
  const table = PREFS(env);
  const fields = { Installer: key, Theme: theme };
  try {
    const existing = await list({ token: c.token, baseId: c.baseId, table,
      filterByFormula: `{Installer}="${escapeFormula(key)}"` });
    if (existing.length) await update({ token: c.token, baseId: c.baseId, table, id: existing[0].id, fields });
    else await create({ token: c.token, baseId: c.baseId, table, fields });
    return { status: "ok", theme };
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const json = (code, out) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) });
  if (event.httpMethod === "GET") {
    const out = await processGetPrefs({ key });
    return json(out.status === "ok" ? 200 : 502, out);
  }
  if (event.httpMethod === "POST") {
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
    const out = await processSetPrefs(body, { key });
    return json(out.status === "ok" ? 200 : (out.error === "invalid-theme" ? 400 : 502), out);
  }
  return { statusCode: 405, body: "method not allowed" };
}

module.exports = { handler, processGetPrefs, processSetPrefs, THEMES };
