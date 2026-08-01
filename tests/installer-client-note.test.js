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

test("empty and oversize notes are rejected", async () => {
  assert.equal((await processClientNote({ leadId: "recL", note: "  " }, { env, key: "cody" })).error, "missing-note");
  assert.equal((await processClientNote({ leadId: "recL", note: "x".repeat(501) }, { env, key: "cody" })).error, "note-too-long");
});
