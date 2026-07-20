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
    notify: function () { throw new Error("sync boom"); },
  };
  const out = await processChat({ session: "s1", message: "still there?" }, deps);
  assert.equal(out.status, 200);
  assert.ok(out.body.reply);
});
