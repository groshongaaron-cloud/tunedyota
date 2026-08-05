// tests/chat-admin.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../netlify/functions/lib/chat-admin.js");
const { installerOp } = require("../netlify/functions/chat.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const SESS = (over = {}) => Object.assign({
  id: "s1", recordId: "recX", status: "escalated", pageContext: "default",
  customerName: "Pat", phone: "612", vehicle: "Toyota Tundra", city: "Lakeville",
  installer: "aaron", turns: [{ role: "user", text: "hi", at: 1 }], lastActivity: "2026-07-20T10:00:00Z",
}, over);

test("listSessions filters escalated for installer OR unassigned, sorts newest first", async () => {
  let gotFormula = "";
  const fetchImpl = async (url) => {
    gotFormula = decodeURIComponent(url);
    return { ok: true, json: async () => ({ records: [
      { id: "r1", fields: { "Session ID": "s1", Status: "escalated", "Customer Name": "Pat", Installer: "aaron", Transcript: '[{"role":"user","text":"hi","at":1}]', "Last Activity": "2026-07-20T09:00:00Z" } },
      { id: "r2", fields: { "Session ID": "s2", Status: "escalated", "Customer Name": "Lee", Installer: "", Transcript: '[{"role":"user","text":"yo","at":2}]', "Last Activity": "2026-07-20T11:00:00Z" } },
    ] }) };
  };
  const out = await admin.listSessions("aaron", { env: ENV, fetchImpl });
  assert.ok(gotFormula.includes('escalated'));
  assert.ok(gotFormula.includes('aaron'));
  assert.equal(out[0].id, "s2"); // newer activity first
  assert.equal(out[1].lastRole, "user");
});

test("listSessions surfaces active Facebook/Instagram threads even before they escalate", async () => {
  let gotFormula = "";
  const fetchImpl = async (url) => {
    gotFormula = decodeURIComponent(url).replace(/\+/g, " "); // URLSearchParams encodes spaces as "+"
    return { ok: true, json: async () => ({ records: [
      { id: "r1", fields: { "Session ID": "fb:PSID1", Status: "ai", Installer: "", Transcript: '[{"role":"assistant","text":"Hi there!","at":5}]', "Last Activity": "2026-08-04T10:00:00Z" } },
    ] }) };
  };
  const out = await admin.listSessions("aaron", { env: ENV, fetchImpl });
  // The filter must now reach non-escalated fb:/ig: sessions (the FB-connection fix).
  assert.ok(gotFormula.includes('LEFT({Session ID},3)="fb:"'));
  assert.ok(gotFormula.includes('LEFT({Session ID},3)="ig:"'));
  assert.equal(out[0].id, "fb:PSID1");
  assert.equal(out[0].status, "ai");        // surfaced while still AI-handled
  assert.equal(out[0].lastRole, "assistant");
});

test("listSessions tags each session with a derived channel", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ records: [
    { id: "r1", fields: { "Session ID": "fb:1", Status: "ai", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T04:00:00Z" } },
    { id: "r2", fields: { "Session ID": "ig:2", Status: "ai", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T03:00:00Z" } },
    { id: "r3", fields: { "Session ID": "sms:+15551234567", Status: "escalated", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T02:00:00Z" } },
    { id: "r4", fields: { "Session ID": "abd7-uuid", Status: "escalated", Installer: "", Transcript: "[]", "Last Activity": "2026-08-05T01:00:00Z" } },
  ] }) });
  const out = await admin.listSessions("aaron", { env: ENV, fetchImpl });
  const byId = Object.fromEntries(out.map((s) => [s.id, s.channel]));
  assert.equal(byId["fb:1"], "facebook");
  assert.equal(byId["ig:2"], "instagram");
  assert.equal(byId["sms:+15551234567"], "text");
  assert.equal(byId["abd7-uuid"], "web");
});

test("listSessions view=completed returns only closed threads (mine/unassigned)", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl, view: "completed" });
  assert.ok(formula.includes('{Status}="closed"'));
  assert.ok(!formula.includes('{Status}="escalated"'));
  assert.ok(formula.includes('{Installer}="aaron"'));
});

test("listSessions view=facebook scopes the open set to fb: threads", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl, view: "facebook" });
  assert.ok(formula.includes('LEFT({Session ID},3)="fb:"'));
  assert.ok(formula.includes('{Status}="escalated"')); // still the open set, intersected with the channel
});

test("listSessions default view=open is unchanged (escalated + live fb/ig)", async () => {
  let formula = "";
  const fetchImpl = async (url) => { formula = decodeURIComponent(url).replace(/\+/g, " "); return { ok: true, json: async () => ({ records: [] }) }; };
  await admin.listSessions("aaron", { env: ENV, fetchImpl });
  assert.ok(formula.includes('{Status}="escalated"'));
  assert.ok(formula.includes('LEFT({Session ID},3)="fb:"'));
  assert.ok(formula.includes('LEFT({Session ID},3)="ig:"'));
  assert.ok(!formula.includes('{Status}="closed"'));
});

test("installerReply promotes a live (not-yet-escalated) Facebook thread and claims it", async () => {
  const saved = [];
  let deliveredTurn = null;
  const out = await admin.installerReply("fb:PSID1", "aaron", "Happy to help with your 4Runner!", {
    env: ENV,
    loadFn: async () => ({ id: "fb:PSID1", status: "ai", installer: "", turns: [{ role: "user", text: "do you tune 4runners?", at: 1 }] }),
    saveFn: async (s) => { saved.push(s); return s; },
    onInstallerTurn: async (s, t) => { deliveredTurn = t; },
    now: () => 999,
  });
  assert.equal(out.status, "ok");
  assert.equal(saved[0].status, "escalated");   // human takeover promotes the thread
  assert.equal(saved[0].installer, "aaron");    // and claims it
  assert.deepEqual(saved[0].turns[saved[0].turns.length - 1], { role: "installer", text: "Happy to help with your 4Runner!", at: 999 });
  assert.ok(deliveredTurn, "reply is delivered out to Messenger");
});

test("installerReply refuses a CLOSED Facebook thread (only live ones are answerable)", async () => {
  const r = await admin.installerReply("fb:PSID1", "aaron", "x", {
    env: ENV, loadFn: async () => ({ id: "fb:PSID1", status: "closed", installer: "", turns: [] }), saveFn: async (s) => s });
  assert.equal(r.error, "not-escalated");
});

test("installerReply appends the SAME turn shape as the SMS relay and claims unassigned", async () => {
  const saved = [];
  const out = await admin.installerReply("s1", "noah", "  On my way  ", {
    env: ENV,
    loadFn: async () => SESS({ installer: "" }),
    saveFn: async (s) => { saved.push(s); return s; },
    now: () => 777,
  });
  assert.equal(out.status, "ok");
  const s = saved[0];
  assert.equal(s.installer, "noah"); // claimed
  assert.deepEqual(s.turns[s.turns.length - 1], { role: "installer", text: "On my way", at: 777 });
});

test("installerReply refuses non-escalated and missing sessions", async () => {
  assert.deepEqual((await admin.installerReply("s1", "aaron", "x", { env: ENV, loadFn: async () => SESS({ status: "ai" }), saveFn: async (s) => s })).error, "not-escalated");
  assert.deepEqual((await admin.installerReply("nope", "aaron", "x", { env: ENV, loadFn: async () => null, saveFn: async (s) => s })).error, "not-found");
  assert.deepEqual((await admin.installerReply("s1", "aaron", "   ", { env: ENV, loadFn: async () => SESS(), saveFn: async (s) => s })).error, "empty");
});

test("installerReply awaits Meta delivery before returning (Lambda freezes un-awaited work)", async () => {
  let delivered = false;
  const out = await admin.installerReply("fb:P1", "cody", "on it", {
    env: ENV,
    loadFn: async () => SESS({ id: "fb:P1" }),
    saveFn: async (s) => s,
    onInstallerTurn: async () => { await new Promise((r) => setTimeout(r, 20)); delivered = true; },
  });
  assert.equal(out.status, "ok");
  assert.equal(delivered, true); // frozen mid-air if the reply returned first
});

test("installerReply still succeeds when delivery throws (turn is already saved)", async () => {
  const out = await admin.installerReply("fb:P1", "cody", "on it", {
    env: ENV,
    loadFn: async () => SESS({ id: "fb:P1" }),
    saveFn: async (s) => s,
    onInstallerTurn: async () => { throw new Error("graph down"); },
  });
  assert.equal(out.status, "ok");
});

test("closeSession sets status closed", async () => {
  const saved = [];
  const out = await admin.closeSession("s1", { env: ENV, loadFn: async () => SESS(), saveFn: async (s) => { saved.push(s); return s; } });
  assert.equal(out.status, "ok");
  assert.equal(saved[0].status, "closed");
});

test("installerOp routes ops and rejects bad ops", async () => {
  const deps = { list: async () => [{ id: "s1" }], transcript: async () => ({ id: "s1", turns: [] }), reply: async () => ({ status: "ok", turnCount: 2 }), close: async () => ({ status: "ok" }) };
  assert.equal((await installerOp({ op: "list" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "transcript", session: "s1" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "reply", session: "s1", text: "hi" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "close", session: "s1" }, "aaron", deps)).status, 200);
  assert.equal((await installerOp({ op: "wat" }, "aaron", deps)).status, 400);
  const missing = { ...deps, transcript: async () => null };
  assert.equal((await installerOp({ op: "transcript", session: "zz" }, "aaron", missing)).status, 404);
});

test("installerOp op:list forwards the requested view to the lister", async () => {
  let gotView;
  const deps = { list: async (_key, o) => { gotView = (o || {}).view; return []; } };
  await installerOp({ op: "list", view: "completed" }, "aaron", deps);
  assert.equal(gotView, "completed");
});

test("handler 401s installer ops without a valid token", async () => {
  const { handler } = require("../netlify/functions/chat.js");
  const prev = process.env.INSTALLER_TOKENS;
  delete process.env.INSTALLER_TOKENS;
  const res = await handler({ httpMethod: "POST", headers: {}, body: JSON.stringify({ installer: true, op: "list" }) });
  if (prev !== undefined) process.env.INSTALLER_TOKENS = prev;
  assert.equal(res.statusCode, 401);
});

test("client message on an escalated session notifies the installer, ai session does not", async () => {
  const { processChat } = require("../netlify/functions/chat.js");
  const pings = [];
  const mk = (status) => ({
    env: ENV, log: { error: () => {} },
    load: async () => SESS({ status, lastActivity: new Date().toISOString() }),
    save: async (s) => s,
    ai: async () => ({ reply: "ok", transfer: null }),
    relay: async () => {}, // stub: default relayClientTurn would hit live Airtable/Twilio
    notify: async (sess, text) => { pings.push([sess.installer, text]); },
  });
  await processChat({ session: "s1", message: "are you there?" }, mk("escalated"));
  assert.deepEqual(pings, [["aaron", "are you there?"]]);
  await processChat({ session: "s1", message: "hello" }, mk("ai"));
  assert.equal(pings.length, 1);
});

test("sync-throwing notify does not prevent customer from receiving a 200 reply", async () => {
  const { processChat } = require("../netlify/functions/chat.js");
  const deps = {
    env: ENV, log: { error: () => {} },
    load: async () => SESS({ status: "escalated", lastActivity: new Date().toISOString() }),
    save: async (s) => s,
    ai: async () => ({ reply: "ok", transfer: null }),
    relay: async () => {}, // stub: default relayClientTurn would hit live Airtable/Twilio
    notify: function () { throw new Error("sync boom"); },
  };
  const out = await processChat({ session: "s1", message: "still there?" }, deps);
  assert.equal(out.status, 200);
  assert.ok(out.body.reply);
});

// --- openSmsThread (installer-initiated client texting) ---

const { openSmsThread } = require("../netlify/functions/lib/chat-admin.js");

test("openSmsThread creates a human-only escalated session bound to the installer", async () => {
  const saved = [];
  const r = await openSmsThread({ phone: "(218) 555-1234", name: "Pat Client", vehicle: "2019 4Runner" }, "cody",
    { loadActive: async () => null, loadFn: async () => null, saveFn: async (s) => { saved.push(s); return s; } });
  assert.equal(r.status, "ok");
  assert.equal(r.session, "sms:+12185551234");
  assert.equal(r.isNew, true);
  assert.equal(saved[0].status, "escalated");
  assert.equal(saved[0].pageContext, "sms-direct");
  assert.equal(saved[0].installer, "cody");
  assert.equal(saved[0].phone, "+12185551234");
});

test("openSmsThread reuses an existing active thread", async () => {
  const r = await openSmsThread({ phone: "2185551234" }, "cody",
    { loadActive: async () => ({ id: "sms:+12185551234:99" }), saveFn: async () => { throw new Error("should not save"); } });
  assert.equal(r.isNew, false);
  assert.equal(r.session, "sms:+12185551234:99");
});

test("openSmsThread rejects a bad phone", async () => {
  const r = await openSmsThread({ phone: "911" }, "cody", { loadActive: async () => null, saveFn: async () => {} });
  assert.equal(r.status, "error");
});

// ---- chat assignment (owner ask 2026-07-24: route a known-market chat to its installer) ----

test("assignSession: admin assigns any chat to any installer", async () => {
  let saved = null;
  const r = await admin.assignSession("s1", "noah", "aaron", true,
    { env: ENV, loadFn: async () => SESS({ installer: "" }), saveFn: async (s) => { saved = s; return s; } });
  assert.equal(r.status, "ok");
  assert.equal(r.installer, "noah");
  assert.equal(saved.installer, "noah");
});

test("assignSession: a non-admin may claim a chat for THEMSELVES", async () => {
  let saved = null;
  const r = await admin.assignSession("s1", "cody", "cody", false,
    { env: ENV, loadFn: async () => SESS({ installer: "" }), saveFn: async (s) => { saved = s; return s; } });
  assert.equal(r.status, "ok");
  assert.equal(saved.installer, "cody");
});

test("assignSession: a non-admin cannot assign a chat to someone else", async () => {
  const r = await admin.assignSession("s1", "noah", "cody", false,
    { env: ENV, loadFn: async () => SESS({ installer: "" }), saveFn: async (s) => s });
  assert.equal(r.status, "error");
  assert.equal(r.error, "admin-only");
});

test("assignSession: rejects an unknown installer key and a missing session", async () => {
  const bad = await admin.assignSession("s1", "zorp", "aaron", true,
    { env: ENV, loadFn: async () => SESS({}), saveFn: async (s) => s });
  assert.equal(bad.error, "bad-installer");
  const gone = await admin.assignSession("nope", "noah", "aaron", true,
    { env: ENV, loadFn: async () => null, saveFn: async (s) => s });
  assert.equal(gone.error, "not-found");
});

test("installerOp routes op:assign with the admin flag", async () => {
  const deps = { env: ENV, admin: true,
    loadFn: async () => SESS({ installer: "" }), saveFn: async (s) => s };
  const ok = await installerOp({ op: "assign", session: "s1", installer: "noah" }, "aaron", deps);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.installer, "noah");
  const deny = await installerOp({ op: "assign", session: "s1", installer: "noah" }, "cody", { ...deps, admin: false });
  assert.equal(deny.status, 400);
});

test("openSmsThread REOPENS a closed thread with the same number instead of shadowing it", async () => {
  // Live failure 2026-07-28: Message to 651-278-1401 created a second record
  // under the closed thread's Session ID; loadSession reads oldest-first, so
  // every reply routed to the closed record and bounced with not-escalated.
  const saved = [];
  const closed = { id: "sms:+16512781401", recordId: "recOLD", status: "closed", installer: "",
    customerName: "", vehicle: "", phone: "+16512781401",
    turns: [{ role: "user", text: "On my way", at: 1 }] };
  const r = await openSmsThread({ phone: "+16512781401", name: "Caller", vehicle: "2019 4Runner" }, "aaron",
    { loadActive: async () => null, loadFn: async () => closed,
      saveFn: async (s) => { saved.push(s); return s; } });
  assert.equal(r.status, "ok");
  assert.equal(r.session, "sms:+16512781401");
  assert.equal(r.isNew, false, "existing history means no new-thread prefill");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].recordId, "recOLD", "must update the existing record, never create a duplicate");
  assert.equal(saved[0].status, "escalated");
  assert.equal(saved[0].installer, "aaron");
  assert.equal(saved[0].customerName, "Caller", "backfills a missing name");
  assert.equal(saved[0].turns.length, 1, "prior transcript preserved");
});
