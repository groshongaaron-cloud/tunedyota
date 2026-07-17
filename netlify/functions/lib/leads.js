// netlify/functions/lib/leads.js
// Pure logic for the multi-channel lead tracker. No I/O — dependencies are injected
// so this unit-tests in Node and runs in Netlify functions unchanged.
const { getMarket } = require("./markets.js");
const { keyToInstaller } = require("./routing.js");
const { cfg, createRecord, updateRecord, createTolerant, updateTolerant, listAllRecords } = require("./airtable.js");

const CHANNELS = ["email", "facebook", "instagram", "sms", "phone", "walk-in", "other", "ott-national"];
const STAGES = ["New", "Contacted", "Qualified", "Following up", "Booked", "Not now"];
const ACTIVE_STAGES = ["New", "Contacted", "Qualified", "Following up"];

function validChannel(c) { return CHANNELS.includes(String(c || "")); }
function validStage(s) { return STAGES.includes(String(s || "")); }

// Map a free-form Source (and optional Reason, for backfill of rebook rows) to exactly
// one channel value.
function normalizeChannel(source, reason) {
  const s = (String(source == null ? "" : source) + " " + String(reason == null ? "" : reason)).toLowerCase();
  for (const ch of ["email", "facebook", "instagram", "sms", "phone", "walk-in"]) {
    if (s.includes(ch)) return ch;
  }
  if (s.includes("text")) return "sms";
  if (s.includes("call")) return "phone";
  return "other";
}

function normalizePhone(p) { return String(p == null ? "" : p).replace(/\D/g, "").slice(-10); }
function normalizeEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }

// Flatten an Airtable Priority List record into the shape the app + endpoints use.
function toLeadView(rec) {
  const f = (rec && rec.fields) || {};
  const explicit = validChannel(f.Channel) ? f.Channel : "";
  return {
    id: rec && rec.id,
    name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    city: f.City || "", vehicle: f.Vehicle || "", goals: f.Goals || "",
    installer: f.Installer || "",
    channel: explicit || normalizeChannel(f.Source, f.Reason),
    stage: validStage(f.Stage) ? f.Stage : "New",
    source: f.Source || "",
    modifications: f.Modifications || "", modelYear: f["Model Year"] || "",
    nextFollowup: (f["Next Follow-up"] || "").slice(0, 10),
    lastContact: (f["Last Contact"] || "").slice(0, 10),
    activity: f["Activity Log"] || "",
    convertedBooking: f["Converted Booking"] || "",
    reason: f.Reason || "",
    createdTime: f["Created Time"] || "",
  };
}

// Apply visibility. A regular installer sees only their own leads; an admin sees all,
// or a single installer via `filter`, or the blank-installer bucket via filter "unassigned".
function scopeLeads(leads, { key, admin, filter } = {}) {
  if (!admin) return leads.filter((l) => (l.installer || "") === key);
  if (filter === "unassigned") return leads.filter((l) => !(l.installer || ""));
  if (filter) return leads.filter((l) => (l.installer || "") === filter);
  return leads;
}

function logLine(now, text) { return `${new Date(now).toISOString().slice(0, 16).replace("T", " ")} — ${text}`; }
function appendActivity(existing, line) { return existing ? existing + "\n" + line : line; }

// The single normalized write path. Adapters + the manual UI all call this.
async function processLeadIngest(body, deps) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }),
          list = (a) => listAllRecords({ fetchImpl, ...a }) } = deps;
  const d = body || {};
  const name = String(d.name || "").trim();
  const phone = String(d.phone || "").trim();
  const email = String(d.email || "").trim();
  if (!name || (!phone && !email)) return { status: "error", error: "missing-contact" };

  const emailThread = String(d.emailThread || "").trim();
  const emailMessageId = String(d.emailMessageId || "").trim();
  const replyTo = String(d.replyTo || "").trim();
  const ghlLink = String(d.ghlLink || "").trim();

  const channel = validChannel(d.channel) ? d.channel : normalizeChannel(d.source || d.channel);
  const source = String(d.source || `lead:${channel}`);
  const city = String(d.city || "").trim();
  const market = getMarket(city);
  const ownerKey = market ? keyToInstaller(market.inst).key : "";
  const c = cfg(env);

  // Dedupe: find an ACTIVE existing lead for this contact.
  const pKey = normalizePhone(phone), eKey = normalizeEmail(email);
  let existing = [];
  try { existing = await list({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch (e) { /* fall through to create — never lose a lead */ }
  const match = existing.find((r) => {
    const f = r.fields || {};
    const stage = f.Stage || "New";
    if (!ACTIVE_STAGES.includes(stage)) return false;
    const samePhone = pKey && normalizePhone(f.Phone) === pKey;
    const sameEmail = eKey && normalizeEmail(f.Email) === eKey;
    return samePhone || sameEmail;
  });

  const touch = logLine(now, `${channel}: ${d.message ? String(d.message).slice(0, 200) : "new contact"}`);

  if (match) {
    const fields = { "Last Contact": new Date(now).toISOString().slice(0, 10),
      "Activity Log": appendActivity(match.fields["Activity Log"], touch) };
    if (emailThread) fields["Email Thread"] = emailThread;
    if (emailMessageId) fields["Email Message-Id"] = emailMessageId;
    if (replyTo) fields["Reply-To"] = replyTo;
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: match.id, fields },
        ["Last Contact", "Activity Log", "Email Thread", "Email Message-Id", "Reply-To"]);
    } catch (e) { return { status: "error", error: "store-unavailable" }; }
    return { status: "lead", recordId: match.id, deduped: true };
  }

  const fields = {
    Name: name, Phone: phone, Email: email, City: market ? market.city : "Unassigned",
    Vehicle: String(d.vehicle || ""), Goals: String(d.goals || ""),
    Source: source, Channel: channel,
    // Qualification bar (channel-agnostic, per owner spec): routable location + vehicle known → Qualified on arrival.
    // Airtable's Stage select gains the option via typecast:true.
    Stage: (market && String(d.vehicle || "").trim()) ? "Qualified" : "New",
    "Last Contact": new Date(now).toISOString().slice(0, 10), "Activity Log": touch,
    ...(emailThread ? { "Email Thread": emailThread } : {}),
    ...(emailMessageId ? { "Email Message-Id": emailMessageId } : {}),
    ...(replyTo ? { "Reply-To": replyTo } : {}),
    ...(ghlLink ? { "GHL Link": ghlLink } : {}),
  };
  if (ownerKey) fields.Installer = ownerKey;
  let rec;
  try {
    rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
      ["Channel", "Stage", "Last Contact", "Activity Log", "Source", "Email Thread", "Email Message-Id", "Reply-To", "GHL Link"]);
  } catch (e) { return { status: "error", error: "store-unavailable" }; }
  return { status: "lead", recordId: rec && rec.id, deduped: false };
}

// Compute the Airtable field patch + a new activity line for a field-level action.
// (The `convert` action creates a Booking and is handled in the endpoint, not here.)
function applyLeadUpdate(lead, action, payload = {}, now = new Date()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const add = (line) => appendActivity(lead.activity, logLine(now, line));
  if (action === "setStage") {
    if (!validStage(payload.stage)) return { error: "bad-stage" };
    return { fields: { Stage: payload.stage, "Activity Log": add(`stage → ${payload.stage}`) } };
  }
  if (action === "logContact") {
    const note = String(payload.note || "contacted").slice(0, 200);
    return { fields: { "Last Contact": today, "Activity Log": add(note) } };
  }
  if (action === "setFollowup") {
    const date = String(payload.date || "");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "bad-date" };
    return { fields: { "Next Follow-up": date, "Activity Log": add(date ? `follow-up set ${date}` : "follow-up cleared") } };
  }
  if (action === "reassign") {
    return { fields: { City: String(payload.city || ""), Installer: String(payload.installer || ""),
      "Activity Log": add(`reassigned → ${payload.installer || "unassigned"} (${payload.city || "—"})`) } };
  }
  return { error: "bad-action" };
}

// Active leads whose Next Follow-up is today or earlier, grouped by installer key.
function dueLeads(leads, todayISO) {
  const out = {};
  for (const l of leads) {
    if (!ACTIVE_STAGES.includes(l.stage || "New")) continue;
    if (!l.nextFollowup || l.nextFollowup > todayISO) continue;
    const k = l.installer || "unassigned";
    (out[k] = out[k] || []).push(l);
  }
  return out;
}

module.exports = {
  CHANNELS, STAGES, ACTIVE_STAGES,
  validChannel, validStage,
  normalizeChannel, normalizePhone, normalizeEmail,
  toLeadView, scopeLeads,
  logLine, appendActivity, processLeadIngest,
  applyLeadUpdate, dueLeads,
};
