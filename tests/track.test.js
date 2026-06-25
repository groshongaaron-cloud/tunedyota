const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processTrack } = require("../netlify/functions/track.js");

function deps(overrides = {}) {
  const creates = [];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" },
    create: async (a) => { creates.push(a); return { id: "r1" }; },
    log: { error() {} },
    _creates: creates,
    ...overrides,
  };
}

test("valid payload writes a mapped Funnel Events row", async () => {
  const d = deps();
  const r = await processTrack({ sid: "s_x", step: 2, name: "config", utm_source: "ig" }, d);
  assert.equal(r.stored, true);
  assert.equal(d._creates.length, 1);
  assert.equal(d._creates[0].table, "Funnel Events");
  assert.equal(d._creates[0].fields.Session, "s_x");
  assert.equal(d._creates[0].fields.Step, 2);
  assert.equal(d._creates[0].fields["Step Name"], "config");
  assert.equal(d._creates[0].fields["UTM Source"], "ig");
});
test("invalid / honeypot payloads do not write", async () => {
  const d = deps();
  assert.equal((await processTrack({ step: 2 }, d)).stored, false);
  assert.equal((await processTrack({ sid: "s", step: "2" }, d)).stored, false);
  assert.equal((await processTrack({ sid: "s", step: 1, bot_field: "x" }, d)).stored, false);
  assert.equal(d._creates.length, 0);
});
test("a store error is swallowed (never throws)", async () => {
  const d = deps({ create: async () => { throw new Error("airtable 429"); } });
  const r = await processTrack({ sid: "s", step: 0, name: "make" }, d);
  assert.equal(r.stored, false);
  assert.equal(r.reason, "store");
});
