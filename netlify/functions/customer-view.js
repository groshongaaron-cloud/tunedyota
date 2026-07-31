// netlify/functions/customer-view.js
// Customer 360: everything TY knows about one contact, in one response.
// GET ?phone=…&email=… — installer token auth, read-only. Matching is JS-side on
// the normalized last-10-digits (stored phone formats are free text); email is a
// secondary matcher for leads only. Non-admins see only their own bookings and
// leads; chat sessions follow the Chats-tab rule (mine + unassigned) and calls
// are the business line the Calls tab already shows. Each source fails
// independently to an empty array + partial:true — the view never all-or-nothings.
const { cfg, listAllRecords } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { normalizePhone, normalizeEmail, toLeadView } = require("./lib/leads.js");
const { normalizeInstallerKey } = require("./lib/routing.js");
const { TABLE: chatTable, parseTranscript } = require("./lib/chat-store.js");

const dateOnly = (s) => String(s == null ? "" : s).slice(0, 10);

async function fetchBookings({ c, list, pKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.bookings });
  return recs.map((r) => {
    const f = r.fields || {};
    return { id: r.id, dateISO: dateOnly(f["Event Date"]), city: f.City || "",
      name: f.Name || "", vehicle: f.Vehicle || "", modelYear: f["Model Year"] || "",
      phone: f.Phone || "", email: f.Email || "", status: f.Status || "Booked",
      calibration: f["OTT Calibration"] || "", certSent: !!f["Certificate Sent"],
      scheduledTime: f["Scheduled Time"] || "", installer: normalizeInstallerKey(f.Installer),
      signed: !!(f["Customer Signature"] && String(f["Customer Signature"]).trim()) };
  }).filter((b) => normalizePhone(b.phone) === pKey && b.status !== "Cancelled")
    .filter((b) => admin || b.installer === key)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
}

async function fetchLeads({ c, list, pKey, eKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: c.priority });
  return recs.map(toLeadView)
    .filter((l) => (pKey && normalizePhone(l.phone) === pKey) || (eKey && normalizeEmail(l.email) === eKey))
    .filter((l) => admin || (l.installer || "") === key)
    .sort((a, b) => String(b.lastContact || "").localeCompare(String(a.lastContact || "")));
}

async function fetchChats({ env, c, list, pKey, key, admin }) {
  const recs = await list({ token: c.token, baseId: c.baseId, table: chatTable(env),
    fields: ["Session ID", "Status", "Transcript", "Customer Name", "Phone", "Vehicle", "Installer", "Last Activity"] });
  return recs.map((r) => {
    const f = r.fields || {};
    const turns = parseTranscript(f.Transcript);
    const last = [...turns].reverse().find((t) => t.role !== "system");
    return { id: f["Session ID"] || "", customerName: f["Customer Name"] || "",
      phone: f.Phone || "", vehicle: f.Vehicle || "", status: f.Status || "ai",
      installer: f.Installer || "", lastActivity: f["Last Activity"] || "",
      lastText: last ? String(last.text || "").slice(0, 140) : "" };
  }).filter((s) => normalizePhone(s.phone) === pKey || String(s.id).replace(/\D/g, "").slice(-10) === pKey)
    .filter((s) => admin || !s.installer || s.installer === key)
    .sort((a, b) => String(b.lastActivity).localeCompare(String(a.lastActivity)));
}

async function fetchCalls({ env, fetchImpl, pKey }) {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token || !pKey) return [];
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const seen = {}, out = [];
  for (const q of [`To=%2B1${pKey}`, `From=%2B1${pKey}`]) {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=50&${q}`,
      { headers: { Authorization: auth } });
    if (!res.ok) continue;
    for (const cl of ((await res.json()).calls || [])) {
      if (seen[cl.sid]) continue;
      seen[cl.sid] = 1;
      out.push({ sid: cl.sid, direction: cl.direction === "inbound" ? "inbound" : "outbound",
        from: cl.from || "", to: cl.to || "", status: cl.status || "",
        startTime: cl.start_time || cl.date_created || "", duration: Number(cl.duration || 0) });
    }
  }
  return out.sort((a, b) => (Date.parse(b.startTime) || 0) - (Date.parse(a.startTime) || 0));
}

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  const list = ctx.listImpl || ((a) => listAllRecords({ fetchImpl, ...a }));
  if ((event.httpMethod || "GET") !== "GET") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const admin = isAdmin(key, env);
  const q = event.queryStringParameters || {};
  const pKey = normalizePhone(q.phone);
  const eKey = normalizeEmail(q.email);
  if (!pKey && !eKey) return { statusCode: 400, body: JSON.stringify({ error: "missing-contact" }) };
  const c = cfg(env);
  let partial = false;
  const safe = (p) => p.catch(() => { partial = true; return []; });
  const [bookings, leads, chats, calls] = await Promise.all([
    safe(pKey ? fetchBookings({ c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchLeads({ c, list, pKey, eKey, key, admin })),
    safe(pKey ? fetchChats({ env, c, list, pKey, key, admin }) : Promise.resolve([])),
    safe(fetchCalls({ env, fetchImpl, pKey })),
  ]);
  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "ok", partial, bookings, leads, chats, calls }) };
}
module.exports = { handler };
