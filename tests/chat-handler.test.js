const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processChat, escalate, MAX_MESSAGES, MAX_CHARS } = require("../netlify/functions/chat.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", ANTHROPIC_API_KEY: "k" };
const baseDeps = (over = {}) => ({
  env: ENV, log: { error: () => {} },
  load: async () => null,
  save: async (s) => s,
  ai: async () => ({ reply: "hello there", transfer: null }),
  doEscalate: async () => ({ installer: { name: "Aaron Groshong", phone: "(612) 406-7117" } }),
  ...over,
});

test("new session: creates, appends turns, returns reply", async () => {
  const saved = [];
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ save: async (s) => { saved.push(JSON.parse(JSON.stringify(s))); return s; } }));
  assert.equal(out.status, 200);
  assert.equal(out.body.reply, "hello there");
  assert.equal(saved[0].turns.length, 2); // user + assistant
});

test("caps: message too long → 400; session over MAX_MESSAGES → polite refusal, no AI call", async () => {
  const long = await processChat({ session: "s1", message: "x".repeat(MAX_CHARS + 1), page: "default" }, baseDeps());
  assert.equal(long.status, 400);
  let aiCalled = false;
  const turns = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => ({ role: "user", text: "m" + i, at: i }));
  const full = await processChat({ session: "s1", message: "one more", page: "default" },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "ai", turns, lastActivity: new Date().toISOString() }),
               ai: async () => { aiCalled = true; return { reply: "", transfer: null }; } }));
  assert.equal(full.status, 200);
  assert.match(full.body.reply, /find-your-exact-tune/);
  assert.equal(aiCalled, false);
});

test("closed/stale session rejects with fresh-start flag", async () => {
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "ai", turns: [], lastActivity: "2020-01-01T00:00:00Z" }) }));
  assert.equal(out.body.expired, true);
});

test("transfer path: escalates and tells customer the installer contact", async () => {
  const transfer = { customerName: "Ty", contactMethod: "phone", contactValue: "5075550101", vehicleMake: "Toyota",
    vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN", questionSummary: "fitment", reason: "no-answer" };
  let escArgs;
  const out = await processChat({ session: "s1", message: "person please", page: "default" },
    baseDeps({ ai: async () => ({ reply: "Connecting you.", transfer }),
               doEscalate: async (a) => { escArgs = a; return { installer: { name: "Aaron Groshong", phone: "(612) 406-7117" } }; } }));
  assert.equal(escArgs.transfer.city, "Rochester");
  assert.match(out.body.reply, /Aaron Groshong/);
  assert.match(out.body.reply, /\(612\) 406-7117/);
  assert.equal(out.body.escalated, true);
});

test("AI failure → fallback message with owner phone, not a 500", async () => {
  const out = await processChat({ session: "s1", message: "hi", page: "default" },
    baseDeps({ ai: async () => { throw new Error("anthropic 529"); } }));
  assert.equal(out.status, 200);
  assert.match(out.body.reply, /\(612\) 406-7117/);
});

test("poll returns turns after since index", async () => {
  const turns = [{ role: "user", text: "a", at: 1 }, { role: "installer", text: "b", at: 2 }];
  const out = await processChat({ session: "s1", poll: true, since: 1 },
    baseDeps({ load: async () => ({ id: "s1", recordId: "r", status: "escalated", turns, lastActivity: new Date().toISOString() }) }));
  assert.equal(out.body.turns.length, 1);
  assert.equal(out.body.turns[0].text, "b");
});

test("escalate: routes by city, creates lead, notifies, logs escalation — best-effort", async () => {
  const calls = [];
  const r = await escalate({ transfer: { customerName: "Ty", contactMethod: "phone", contactValue: "5075550101",
      vehicleMake: "Toyota", vehicleModel: "Tacoma", modelYear: "2019", city: "Rochester", state: "MN",
      questionSummary: "fitment", reason: "no-answer" },
    sess: { id: "s1", turns: [], pageContext: "default" } }, {
    env: ENV, log: { error: () => {} },
    ingest: async (b) => { calls.push(["lead", b]); return { ok: true }; },
    sms: async (a) => { calls.push(["sms", a]); return { ok: true }; },
    push: async (k) => { calls.push(["push", k]); return { sent: 1 }; },
    logEscalation: async (f) => { calls.push(["esc", f]); },
  });
  assert.equal(r.installer.key, "aaron"); // Rochester routes to aaron
  assert.deepEqual(calls.map((c) => c[0]).sort(), ["esc", "lead", "push", "sms"]);
  const lead = calls.find((c) => c[0] === "lead")[1];
  assert.equal(lead.channel, "chat");
  assert.match(lead.vehicle, /2019 Toyota Tacoma/);
});

test("escalate: notify failures never throw; customer still gets installer info", async () => {
  const r = await escalate({ transfer: { customerName: "T", contactMethod: "phone", contactValue: "1", vehicleMake: "T",
      vehicleModel: "T", modelYear: "1", city: "Nowhere", state: "ZZ", questionSummary: "q", reason: "guardrail" },
    sess: { id: "s1", turns: [], pageContext: "default" } }, {
    env: ENV, log: { error: () => {} },
    ingest: async () => { throw new Error("down"); }, sms: async () => { throw new Error("down"); },
    push: async () => { throw new Error("down"); }, logEscalation: async () => { throw new Error("down"); },
  });
  assert.equal(r.installer.key, "aaron"); // unknown city → fallback installer
});
