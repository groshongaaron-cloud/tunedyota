// Quiet-chat harvest (owner directives 2026-08-02): EVERY person who reaches
// out becomes a CRM data point. DM sessions (fb/ig) mint a lead even without a
// phone — the platform itself is the contact route — carrying the person's
// name, the channel they used, and the questions they asked as notes. Widget
// sessions still need a phone (no reply route once the tab closes).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runHarvest, extractQuestions } = require("../netlify/functions/chat-harvest.js");
const { isPlaceholderName } = require("../netlify/functions/lib/leads.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const NOW = new Date("2026-08-02T18:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
const TURNS = JSON.stringify([
  { role: "user", text: "Do you guys tune 2021 Tundras?", at: 1 },
  { role: "assistant", text: "We sure do.", at: 2 },
  { role: "user", text: "How much is it and do you come to Omaha?", at: 3 },
]);

const sess = (id, over = {}) => ({ id, fields: {
  "Session ID": over.sid || "fb:100", Status: "ai", "Page Context": "facebook",
  "Customer Name": "", Phone: "(605) 555-1212", Vehicle: "Tundra", City: "Madison",
  Transcript: TURNS, "Last Activity": hoursAgo(24), ...over } });

function run(records, over = {}) {
  const ingests = [], stamps = [], creates = [], patches = [];
  return runHarvest({ env, now: NOW,
    list: async () => records,
    update: async (a) => { (a.table === "Chat Sessions" ? stamps : patches).push(a); return {}; },
    create: async (a) => { creates.push(a); return { id: "recDIRECT" }; },
    ingest: async (b) => { ingests.push(b); return { status: "lead", recordId: "recNEW" }; },
    profile: async () => null,
    ...over }).then((out) => ({ out, ingests, stamps, creates, patches }));
}

test("extractQuestions pulls the customer's questions from a transcript", () => {
  const qs = extractQuestions(TURNS);
  assert.deepEqual(qs, ["Do you guys tune 2021 Tundras?", "How much is it and do you come to Omaha?"]);
  assert.deepEqual(extractQuestions("not json"), []);
});

test("phone session: ingested lead ALSO gets the questions + session ref patched on", async () => {
  const { out, ingests, patches, stamps } = await run([sess("r1")]);
  assert.equal(out.harvested, 1);
  assert.equal(ingests[0].channel, "facebook");
  assert.match(patches[0].fields["Client Notes"] || "", /2021 Tundras\?/, "questions land in Client Notes");
  assert.equal(patches[0].fields["Chat Session"], "fb:100");
  assert.equal(stamps[0].fields["Harvested Lead"], "recNEW");
});

test("PHONE-LESS fb DM still becomes a lead: platform is the contact route", async () => {
  const { out, creates, ingests, stamps } = await run([sess("r1", { Phone: "" })]);
  assert.equal(out.harvested, 1);
  assert.equal(ingests.length, 0, "direct create — ingest requires phone/email");
  const f = creates[0].fields;
  assert.equal(f.Channel, "facebook");
  assert.equal(f.Source, "chat-harvest:facebook");
  assert.equal(f["Chat Session"], "fb:100");
  assert.match(f.Name, /^Chat \(Messenger\)/, "reachable-route placeholder name");
  assert.match(f["Client Notes"] || "", /Omaha\?/, "their questions ride as notes");
  assert.equal(f.Stage, "New");
  assert.equal(stamps[0].fields["Harvested Lead"], "recDIRECT");
});

test("phone-less DM uses the Meta profile name when the session has none", async () => {
  const { creates } = await run([sess("r1", { Phone: "" })],
    { profile: async (senderId) => (senderId === "100" ? "Dana Fields" : null) });
  assert.equal(creates[0].fields.Name, "Dana Fields");
});

test("phone-less WIDGET session is still skipped — no reply route", async () => {
  const { out, creates, stamps } = await run([sess("r1", { sid: "w-uuid", "Page Context": "", Phone: "" })]);
  assert.equal(out.harvested, 0);
  assert.equal(creates.length, 0);
  assert.equal(stamps[0].fields["Harvested Lead"], "skip:no-contact");
});

test("sessions previously stamped skip:no-contact are re-considered under capture-all", async () => {
  const { out, creates } = await run([sess("r1", { Phone: "", "Harvested Lead": "skip:no-contact" })]);
  assert.equal(out.harvested, 1);
  assert.equal(creates.length, 1);
});

test("skips escalated, sms-relay, lead-stamped, and still-fresh sessions", async () => {
  const { ingests, creates } = await run([
    sess("r1", { Status: "escalated" }),
    sess("r2", { sid: "sms:+16055551212" }),
    sess("r3", { "Harvested Lead": "recOLD" }),
    sess("r4", { "Last Activity": hoursAgo(2) }),
  ]);
  assert.equal(ingests.length + creates.length, 0);
});

test("instagram phone-less placeholder names the platform", async () => {
  const { creates } = await run([sess("r1", { sid: "ig:7", "Page Context": "instagram", Phone: "" })]);
  assert.match(creates[0].fields.Name, /^Chat \(Instagram\)/);
  assert.equal(creates[0].fields.Channel, "instagram");
});

test("'Chat (Messenger) …' counts as a placeholder for later name upgrades", () => {
  assert.equal(isPlaceholderName("Chat (Messenger) fb:100"), true);
  assert.equal(isPlaceholderName("Dana Fields"), false);
});

test("per-run cap holds", async () => {
  const many = Array.from({ length: 40 }, (_, i) => sess("r" + i, { sid: "fb:" + i }));
  const { out } = await run(many);
  assert.ok(out.harvested <= 25, "capped at 25/run, got " + out.harvested);
});
