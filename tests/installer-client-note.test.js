// Client notes travel with the CLIENT record (Lead), never the booking
// (owner rule 2026-07-31). Stamped append-only lines, server-side stamp.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toLeadView } = require("../netlify/functions/lib/leads.js");
const { processClientNote } = require("../netlify/functions/installer-client-note.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-07-31T14:03:00Z");
const leadRec = (installer, extra = {}) => ({ id: "recL", fields: { Name: "Jane", Installer: installer, Phone: "(612) 555-0100", ...extra } });

test("toLeadView exposes Client Notes as clientNotes", () => {
  const v = toLeadView({ id: "recL", fields: { Name: "Jane", "Client Notes": "2026-07-31 14:03 — cody: has aFe CAI" } });
  assert.equal(v.clientNotes, "2026-07-31 14:03 — cody: has aFe CAI");
  assert.equal(toLeadView({ id: "recL", fields: {} }).clientNotes, "");
});

test("lead path appends a stamped line and touches nothing else", async () => {
  let patched;
  const out = await processClientNote({ leadId: "recL", note: "has aFe cold air intake" },
    { env, key: "cody", now: NOW, get: async () => leadRec("cody", { "Client Notes": "2026-07-30 09:00 — cody: wants 91 octane cal" }),
      update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.fields["Client Notes"],
    "2026-07-30 09:00 — cody: wants 91 octane cal\n2026-07-31 14:03 — cody: has aFe cold air intake");
  assert.deepEqual(Object.keys(patched.fields), ["Client Notes"]); // no Last Contact bump
  assert.equal(out.notes, patched.fields["Client Notes"]);
});

test("first note on a lead needs no existing text", async () => {
  let patched;
  const out = await processClientNote({ leadId: "recL", note: "prefers text" },
    { env, key: "cody", now: NOW, get: async () => leadRec("cody"), update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(patched.fields["Client Notes"], "2026-07-31 14:03 — cody: prefers text");
});

test("lead path rejects another installer's lead; admin passes", async () => {
  const deny = await processClientNote({ leadId: "recL", note: "x" },
    { env, key: "noah", now: NOW, get: async () => leadRec("cody"), update: async () => ({}) });
  assert.equal(deny.error, "not-yours");
  const ok = await processClientNote({ leadId: "recL", note: "x" },
    { env, key: "aaron", admin: true, now: NOW, get: async () => leadRec("cody"), update: async () => ({}) });
  assert.equal(ok.status, "ok");
});

const bookingRec = (extra = {}) => ({ id: "recB", fields: { Name: "Jane", Installer: ["cody"], Status: "Booked",
  Phone: "(612) 555-0100", Email: "jane@x.com", City: "Madison", Vehicle: "2019 Tacoma 3.5L", ...extra } });
const leadRow = (extra = {}) => ({ id: "recL", fields: { Name: "Jane", Installer: "cody", Phone: "612-555-0100", ...extra } });

test("booking path finds the linked lead first", async () => {
  let patched;
  const out = await processClientNote({ bookingId: "recB", note: "has aFe CAI" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(),
      list: async () => [leadRow({ Booking: ["recB"], Phone: "999" }), leadRow({ Phone: "612-555-0100" })],
      update: async (a) => { patched = a; return {}; } });
  assert.equal(out.status, "ok");
  assert.equal(out.leadId, "recL");
  assert.equal(out.minted, false);
  assert.equal(patched.table, "Priority List");
  assert.equal(patched.fields["Client Notes"], "2026-07-31 14:03 — cody: has aFe CAI");
});

test("booking path falls back to a normalized phone match", async () => {
  const out = await processClientNote({ bookingId: "recB", note: "n" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(),
      list: async () => [leadRow({ Phone: "+1 (612) 555-0100" })],
      update: async () => ({}) });
  assert.equal(out.status, "ok");
  assert.equal(out.leadId, "recL");
});

test("booking path mints a market-routed linked lead when no client exists", async () => {
  let created;
  const out = await processClientNote({ bookingId: "recB", note: "has aFe CAI" },
    { env, key: "cody", now: NOW, get: async () => bookingRec(), list: async () => [],
      create: async (a) => { created = a; return { id: "recNew" }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.minted, true);
  assert.equal(out.leadId, "recNew");
  assert.equal(created.fields.Name, "Jane");
  assert.equal(created.fields.Stage, "Booked");
  assert.deepEqual(created.fields.Booking, ["recB"]);
  assert.equal(created.fields["Converted Booking"], "recB");
  assert.ok(created.fields.Installer, "installer set (market-routed or booking owner)");
  assert.equal(created.fields["Client Notes"], "2026-07-31 14:03 — cody: has aFe CAI");
  assert.match(created.fields["Activity Log"], /minted from booking recB/);
});

test("notes are allowed on a Completed booking", async () => {
  const out = await processClientNote({ bookingId: "recB", note: "noticed CAI during flash" },
    { env, key: "cody", now: NOW, get: async () => bookingRec({ Status: "Completed" }),
      list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(out.status, "ok");
});

test("booking path rejects another installer's booking; admin passes", async () => {
  const deny = await processClientNote({ bookingId: "recB", note: "x" },
    { env, key: "noah", now: NOW, get: async () => bookingRec(), list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(deny.error, "not-yours");
  const ok = await processClientNote({ bookingId: "recB", note: "x" },
    { env, key: "aaron", admin: true, now: NOW, get: async () => bookingRec(), list: async () => [leadRow()], update: async () => ({}) });
  assert.equal(ok.status, "ok");
});

test("empty and oversize notes are rejected", async () => {
  assert.equal((await processClientNote({ leadId: "recL", note: "  " }, { env, key: "cody" })).error, "missing-note");
  assert.equal((await processClientNote({ leadId: "recL", note: "x".repeat(501) }, { env, key: "cody" })).error, "note-too-long");
});
