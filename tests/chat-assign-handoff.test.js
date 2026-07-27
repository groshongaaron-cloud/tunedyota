// tests/chat-assign-handoff.test.js
// Console Assign parity with the @key SMS dispatch (twilio-sms.js): assigning a
// thread to someone ELSE texts them the identical handoff SMS and stamps
// lastRelayedAt so their phone replies route to this thread. Self-claims skip
// the SMS; a failed send never fails the assignment.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../netlify/functions/lib/chat-admin.js");
const { buildHandoffBody } = require("../netlify/functions/lib/installer-relay.js");

const ENV = { INSTALLER_SMS_NUMBERS: '{"cody":"+14025550100"}' };
const SESS = (over = {}) => Object.assign({
  id: "s1", recordId: "recX", status: "escalated", pageContext: "default",
  customerName: "Pat", phone: "+16125550123", vehicle: "2021 Tundra", city: "Omaha",
  installer: "", turns: [{ role: "user", text: "who's my installer?", at: 1 }],
}, over);

test("admin assign to someone else sends the handoff SMS and stamps lastRelayedAt", async () => {
  let saved = null; const sms = [];
  const r = await admin.assignSession("s1", "cody", "aaron", true, {
    env: ENV, loadFn: async () => SESS(), saveFn: async (s) => { saved = s; return s; },
    sms: async (a) => { sms.push(a); return { ok: true }; },
  });
  assert.equal(r.status, "ok");
  assert.equal(saved.installer, "cody");
  assert.ok(saved.lastRelayedAt, "lastRelayedAt stamped so cody's phone replies route to this thread");
  assert.equal(sms.length, 1);
  assert.equal(sms[0].to, "+14025550100");
  assert.equal(sms[0].body, buildHandoffBody(saved)); // byte-identical to the @key dispatch path
  assert.match(sms[0].body, /TY handoff: Pat · 2021 Tundra · \+16125550123/);
  assert.match(sms[0].body, /Latest: "who's my installer\?"/); // ASCII quotes
  assert.match(sms[0].body, /This thread is yours — reply to this text and it goes to the client\./);
});

test("self-claim sends NO SMS but still stamps lastRelayedAt", async () => {
  let saved = null; const sms = [];
  const r = await admin.assignSession("s1", "cody", "cody", false, {
    env: ENV, loadFn: async () => SESS(), saveFn: async (s) => { saved = s; return s; },
    sms: async (a) => { sms.push(a); return { ok: true }; },
  });
  assert.equal(r.status, "ok");
  assert.equal(sms.length, 0, "self-claims need no handoff text");
  assert.ok(saved.lastRelayedAt);
});

test("handoff SMS failure never fails the assignment", async () => {
  let saved = null;
  const r = await admin.assignSession("s1", "cody", "aaron", true, {
    env: ENV, log: { error: () => {} },
    loadFn: async () => SESS(), saveFn: async (s) => { saved = s; return s; },
    sms: async () => { throw new Error("twilio down"); },
  });
  assert.equal(r.status, "ok");
  assert.equal(r.installer, "cody");
  assert.equal(saved.installer, "cody");
});
