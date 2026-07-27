const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processChat, escalate } = require("../netlify/functions/chat.js");

const ENV = { CHAT_DISPATCHER: "aaron", INSTALLER_SMS_NUMBERS: '{"aaron":"+16126557611"}' };
const NOW = Date.now();
const baseSess = (over) => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "cody",
  customerName: "Mark", vehicle: "2019 4Runner", phone: "+15075550123", pageContext: "sms", aiMode: "auto",
  turns: [{ role: "user", text: "hi", at: NOW - 1000 }], lastActivity: new Date(NOW).toISOString(), ...over });

test("client turn on an escalated session is relayed (awaited) before returning", async () => {
  let relayed = false, saved = null;
  await processChat({ session: "sms:+15075550123", message: "Saturday work?" }, {
    env: ENV, load: async () => baseSess(),
    relay: async (s, m) => { await new Promise((r) => setTimeout(r, 20)); relayed = { text: m }; },
    save: async (s) => { saved = s; },
    ai: async () => ({ reply: "AI answer" }),
  });
  assert.equal(relayed.text, "Saturday work?"); // frozen mid-air if not awaited
  assert.ok(saved);
});

test("relay failure never blocks the turn", async () => {
  let saved = null;
  const out = await processChat({ session: "sms:+15075550123", message: "hello?" }, {
    env: ENV, load: async () => baseSess(),
    relay: async () => { throw new Error("twilio down"); },
    save: async (s) => { saved = s; },
    ai: async () => ({ reply: "AI answer" }),
  });
  assert.equal(out.status, 200);
  assert.equal(saved.turns[saved.turns.length - 2].text, "hello?"); // user turn stored (AI turn after)
});

test("AI pause: installer replied 1h ago -> no AI reply, turn saved + relayed", async () => {
  let aiRan = false, relayed = false;
  const sess = baseSess({ turns: [{ role: "user", text: "hi", at: NOW - 7200000 }, { role: "installer", text: "on it", at: NOW - 3600000 }] });
  const out = await processChat({ session: sess.id, message: "thanks!" }, {
    env: ENV, load: async () => sess, relay: async () => { relayed = true; }, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "should not happen" }; },
  });
  assert.equal(aiRan, false);
  assert.equal(relayed, true);
  assert.equal(out.body.reply, "");
  assert.equal(out.body.escalated, true);
});

test("AI toggle off silences AI; on overrides the pause", async () => {
  let aiRan = false;
  await processChat({ session: "s", message: "q" }, {
    env: ENV, load: async () => baseSess({ aiMode: "off", turns: [] }), relay: async () => {}, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "x" }; },
  });
  assert.equal(aiRan, false);
  await processChat({ session: "s", message: "q" }, {
    env: ENV, load: async () => baseSess({ aiMode: "on", turns: [{ role: "installer", text: "x", at: NOW - 1000 }] }),
    relay: async () => {}, save: async () => {},
    ai: async () => { aiRan = true; return { reply: "x" }; },
  });
  assert.equal(aiRan, true);
});

test("escalate routes SMS to the dispatcher and appends the dispatch hint", async () => {
  const sms = [];
  const transfer = { customerName: "Cody Smith", contactMethod: "phone", contactValue: "+15074449999",
    modelYear: "2021", vehicleMake: "Toyota", vehicleModel: "Tundra", city: "Omaha", state: "NE",
    questionSummary: "supercharger fitment", reason: "asked-for-human" };
  const { installer } = await escalate({ transfer, sess: { id: "s", turns: [], pageContext: "sms" } }, {
    env: ENV, ingest: async () => {}, push: async () => {}, logEscalation: async () => {},
    sms: async (a) => { sms.push(a); },
  });
  assert.equal(installer.key, "aaron"); // dispatcher, NOT Omaha's market installer (cody)
  assert.equal(sms[0].to, "+16126557611");
  assert.match(sms[0].body, /@cody|@noah/);
});

test("plain AI session never relays — relay only fires on escalated threads", async () => {
  let relayCalled = false;
  await processChat({ session: "web-2", message: "what tunes fit a 2021 Tundra?" }, {
    env: ENV, load: async () => ({ id: "web-2", recordId: "r", status: "ai", pageContext: "default", aiMode: "auto",
      turns: [], lastActivity: new Date().toISOString() }),
    relay: async () => { relayCalled = true; },
    save: async () => {},
    ai: async () => ({ reply: "Plenty — what's your setup?" }),
  });
  assert.equal(relayCalled, false);
});

test("new escalation leaves the session unassigned and stamps lastRelayedAt", async () => {
  let saved = null;
  await processChat({ session: "web-1", message: "help", page: "default" }, {
    env: ENV, load: async () => null, relay: async () => {}, save: async (s) => { saved = s; },
    ai: async () => ({ reply: "connecting you", transfer: { customerName: "C", contactMethod: "phone", contactValue: "+15074449999",
      modelYear: "2021", vehicleMake: "Toyota", vehicleModel: "Tundra", city: "Omaha", state: "NE",
      questionSummary: "q", reason: "asked-for-human" } }),
    doEscalate: async () => ({ installer: { key: "aaron", name: "Aaron Groshong", phone: "(612) 406-7117" } }),
  });
  assert.equal(saved.installer, ""); // dispatcher-first: dispatch assigns, not escalation
  assert.ok(saved.lastRelayedAt, "escalation SMS counts as the first relay");
  assert.equal(saved.status, "escalated");
});
