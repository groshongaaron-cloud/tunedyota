// netlify/functions/lib/leads.js
// Pure logic for the multi-channel lead tracker. No I/O — dependencies are injected
// so this unit-tests in Node and runs in Netlify functions unchanged.
const { getMarket } = require("./markets.js");
const { keyToInstaller, normalizeInstallerKey } = require("./routing.js");
const { cfg, createRecord, updateRecord, createTolerant, updateTolerant, listAllRecords } = require("./airtable.js");

const CHANNELS = ["email", "facebook", "instagram", "sms", "phone", "walk-in", "chat", "web", "other", "ott-national"];
const STAGES = ["New", "Contacted", "Qualified", "Following up", "Booked", "Not now"];
const ACTIVE_STAGES = ["New", "Contacted", "Qualified", "Following up"];

function validChannel(c) { return CHANNELS.includes(String(c || "")); }
function validStage(s) { return STAGES.includes(String(s || "")); }

// Map a free-form Source (and optional Reason, for backfill of rebook rows) to exactly
// one channel value.
function normalizeChannel(source, reason) {
  const s = (String(source == null ? "" : source) + " " + String(reason == null ? "" : reason)).toLowerCase();
  for (const ch of ["email", "facebook", "instagram", "sms", "phone", "walk-in", "chat"]) {
    if (s.includes(ch)) return ch;
  }
  if (s.includes("text")) return "sms";
  if (s.includes("call")) return "phone";
  return "other";
}

function normalizePhone(p) { return String(p == null ? "" : p).replace(/\D/g, "").slice(-10); }
function normalizeEmail(e) { return String(e == null ? "" : e).trim().toLowerCase(); }

// A lead's linked booking id: the real linked-record field first (array of rec
// ids), else the legacy Converted Booking text id until backfill retires it.
function linkedBookingId(f) {
  if (Array.isArray(f.Booking) && f.Booking.length) return String(f.Booking[0] || "");
  return String(f["Converted Booking"] || "");
}

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
    followupMessage: f["Follow-up Message"] || "",
    lastContact: (f["Last Contact"] || "").slice(0, 10),
    activity: f["Activity Log"] || "",
    clientNotes: f["Client Notes"] || "",
    convertedBooking: f["Converted Booking"] || "",
    bookingId: linkedBookingId(f),
    eventDate: String(f["Event Date"] || "").slice(0, 10),
    requestedSlot: f["Requested Slot"] || "",
    notified: !!f.Notified,
    reason: f.Reason || "",
    createdTime: f["Created Time"] || "",
  };
}

// Compact view of a Bookings record for match suggestions + linked display.
function toBookingSummary(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id: rec && rec.id,
    name: f.Name || "", phone: f.Phone || "", email: f.Email || "",
    city: f.City || "", dateISO: String(f["Event Date"] || "").slice(0, 10),
    slot: f.Slot || "", scheduledTime: f["Scheduled Time"] || "",
    status: f.Status || "Booked",
    installer: normalizeInstallerKey(f.Installer),
    vehicle: f.Vehicle || "",
  };
}

// "Looks booked already" suggestions: non-Cancelled bookings sharing a contact
// point with an unlinked lead. Completed bookings match too — a repeat customer
// texting in is exactly what this should catch. Upcoming soonest first, then
// most recent past.
function bookingMatchesForLead(lead, summaries, todayISO) {
  if (lead.bookingId) return [];
  const pKey = normalizePhone(lead.phone), eKey = normalizeEmail(lead.email);
  if (!pKey && !eKey) return [];
  const hits = (summaries || []).filter((b) => {
    if (b.status === "Cancelled") return false;
    return (pKey && normalizePhone(b.phone) === pKey) || (eKey && normalizeEmail(b.email) === eKey);
  });
  const bucket = (b) => (b.dateISO && b.dateISO >= todayISO ? 0 : 1);
  hits.sort((a, b) => bucket(a) - bucket(b) ||
    (bucket(a) === 0 ? String(a.dateISO).localeCompare(String(b.dateISO))
                     : String(b.dateISO).localeCompare(String(a.dateISO))));
  return hits;
}

// The client-portal account behind a lead, if any — matched by the lead's email
// or, once linked, the booking's email (SMS leads often carry no email).
function clientForLead(lead, linkedBooking, clientRecords) {
  const eKey = normalizeEmail(lead.email) || normalizeEmail(linkedBooking && linkedBooking.email);
  if (!eKey) return null;
  const rec = (clientRecords || []).find((r) => normalizeEmail((r.fields || {}).Email) === eKey);
  if (!rec) return null;
  let vehicles = [];
  try {
    const parsed = JSON.parse((rec.fields || {}).Vehicles || "[]");
    if (Array.isArray(parsed)) vehicles = parsed;
  } catch { /* bad JSON → empty garage, never a crash */ }
  return { email: eKey, vehicles };
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
  const modelYear = String(d.modelYear || "").trim().slice(0, 4);
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
    // Name backfill (owner ask 2026-07-29): channel adapters auto-name leads
    // "Caller (xxx) xxx-xxxx"; when a later touch carries the real name
    // (usually the chat agent's transfer), upgrade the placeholder. Never
    // overwrite a real name — a conflicting real name is a human's call —
    // and never downgrade a real name to a placeholder.
    const isPlaceholder = (n) => !String(n || "").trim() || /^caller\b/i.test(String(n).trim());
    if (!isPlaceholder(name) && isPlaceholder(match.fields.Name)) {
      fields.Name = name;
      fields["Activity Log"] = appendActivity(fields["Activity Log"],
        logLine(now, `name: ${String(match.fields.Name || "").trim() || "(blank)"} → ${name}`));
    }
    if (modelYear && !String(match.fields["Model Year"] || "").trim()) fields["Model Year"] = modelYear;
    if (emailThread) fields["Email Thread"] = emailThread;
    if (emailMessageId) fields["Email Message-Id"] = emailMessageId;
    if (replyTo) fields["Reply-To"] = replyTo;
    try {
      await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: match.id, fields },
        ["Last Contact", "Activity Log", "Model Year", "Email Thread", "Email Message-Id", "Reply-To"]);
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
    ...(modelYear ? { "Model Year": modelYear } : {}),
    ...(emailThread ? { "Email Thread": emailThread } : {}),
    ...(emailMessageId ? { "Email Message-Id": emailMessageId } : {}),
    ...(replyTo ? { "Reply-To": replyTo } : {}),
    ...(ghlLink ? { "GHL Link": ghlLink } : {}),
  };
  if (ownerKey) fields.Installer = ownerKey;
  let rec;
  try {
    rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
      ["Channel", "Stage", "Last Contact", "Activity Log", "Source", "Model Year", "Email Thread", "Email Message-Id", "Reply-To", "GHL Link"]);
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
    // The optional message rides along with the date and dies with it — a cleared
    // follow-up must never leave a stale draft that fires months later.
    const message = date ? String(payload.message || "").trim().slice(0, 500) : "";
    return { fields: { "Next Follow-up": date, "Follow-up Message": message,
      "Activity Log": add(date ? `follow-up set ${date}${message ? ` — "${message.slice(0, 80)}"` : ""}` : "follow-up cleared") } };
  }
  if (action === "followupSent") {
    const note = String(payload.note || "").trim().slice(0, 200);
    return { fields: { "Last Contact": today, "Next Follow-up": "", "Follow-up Message": "",
      "Activity Log": add(`follow-up sent${note ? `: "${note}"` : ""}`) } };
  }
  if (action === "reassign") {
    return { fields: { City: String(payload.city || ""), Installer: String(payload.installer || ""),
      "Activity Log": add(`reassigned → ${payload.installer || "unassigned"} (${payload.city || "—"})`) } };
  }
  return { error: "bad-action" };
}

// Field patch for linking a lead to an EXISTING booking — same end-state as
// convert (Stage Booked + link + audit line), minus creating the record.
function buildLinkPatch(lead, booking, now = new Date()) {
  const when = [booking.city, booking.dateISO, booking.scheduledTime || booking.slot].filter(Boolean).join(" ");
  return {
    Booking: [booking.id],
    "Converted Booking": booking.id,
    Stage: "Booked",
    "Activity Log": appendActivity(lead.activity, logLine(now, `linked → existing booking ${booking.id} (${when})`)),
  };
}

// Mislink recovery. Clears both link fields; Stage is left for the installer to
// correct with the existing stage buttons (the unlink reason decides the stage).
function buildUnlinkPatch(lead, now = new Date()) {
  return {
    Booking: [],
    "Converted Booking": "",
    "Activity Log": appendActivity(lead.activity, logLine(now, "unlinked from booking")),
  };
}

// Resolve the client record behind a booking: linked lead first, then the same
// normalized phone, then email. Views come from toLeadView. Null when unknown.
function findLeadForBooking(bookingId, bookingFields, leadViews) {
  const pKey = normalizePhone(bookingFields.Phone), eKey = normalizeEmail(bookingFields.Email);
  return (bookingId && leadViews.find((l) => l.bookingId === bookingId))
    || (pKey && leadViews.find((l) => normalizePhone(l.phone) === pKey))
    || (eKey && leadViews.find((l) => normalizeEmail(l.email) === eKey)) || null;
}

// The Priority List fields for a client record minted from a booking identity —
// market-routed, Stage Booked, linked back. `extra.fields` lets callers add
// channel/notes columns; `extra.source` names the minting motion.
function mintLeadFields(bookingId, f, now = new Date(), extra = {}) {
  const city = String(f.City || "").trim();
  const market = getMarket(city);
  const owner = normalizeInstallerKey(f.Installer);
  const instKey = market ? keyToInstaller(market.inst).key : owner;
  const fields = {
    Name: String(f.Name || ""), Phone: String(f.Phone || ""), Email: String(f.Email || ""),
    City: market ? market.city : (city || "Unassigned"), Vehicle: String(f.Vehicle || ""),
    ...(String(f["Model Year"] || "").trim() ? { "Model Year": String(f["Model Year"]).trim() } : {}),
    Source: extra.source || "booking", Stage: "Booked",
    Booking: [bookingId], "Converted Booking": bookingId,
    "Activity Log": logLine(now, `minted from booking ${bookingId}`),
    ...(extra.fields || {}),
  };
  // Routing owns Installer — deliberately clobbers any caller-supplied value from extra.fields.
  if (instKey) fields.Installer = instKey;
  return fields;
}

// Ensure a client record exists and is linked for a just-created booking.
// The universal first-touch rule (spec 2026-07-31): every booking either links
// to the existing client record or mints one. Callers wrap in try/catch —
// client-record upkeep must NEVER fail a booking (fail-open), and callers must
// AWAIT it (Lambda freeze: fire-and-forget never runs).
async function ensureClientRecordForBooking(bookingId, bookingFields, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = new Date(), channel = "web",
          list = (a) => listAllRecords({ fetchImpl, ...a }),
          create = (a) => createRecord({ fetchImpl, ...a }),
          update = (a) => updateRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  const rows = await list({ token: c.token, baseId: c.baseId, table: c.priority });
  const leads = rows.map(toLeadView);
  // First-match-wins is deliberate: a phone-shared dupe already linked elsewhere
  // returns early without writing; B4's duplicate detection surfaces those rows for merge.
  const match = findLeadForBooking(bookingId, bookingFields, leads);
  if (match) {
    if (match.bookingId) return { leadId: match.id, linked: match.bookingId === bookingId, minted: false }; // already linked — honest flag: true=this booking (idempotent retry), false=another booking
    const patch = buildLinkPatch(match, toBookingSummary({ id: bookingId, fields: bookingFields }), now);
    await updateTolerant(update, { token: c.token, baseId: c.baseId, table: c.priority, id: match.id, fields: patch },
      ["Booking", "Converted Booking", "Stage", "Activity Log"]);
    return { leadId: match.id, linked: true, minted: false };
  }
  const fields = mintLeadFields(bookingId, bookingFields, now, { source: `booking:${channel}`, fields: { Channel: channel } });
  const rec = await createTolerant(create, { token: c.token, baseId: c.baseId, table: c.priority, fields },
    ["Booking", "Converted Booking", "Stage", "Source", "Channel", "Activity Log", "Model Year"]);
  return { leadId: rec && rec.id, linked: true, minted: true };
}

const STALE_AFTER_DAYS = 30;

// The fell-through-the-cracks bucket: active stage, nothing scheduled (a future
// follow-up is being worked; an overdue one already shows in the due queue),
// and no touch for STALE_AFTER_DAYS. Single source of truth — the console and
// any future notification routine must both call this. Oldest-quiet first.
function staleLeads(leads, todayISO) {
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const out = [];
  for (const l of leads) {
    if (!ACTIVE_STAGES.includes(l.stage || "New")) continue;
    if (l.nextFollowup) continue;
    const lastISO = l.lastContact || String(l.createdTime || "").slice(0, 10);
    if (!lastISO) continue;
    const t = new Date(lastISO + "T00:00:00Z").getTime();
    if (isNaN(t)) continue;
    const days = Math.floor((today - t) / 86400000);
    if (days < STALE_AFTER_DAYS) continue;
    out.push({ ...l, staleDays: days });
  }
  out.sort((a, b) => b.staleDays - a.staleDays);
  return out;
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

// Which installer owns the ACTIVE lead for this phone number? Powers inbound
// call routing: assigned clients ring their installer directly. Fail-open ("")
// on any miss/error — the caller must never be dropped because Airtable was slow.
async function installerKeyForPhone(phone, deps = {}) {
  const { env = process.env, fetchImpl = fetch,
          list = (a) => listAllRecords({ fetchImpl, ...a }) } = deps;
  const pKey = normalizePhone(phone);
  const c = cfg(env);
  if (!pKey || !c.token || !c.baseId) return "";
  let rows = [];
  try { rows = await list({ token: c.token, baseId: c.baseId, table: c.priority }); }
  catch { return ""; }
  // Booked counts here (unlike lead-dedupe): a booked client calling in should
  // reach their installer. Only "Not now" leads fall back to the default ring.
  const routable = [...ACTIVE_STAGES, "Booked"];
  const matches = rows.filter((r) => {
    const f = r.fields || {};
    if (!routable.includes(f.Stage || "New")) return false;
    return f.Installer && normalizePhone(f.Phone) === pKey;
  });
  matches.sort((a, b) => String((b.fields || {})["Last Modified"] || b.createdTime || "")
    .localeCompare(String((a.fields || {})["Last Modified"] || a.createdTime || "")));
  return matches.length ? normalizeInstallerKey(matches[0].fields.Installer) : "";
}

module.exports = {
  CHANNELS, STAGES, ACTIVE_STAGES,
  validChannel, validStage,
  normalizeChannel, normalizePhone, normalizeEmail,
  toLeadView, scopeLeads, toBookingSummary, bookingMatchesForLead, clientForLead,
  buildLinkPatch, buildUnlinkPatch, findLeadForBooking, mintLeadFields,
  logLine, appendActivity, processLeadIngest,
  applyLeadUpdate, dueLeads, staleLeads, STALE_AFTER_DAYS, installerKeyForPhone,
  ensureClientRecordForBooking,
};
