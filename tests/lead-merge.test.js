// tests/lead-merge.test.js — absorb+delete mechanics (spec decisions 1–2, 2026-07-31)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeMerge, isPlaceholderName } = require("../netlify/functions/lib/leads.js");
const NOW = new Date("2026-08-01T15:00:00Z");
const R = (id, fields) => ({ id, fields });

test("survivor is the earlier Created Time, regardless of argument order", () => {
  const a = R("recOld", { "Created Time": "2026-07-01T00:00:00Z" });
  const b = R("recNew", { "Created Time": "2026-07-20T00:00:00Z" });
  assert.equal(computeMerge(a, b, NOW).survivorId, "recOld");
  assert.equal(computeMerge(b, a, NOW).survivorId, "recOld");
  assert.equal(computeMerge(b, a, NOW).duplicateId, "recNew");
});

test("blanks fill from the duplicate; placeholder names count as blank; real values never overwritten", () => {
  const a = R("recOld", { "Created Time": "2026-07-01T00:00:00Z", Name: "Text 619-417-6865", Phone: "6194176865", Vehicle: "" });
  const b = R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Name: "Eli Soetenga", Email: "eli@x.com", Vehicle: "Tundra 5.7L", "Model Year": "2014" });
  const m = computeMerge(a, b, NOW);
  assert.equal(m.fields.Name, "Eli Soetenga");
  assert.equal(m.fields.Email, "eli@x.com");
  assert.equal(m.fields.Vehicle, "Tundra 5.7L");
  assert.equal(m.fields["Model Year"], "2014");
  assert.equal(m.fields.Phone, undefined, "survivor's real phone untouched");
  assert.ok(isPlaceholderName("Caller (612) 555-0100"));
  assert.ok(!isPlaceholderName("Eli Soetenga"));
});

test("stage keeps the most advanced; Not now never overrides an active stage", () => {
  const mk = (sStage, dStage) => computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", Stage: sStage }),
    R("b", { "Created Time": "2026-07-20T00:00:00Z", Stage: dStage }), NOW).fields.Stage;
  assert.equal(mk("New", "Booked"), "Booked");
  assert.equal(mk("Booked", "New"), undefined);
  assert.equal(mk("Contacted", "Not now"), undefined);
  assert.equal(mk("Not now", "Contacted"), "Contacted");
});

test("booking links union; legacy text id fills only when survivor's is blank", () => {
  const m = computeMerge(
    R("recA", { "Created Time": "2026-07-01T00:00:00Z", Booking: ["recB1"] }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Booking: ["recB2"], "Converted Booking": "recB2" }), NOW);
  assert.deepEqual(m.fields.Booking, ["recB1", "recB2"]);
  assert.equal(m.fields["Converted Booking"], "recB2", "survivor had no legacy id — the duplicate's fills");
});

test("notes and activity append under a stamped merge divider naming the duplicate", () => {
  const m = computeMerge(
    R("recA", { "Created Time": "2026-07-01T00:00:00Z", "Client Notes": "old note", "Activity Log": "old log" }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", Channel: "sms", Name: "Text 619", "Client Notes": "dup note", "Activity Log": "dup log" }), NOW);
  assert.match(m.fields["Activity Log"], /^old log\n/);
  assert.match(m.fields["Activity Log"], /merged in recNew — sms "Text 619"/);
  assert.match(m.fields["Client Notes"], /^old note\n/);
  assert.match(m.fields["Client Notes"], /dup note$/);
});

test("follow-up urgency: earlier Next Follow-up and later Last Contact win", () => {
  const m = computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", "Next Follow-up": "2026-08-20", "Last Contact": "2026-07-01" }),
    R("b", { "Created Time": "2026-07-20T00:00:00Z", "Next Follow-up": "2026-08-05", "Last Contact": "2026-07-28" }), NOW);
  assert.equal(m.fields["Next Follow-up"], "2026-08-05");
  assert.equal(m.fields["Last Contact"], "2026-07-28");
});

test("idempotent: a survivor already stamped with this duplicate re-appends nothing", () => {
  const m = computeMerge(
    R("a", { "Created Time": "2026-07-01T00:00:00Z", "Activity Log": "x\n2026-08-01 15:00 — merged in recNew — sms \"Text 619\"" }),
    R("recNew", { "Created Time": "2026-07-20T00:00:00Z", "Activity Log": "dup log" }), NOW);
  assert.equal(m.already, true);
  assert.equal(m.fields["Activity Log"], undefined);
});
