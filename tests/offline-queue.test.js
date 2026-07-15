const { test } = require("node:test");
const assert = require("node:assert/strict");
const Q = require("../site/offline-queue.js");

function fakeStorage() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; }

test("makeOp builds an op with a unique clientKey and preserved payload", () => {
  const a = Q.makeOp("closeout", { recordId: "r1" });
  const b = Q.makeOp("walkin", { name: "Dana" });
  assert.equal(a.type, "closeout");
  assert.deepEqual(a.body, { recordId: "r1" });
  assert.ok(a.clientKey && typeof a.clientKey === "string");
  assert.notEqual(a.clientKey, b.clientKey);
});

test("shouldQueue: network error or 5xx yes; 4xx/2xx no", () => {
  assert.equal(Q.shouldQueue(new Error("offline"), undefined), true);
  assert.equal(Q.shouldQueue(null, 503), true);
  assert.equal(Q.shouldQueue(null, 400), false);
  assert.equal(Q.shouldQueue(null, 403), false);
  assert.equal(Q.shouldQueue(null, 200), false);
});

test("nextFlushResult classifies a replay response", () => {
  assert.equal(Q.nextFlushResult(200), "remove");
  assert.equal(Q.nextFlushResult(201), "remove");
  assert.equal(Q.nextFlushResult(401), "stop-auth");
  assert.equal(Q.nextFlushResult(0), "retry-later");
  assert.equal(Q.nextFlushResult(502), "retry-later");
  assert.equal(Q.nextFlushResult(400), "drop");
  assert.equal(Q.nextFlushResult(404), "drop");
});

test("shouldReloadAfterFlush: reload once after a real sync, NEVER on an empty flush", () => {
  // Regression guard for the infinite roster-fetch loop: an already-empty queue
  // (synced=0) must NOT trigger a reload, or load()→flushQueue()→load() recurses forever.
  assert.equal(Q.shouldReloadAfterFlush(0, 0, true), false);   // the loop case — nothing synced
  assert.equal(Q.shouldReloadAfterFlush(2, 0, true), true);    // synced 2, queue drained, online → refresh
  assert.equal(Q.shouldReloadAfterFlush(1, 3, true), false);   // still ops left → don't reload yet
  assert.equal(Q.shouldReloadAfterFlush(2, 0, false), false);  // offline → don't reload
  assert.equal(Q.shouldReloadAfterFlush(0, 5, true), false);   // nothing synced, ops remain
});

test("loadQueue/saveQueue round-trip through storage", () => {
  const s = fakeStorage();
  assert.deepEqual(Q.loadQueue(s), []);
  const ops = [Q.makeOp("closeout", { recordId: "r1" })];
  Q.saveQueue(s, ops);
  assert.deepEqual(Q.loadQueue(s), ops);
});

test("loadQueue tolerates corrupt storage", () => {
  const s = fakeStorage(); s.setItem("ty_pending_ops", "{not json");
  assert.deepEqual(Q.loadQueue(s), []);
});
