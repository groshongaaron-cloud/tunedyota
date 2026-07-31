// tests/lead-followup-message.test.js
// Follow-ups that carry a message: setFollowup stores it, followupSent clears it.
const test = require("node:test");
const assert = require("node:assert");
const { applyLeadUpdate, toLeadView } = require("../netlify/functions/lib/leads.js");

const NOW = new Date("2026-07-30T15:00:00Z");
const lead = { activity: "old line", stage: "Qualified" };

test("setFollowup stores date + message and logs both", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02", message: "Hey Sam — spot open Saturday, want it?" }, NOW);
  assert.equal(out.fields["Next Follow-up"], "2026-08-02");
  assert.equal(out.fields["Follow-up Message"], "Hey Sam — spot open Saturday, want it?");
  assert.match(out.fields["Activity Log"], /follow-up set 2026-08-02 — "Hey Sam/);
});

test("setFollowup without a message still works, message cleared", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02" }, NOW);
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up set 2026-08-02$/m);
});

test("setFollowup caps the message at 500 chars", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "2026-08-02", message: "x".repeat(600) }, NOW);
  assert.equal(out.fields["Follow-up Message"].length, 500);
});

test("clearing the date clears the message too", () => {
  const out = applyLeadUpdate(lead, "setFollowup", { date: "", message: "stale" }, NOW);
  assert.equal(out.fields["Next Follow-up"], "");
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up cleared/);
});

test("bad date still rejected", () => {
  assert.equal(applyLeadUpdate(lead, "setFollowup", { date: "8/2/26" }, NOW).error, "bad-date");
});

test("followupSent stamps Last Contact and clears date + message", () => {
  const out = applyLeadUpdate(lead, "followupSent", { note: "Hey Sam — spot open Saturday" }, NOW);
  assert.equal(out.fields["Last Contact"], "2026-07-30");
  assert.equal(out.fields["Next Follow-up"], "");
  assert.equal(out.fields["Follow-up Message"], "");
  assert.match(out.fields["Activity Log"], /follow-up sent: "Hey Sam — spot open Saturday"/);
});

test("toLeadView exposes followupMessage", () => {
  const v = toLeadView({ id: "rec1", fields: { Name: "Sam", "Follow-up Message": "msg" } });
  assert.equal(v.followupMessage, "msg");
});
