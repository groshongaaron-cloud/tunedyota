// Quiet-chat harvest (owner directive 2026-08-02): a DM/chat conversation that
// captured contact info but never escalated is a warm identified prospect — it
// must become a lead, tagged to its platform, instead of evaporating.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runHarvest } = require("../netlify/functions/chat-harvest.js");
const { isPlaceholderName } = require("../netlify/functions/lib/leads.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-08-02T18:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();

const sess = (id, over = {}) => ({ id, fields: {
  "Session ID": over.sid || "fb:100", Status: "ai", "Page Context": "facebook",
  "Customer Name": "", Phone: "(605) 555-1212", Vehicle: "Tundra", City: "Madison",
  "Last Activity": hoursAgo(24), ...over } });

function run(records, over = {}) {
  const ingests = [], stamps = [];
  return runHarvest({ env, now: NOW,
    list: async () => records,
    update: async (a) => { stamps.push(a); return {}; },
    ingest: async (b) => { ingests.push(b); return { status: "lead", recordId: "recNEW" }; },
    ...over }).then((out) => ({ out, ingests, stamps }));
}

test("harvests a quiet fb session with a phone into a facebook lead and stamps it", async () => {
  const { out, ingests, stamps } = await run([sess("r1")]);
  assert.equal(out.harvested, 1);
  assert.equal(ingests[0].channel, "facebook");
  assert.equal(ingests[0].source, "chat-harvest:facebook");
  assert.equal(ingests[0].phone, "(605) 555-1212");
  assert.match(ingests[0].name, /^Chat /, "placeholder name minted from phone");
  assert.equal(ingests[0].vehicle, "Tundra");
  assert.equal(stamps[0].fields["Harvested Lead"], "recNEW");
});

test("instagram pageContext tags instagram; widget sessions tag chat", async () => {
  const { ingests } = await run([
    sess("r1", { sid: "ig:1", "Page Context": "instagram" }),
    sess("r2", { sid: "w-uuid", "Page Context": "" }),
  ]);
  assert.deepEqual(ingests.map((i) => i.channel).sort(), ["chat", "instagram"]);
});

test("skips escalated, sms-relay, already-harvested, and still-fresh sessions", async () => {
  const { out, ingests } = await run([
    sess("r1", { Status: "escalated" }),
    sess("r2", { sid: "sms:+16055551212" }),
    sess("r3", { "Harvested Lead": "recOLD" }),
    sess("r4", { "Last Activity": hoursAgo(2) }),
  ]);
  assert.equal(ingests.length, 0);
  assert.equal(out.harvested, 0);
});

test("phone-less session is stamped skip:no-contact so it is never rescanned", async () => {
  const { ingests, stamps } = await run([sess("r1", { Phone: "" })]);
  assert.equal(ingests.length, 0);
  assert.equal(stamps[0].fields["Harvested Lead"], "skip:no-contact");
});

test("sessions older than the lookback window are left alone (no backfill flood)", async () => {
  const { ingests, stamps } = await run([sess("r1", { "Last Activity": hoursAgo(24 * 90) })]);
  assert.equal(ingests.length, 0);
  assert.equal(stamps.length, 0);
});

test("keeps a real captured name instead of the placeholder", async () => {
  const { ingests } = await run([sess("r1", { "Customer Name": "Eli Soetenga" })]);
  assert.equal(ingests[0].name, "Eli Soetenga");
});

test("per-run cap holds", async () => {
  const many = Array.from({ length: 40 }, (_, i) => sess("r" + i, { sid: "fb:" + i }));
  const { out } = await run(many);
  assert.ok(out.harvested <= 25, "capped at 25/run, got " + out.harvested);
});

test("'Chat …' names count as placeholders so later real names upgrade them", () => {
  assert.equal(isPlaceholderName("Chat (605) 555-1212"), true);
  assert.equal(isPlaceholderName("Chad Miller"), false, "real names starting Chad are NOT placeholders");
});
