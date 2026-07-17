// tests/leads.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../netlify/functions/lib/leads.js");

test("normalizeChannel maps sources to one of the seven channels", () => {
  assert.equal(L.normalizeChannel("intake:facebook"), "facebook");
  assert.equal(L.normalizeChannel("installer:walk-in"), "walk-in");
  assert.equal(L.normalizeChannel("intake:instagram"), "instagram");
  assert.equal(L.normalizeChannel("intake:email"), "email");
  assert.equal(L.normalizeChannel("lead:sms"), "sms");
  assert.equal(L.normalizeChannel("some text message"), "sms");
  assert.equal(L.normalizeChannel("missed call"), "phone");
  assert.equal(L.normalizeChannel(""), "other");
  assert.equal(L.normalizeChannel(undefined), "other");
});

test("validChannel gates the allowed set", () => {
  assert.equal(L.validChannel("phone"), true);
  assert.equal(L.validChannel("carrier-pigeon"), false);
});

test("normalizePhone reduces to a last-10 key; normalizeEmail lowercases", () => {
  assert.equal(L.normalizePhone("1 (701) 426-9395"), "7014269395");
  assert.equal(L.normalizePhone("701.426.9395"), "7014269395");
  assert.equal(L.normalizePhone(""), "");
  assert.equal(L.normalizeEmail("  Kevin@Leier.com "), "kevin@leier.com");
});

test("toLeadView flattens an Airtable record into a stable shape", () => {
  const rec = { id: "recA", fields: { Name: "Dana", Phone: "1", Email: "d@x.com", City: "Fargo",
    Vehicle: "Tundra", Goals: "more power", Installer: "aaron", Source: "intake:facebook",
    Stage: "New", "Next Follow-up": "2026-07-20", "Last Contact": "2026-07-15",
    "Activity Log": "line1", "Converted Booking": "", "Created Time": "2026-07-14T00:00:00Z" } };
  const v = L.toLeadView(rec);
  assert.equal(v.id, "recA");
  assert.equal(v.name, "Dana");
  assert.equal(v.channel, "facebook");        // derived when no explicit Channel
  assert.equal(v.stage, "New");
  assert.equal(v.installer, "aaron");
  assert.equal(v.nextFollowup, "2026-07-20");
});

test("toLeadView defaults stage to New and prefers an explicit Channel", () => {
  const v = L.toLeadView({ id: "r", fields: { Name: "X", Channel: "sms", Source: "intake:facebook" } });
  assert.equal(v.stage, "New");
  assert.equal(v.channel, "sms");             // explicit Channel wins over Source
});

test("scopeLeads: installer sees own; admin sees all or filtered or unassigned", () => {
  const leads = [
    { id: "1", installer: "aaron" }, { id: "2", installer: "cody" }, { id: "3", installer: "" },
  ];
  assert.deepEqual(L.scopeLeads(leads, { key: "cody", admin: false }).map((l) => l.id), ["2"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true }).map((l) => l.id), ["1", "2", "3"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true, filter: "cody" }).map((l) => l.id), ["2"]);
  assert.deepEqual(L.scopeLeads(leads, { key: "aaron", admin: true, filter: "unassigned" }).map((l) => l.id), ["3"]);
});

test("processLeadIngest requires a name and at least one contact", async () => {
  const out = await L.processLeadIngest({ name: "", phone: "" }, { list: async () => [] });
  assert.equal(out.error, "missing-contact");
});

test("processLeadIngest creates a New lead assigned by market", async () => {
  let created;
  const out = await L.processLeadIngest(
    { name: "Dana", phone: "6055551212", channel: "sms", city: "Sioux Falls", vehicle: "Tundra" },
    { now: new Date("2026-07-14T12:00:00Z"), list: async () => [],
      create: async (a) => { created = a.fields; return { id: "recNew" }; } });
  assert.equal(out.status, "lead");
  assert.equal(out.recordId, "recNew");
  assert.equal(out.deduped, false);
  assert.equal(created.Stage, "Qualified");           // market + vehicle known → Qualified
  assert.equal(created.Channel, "sms");
  assert.equal(created.Installer, "cody");            // Sioux Falls routes to cody
  assert.match(created["Activity Log"], /sms/);
});

test("processLeadIngest sends an unknown city to the Unassigned bucket", async () => {
  let created;
  await L.processLeadIngest({ name: "X", phone: "1", channel: "phone", city: "Nowhere" },
    { list: async () => [], create: async (a) => { created = a.fields; return { id: "r" }; } });
  assert.equal(created.City, "Unassigned");
  assert.equal("Installer" in created, false);        // blank installer, not written
});

test("processLeadIngest dedupes onto an ACTIVE lead by phone (appends, no create)", async () => {
  let created = false, updated;
  const existing = { id: "recX", fields: { Name: "Dana", Phone: "16055551212", Stage: "Contacted", "Activity Log": "old" } };
  const out = await L.processLeadIngest({ name: "Dana", phone: "605-555-1212", channel: "email", message: "emailed back" },
    { list: async () => [existing], create: async () => { created = true; return {}; },
      update: async (a) => { updated = a; return { id: a.id }; } });
  assert.equal(out.deduped, true);
  assert.equal(out.recordId, "recX");
  assert.equal(created, false);
  assert.match(updated.fields["Activity Log"], /old/);        // preserved
  assert.match(updated.fields["Activity Log"], /emailed back/); // appended
});

test("processLeadIngest treats a match in a TERMINAL stage as a new lead", async () => {
  let created = false;
  const existing = { id: "recX", fields: { Phone: "16055551212", Stage: "Booked" } };
  const out = await L.processLeadIngest({ name: "Dana", phone: "6055551212", channel: "sms" },
    { list: async () => [existing], create: async () => { created = true; return { id: "recNew2" }; } });
  assert.equal(out.deduped, false);
  assert.equal(created, true);
  assert.equal(out.recordId, "recNew2");
});

test("applyLeadUpdate builds the field patch + activity line per action", () => {
  const lead = { activity: "start" };
  const now = new Date("2026-07-14T12:00:00Z");
  const s = L.applyLeadUpdate(lead, "setStage", { stage: "Contacted" }, now);
  assert.equal(s.fields.Stage, "Contacted");
  assert.match(s.fields["Activity Log"], /stage → Contacted/);

  const c = L.applyLeadUpdate(lead, "logContact", { note: "left VM" }, now);
  assert.equal(c.fields["Last Contact"], "2026-07-14");
  assert.match(c.fields["Activity Log"], /left VM/);

  const fu = L.applyLeadUpdate(lead, "setFollowup", { date: "2026-07-20" }, now);
  assert.equal(fu.fields["Next Follow-up"], "2026-07-20");

  const ra = L.applyLeadUpdate(lead, "reassign", { city: "Omaha", installer: "cody" }, now);
  assert.equal(ra.fields.City, "Omaha");
  assert.equal(ra.fields.Installer, "cody");
});

test("applyLeadUpdate rejects an invalid stage", () => {
  const out = L.applyLeadUpdate({ activity: "" }, "setStage", { stage: "Nope" }, new Date());
  assert.equal(out.error, "bad-stage");
});

test("dueLeads picks active leads due today/overdue, grouped by installer", () => {
  const leads = [
    { id: "1", installer: "aaron", stage: "Contacted", nextFollowup: "2026-07-10" }, // overdue
    { id: "2", installer: "aaron", stage: "New", nextFollowup: "2026-07-14" },        // today
    { id: "3", installer: "cody", stage: "Booked", nextFollowup: "2026-07-10" },      // terminal → excluded
    { id: "4", installer: "aaron", stage: "New", nextFollowup: "2026-07-20" },        // future → excluded
    { id: "5", installer: "cody", stage: "Following up", nextFollowup: "2026-07-14" },
  ];
  const g = L.dueLeads(leads, "2026-07-14");
  assert.deepEqual(g.aaron.map((l) => l.id), ["1", "2"]);
  assert.deepEqual(g.cody.map((l) => l.id), ["5"]);
});

test("normalizeChannel also reads the Reason field (backfill of rebook rows)", () => {
  assert.equal(L.normalizeChannel("", "installer:walk-in"), "walk-in");
  assert.equal(L.normalizeChannel(null, "Rebook — not completed"), "other");
});

test("toLeadView carries Modifications + Model Year (spec §4 reused fields)", () => {
  const v = L.toLeadView({ id: "r", fields: { Name: "X", Modifications: "lift", "Model Year": "2022" } });
  assert.equal(v.modifications, "lift");
  assert.equal(v.modelYear, "2022");
});

test("applyLeadUpdate rejects a malformed follow-up date and an unknown action", () => {
  assert.equal(L.applyLeadUpdate({ activity: "" }, "setFollowup", { date: "07/20" }, new Date()).error, "bad-date");
  assert.equal(L.applyLeadUpdate({ activity: "" }, "frobnicate", {}, new Date()).error, "bad-action");
});

test("dueLeads groups an unassigned due lead under 'unassigned'", () => {
  const g = L.dueLeads([{ id: "9", installer: "", stage: "New", nextFollowup: "2026-07-01" }], "2026-07-14");
  assert.deepEqual(g.unassigned.map((l) => l.id), ["9"]);
});

test("ott-national is a valid channel", () => {
  assert.equal(L.validChannel("ott-national"), true);
});

test("processLeadIngest persists email refs when provided (create path)", async () => {
  let created;
  await L.processLeadIngest(
    { name: "Dana", email: "d@x.com", channel: "ott-national", source: "ott-national:fb-ads",
      emailThread: "thr123", emailMessageId: "<msg-1@mail>", replyTo: "info@overlandtailor.com" },
    { list: async () => [], create: async (a) => { created = a.fields; return { id: "recN" }; } });
  assert.equal(created.Channel, "ott-national");
  assert.equal(created["Email Thread"], "thr123");
  assert.equal(created["Email Message-Id"], "<msg-1@mail>");
  assert.equal(created["Reply-To"], "info@overlandtailor.com");
});

test("processLeadIngest keeps email refs on a dedupe-append", async () => {
  let updated;
  const existing = { id: "recX", fields: { Email: "d@x.com", Stage: "New", "Activity Log": "old" } };
  await L.processLeadIngest(
    { name: "Dana", email: "d@x.com", channel: "ott-national", emailThread: "thr9", emailMessageId: "<m9@x>", replyTo: "r@x.com", message: "again" },
    { list: async () => [existing], update: async (a) => { updated = a.fields; return { id: a.id }; }, create: async () => ({}) });
  assert.equal(updated["Email Thread"], "thr9");
  assert.match(updated["Activity Log"], /old/);
});

test("Qualified is a valid stage, ordered after Contacted, and active", () => {
  const { STAGES, ACTIVE_STAGES } = require("../netlify/functions/lib/leads.js");
  assert.deepEqual(STAGES, ["New", "Contacted", "Qualified", "Following up", "Booked", "Not now"]);
  assert.ok(ACTIVE_STAGES.includes("Qualified"));
});

test("ingest auto-qualifies a lead arriving with a routable city AND a vehicle", async () => {
  const { processLeadIngest } = require("../netlify/functions/lib/leads.js");
  let created;
  const deps = { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    list: async () => [], create: async (a) => { created = a; return { id: "L1" }; }, update: async () => ({}) };
  await processLeadIngest({ name: "Quinn", phone: "9207375148", city: "Fargo", vehicle: "2006 Lexus GX470", channel: "ott-national" }, deps);
  assert.equal(created.fields.Stage, "Qualified");
});

test("ingest leaves stage New when city is unknown or vehicle is missing", async () => {
  const { processLeadIngest } = require("../netlify/functions/lib/leads.js");
  const mk = () => { const out = {}; return { out, deps: { env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    list: async () => [], create: async (a) => { out.a = a; return { id: "L1" }; }, update: async () => ({}) } }; };
  const a = mk(); await processLeadIngest({ name: "A", phone: "1", city: "Nowhereville", vehicle: "Tundra" }, a.deps);
  assert.equal(a.out.a.fields.Stage, "New");
  const b = mk(); await processLeadIngest({ name: "B", phone: "1", city: "Fargo", vehicle: "" }, b.deps);
  assert.equal(b.out.a.fields.Stage, "New");
});

test("site/installer.html Leads tab badge does not use stale 3-stage inline list missing Qualified", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
  assert.equal(/\['New','Contacted','Following up'\]/.test(html), false,
    "Stale 3-stage inline array found — Qualified is missing from the Leads tab badge filter");
});

test("site/installer.html LEAD_STAGES literal includes Qualified between Contacted and Following up", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
  const m = html.match(/var LEAD_STAGES\s*=\s*(\[.*?\])/);
  assert.ok(m, "LEAD_STAGES array not found in installer.html");
  const stages = JSON.parse(m[1].replace(/'/g, '"'));
  const ci = stages.indexOf("Contacted");
  const qi = stages.indexOf("Qualified");
  const fi = stages.indexOf("Following up");
  assert.ok(qi !== -1, "Qualified missing from LEAD_STAGES");
  assert.ok(ci < qi, "Qualified must come after Contacted");
  assert.ok(qi < fi, "Qualified must come before Following up");
});
