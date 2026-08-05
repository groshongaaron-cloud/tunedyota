// netlify/functions/add-purchase.js
// Log a manual/in-person purchase onto a person's ownership history (the
// Purchases table). POST, installer-auth. Read-back is via Customer 360.
const { cfg, createRecord, createTolerant } = require("./lib/airtable.js");
const { resolveInstaller } = require("./lib/installer-auth.js");
const { withCors } = require("./lib/cors.js");

const CATEGORIES = ["OTT Tune", "AMSOIL", "Banks", "Magnuson", "Other"];

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const now = ctx.now || new Date();
  if ((event.httpMethod || "POST") !== "POST") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }

  const category = CATEGORIES.includes(body.category) ? body.category : "Other";
  const item = String(body.item || "").trim().slice(0, 200);
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim();
  if (!item || (!phone && !email)) return { statusCode: 400, body: JSON.stringify({ error: "missing-item-or-contact" }) };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? body.date : new Date(now).toISOString().slice(0, 10);

  const fields = { Date: date, Category: category, Item: item, Phone: phone, Email: email,
    Name: String(body.name || "").trim(), Vehicle: String(body.vehicle || "").trim(),
    Installer: key, Notes: String(body.notes || "").trim().slice(0, 500) };
  const amount = body.amount === "" || body.amount == null ? null : Number(body.amount);
  if (amount != null && isFinite(amount)) fields.Amount = amount;

  const c = cfg(env);
  const createImpl = ctx.createImpl || ((a) => createRecord({ ...a }));
  let rec;
  try { rec = await createTolerant(createImpl, { token: c.token, baseId: c.baseId, table: c.purchases, fields }, ["Amount", "Vehicle", "Name", "Notes"]); }
  catch (e) { return { statusCode: 502, body: JSON.stringify({ error: "store-unavailable" }) }; }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ok", id: rec && rec.id }) };
}
module.exports = { handler: withCors(handler) };
