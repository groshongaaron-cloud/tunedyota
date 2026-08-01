// Client notes travel with the CLIENT record (Lead), never the booking
// (owner rule 2026-07-31). Stamped append-only lines, server-side stamp.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { toLeadView } = require("../netlify/functions/lib/leads.js");

test("toLeadView exposes Client Notes as clientNotes", () => {
  const v = toLeadView({ id: "recL", fields: { Name: "Jane", "Client Notes": "2026-07-31 14:03 — cody: has aFe CAI" } });
  assert.equal(v.clientNotes, "2026-07-31 14:03 — cody: has aFe CAI");
  assert.equal(toLeadView({ id: "recL", fields: {} }).clientNotes, "");
});
