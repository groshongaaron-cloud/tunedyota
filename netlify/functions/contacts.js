// netlify/functions/contacts.js
// Console Contacts directory index. GET, installer-auth, read-only. Merges
// Clients + Priority List (leads) + Bookings into one deduped person each, with
// a lightweight row for instant client-side search/sort/filter. Full history is
// the separate Customer 360 (customer-view.js) on tap. Admins see everyone; a
// regular installer sees people assigned to them or not yet assigned.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { toLeadView } = require("./lib/leads.js");
const { normalizeInstallerKey } = require("./lib/routing.js");
const { getMarket } = require("./lib/markets.js");
const { buildContactIndex } = require("./lib/contacts-index.js");
const { withCors } = require("./lib/cors.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);
function parseJson(s, d) { try { const v = JSON.parse(s || ""); return v == null ? d : v; } catch { return d; } }

function bookingContribs(recs) {
  return recs.map((r) => { const f = r.fields || {}; return {
    source: "booking", recordId: r.id, name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    vehicle: f.Vehicle || "", modelYear: f["Model Year"] || "", city: f.City || "",
    installer: normalizeInstallerKey(f.Installer), activityDate: dateOnly(f["Event Date"]), status: f.Status || "Booked" };
  }).filter((b) => b.status !== "Cancelled");
}
function leadContribs(recs) {
  return recs.map(toLeadView).map((l) => ({
    source: "lead", recordId: l.id, name: l.name, phone: l.phone, email: l.email,
    vehicle: l.vehicle, modelYear: l.modelYear, city: l.city,
    installer: normalizeInstallerKey(l.installer), activityDate: l.lastContact || "" }));
}
function clientContribs(recs) {
  return recs.map((r) => { const f = r.fields || {};
    const garage = parseJson(f.Vehicles, []); const v = Array.isArray(garage) && garage[0] ? garage[0] : null;
    const name = f.Name || [f["First Name"], f["Last Name"]].filter(Boolean).join(" ");
    return { source: "client", recordId: r.id, name, phone: f.Phone || "", email: f.Email || "",
      vehicle: v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : (f.Vehicle || ""),
      modelYear: (v && v.year) || "", city: f.City || "", installer: normalizeInstallerKey(f.Installer),
      activityDate: dateOnly(f["Last Activity"] || f.Created || "") }; });
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  const list = ctx.listImpl || ((a) => listAllRecords({ fetchImpl, ...a }));
  if ((event.httpMethod || "GET") !== "GET") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const c = cfg(env);
  let partial = false;
  const safe = (p) => p.catch(() => { partial = true; return []; });
  const [bk, ld, cl] = await Promise.all([
    safe(list({ token: c.token, baseId: c.baseId, table: c.bookings }).then(bookingContribs)),
    safe(list({ token: c.token, baseId: c.baseId, table: c.priority }).then(leadContribs)),
    safe(list({ token: c.token, baseId: c.baseId, table: c.clients }).then(clientContribs)),
  ]);
  let contribs = [...bk, ...ld, ...cl];
  if (!admin) contribs = contribs.filter((x) => !x.installer || x.installer === key);
  const contacts = buildContactIndex(contribs, { getMarket });
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", partial, count: contacts.length, contacts }) };
}
module.exports = { handler: withCors(handler) };
