// tests/meta-deliver.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deliverInstallerTurn, isMetaSession } = require("../netlify/functions/lib/meta-deliver.js");
const admin = require("../netlify/functions/lib/chat-admin.js");

const ENV = { META_PAGE_TOKEN: "tok", SLACK_WEBHOOK_URL: "https://hooks.example" };
const SESS = (id) => ({ id, recordId: "recX", status: "escalated", customerName: "Pat", phone: "612",
  installer: "aaron", turns: [{ role: "user", text: "hi", at: 1 }], lastActivity: new Date().toISOString() });

test("isMetaSession recognizes fb:/ig: ids only", () => {
  assert.equal(isMetaSession("fb:123"), true);
  assert.equal(isMetaSession("ig:9:1752"), true);
  assert.equal(isMetaSession("web-uuid-1"), false);
});

test("deliverInstallerTurn sends to Meta with the right platform/recipient", async () => {
  const sent = [];
  await deliverInstallerTurn(SESS("ig:IG7:1752"), { role: "installer", text: "On my way", at: 2 },
    { env: ENV, send: async (a) => { sent.push(a); return { ok: true }; } });
  assert.deepEqual(sent[0], { platform: "instagram", recipientId: "IG7", text: "On my way" });
});

test("deliverInstallerTurn is a no-op for web sessions", async () => {
  let called = false;
  await deliverInstallerTurn(SESS("web-uuid"), { role: "installer", text: "x", at: 2 },
    { env: ENV, send: async () => { called = true; } });
  assert.equal(called, false);
});

test("window-closed send appends a system note and notifies", async () => {
  const saved = [], notified = [];
  await deliverInstallerTurn(SESS("fb:P9"), { role: "installer", text: "late reply", at: 2 }, {
    env: ENV,
    send: async () => ({ ok: false, windowClosed: true }),
    saveFn: async (s) => { saved.push(s); return s; },
    notify: async (t) => { notified.push(t); },
  });
  const note = saved[0].turns[saved[0].turns.length - 1];
  assert.equal(note.role, "system");
  assert.match(note.text, /window closed/i);
  assert.match(note.text, /612/);
  assert.equal(notified.length, 1);
});

test("chat-admin installerReply fires onInstallerTurn after save with the sess and turn", async () => {
  const hook = [];
  const out = await admin.installerReply("fb:P9", "aaron", "reply text", {
    env: ENV,
    loadFn: async () => SESS("fb:P9"),
    saveFn: async (s) => s,
    now: () => 777,
    onInstallerTurn: async (sess, turn) => { hook.push([sess.id, turn]); },
  });
  assert.equal(out.status, "ok");
  assert.deepEqual(hook[0], ["fb:P9", { role: "installer", text: "reply text", at: 777 }]);
});

test("installerReply survives a sync-throwing onInstallerTurn", async () => {
  const out = await admin.installerReply("fb:P9", "aaron", "x", {
    env: ENV, loadFn: async () => SESS("fb:P9"), saveFn: async (s) => s,
    onInstallerTurn: () => { throw new Error("boom"); },
  });
  assert.equal(out.status, "ok");
});

// --- sms: session delivery ---

test("sms: session turn goes out via sendSms", async () => {
  const sent = [];
  const out = await deliverInstallerTurn(SESS("sms:+16125551234"), { role: "installer", text: "On my way", at: 2 },
    { env: ENV, sendText: async (a) => { sent.push(a); return { ok: true }; },
      saveFn: async () => {}, notify: async () => {} });
  assert.equal(out.ok, true);
  assert.equal(sent[0].to, "+16125551234");
  assert.equal(sent[0].body, "On my way");
});

test("sms send failure appends the pending-approval system note and Slacks", async () => {
  const notes = [], pings = [];
  const sess = SESS("sms:+16125551234");
  await deliverInstallerTurn(sess, { role: "installer", text: "On my way", at: 2 },
    { env: ENV, sendText: async () => ({ ok: false }),
      saveFn: async (s) => { notes.push(s.turns[s.turns.length - 1]); },
      notify: async (t) => { pings.push(t); return { ok: true }; } });
  assert.equal(notes[0].role, "system");
  assert.match(notes[0].text, /not delivered — SMS sending is pending carrier approval/);
  assert.equal(pings.length, 1);
});

test("web sessions are still skipped", async () => {
  const out = await deliverInstallerTurn(SESS("web-abc123"), { role: "installer", text: "x", at: 2 },
    { env: ENV, sendText: async () => ({ ok: true }), send: async () => ({ ok: true }) });
  assert.equal(out.skipped, true);
});
