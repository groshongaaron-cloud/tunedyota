const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadSession, saveSession, parseTranscript, isStale, STALE_AI_MS, STALE_ESCALATED_MS } = require("../netlify/functions/lib/chat-store.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };
const rec = (fields) => ({ id: "recX", fields });

test("parseTranscript tolerates blank and bad JSON", () => {
  assert.deepEqual(parseTranscript(""), []);
  assert.deepEqual(parseTranscript("not json"), []);
  assert.deepEqual(parseTranscript('[{"role":"user","text":"hi","at":1}]'), [{ role: "user", text: "hi", at: 1 }]);
});

test("isStale by status", () => {
  const now = Date.parse("2026-07-17T12:00:00Z");
  const old = new Date(now - STALE_AI_MS - 1000).toISOString();
  assert.equal(isStale({ status: "ai", lastActivity: old }, now), true);
  assert.equal(isStale({ status: "escalated", lastActivity: old }, now), false); // 2h window
  const veryOld = new Date(now - STALE_ESCALATED_MS - 1000).toISOString();
  assert.equal(isStale({ status: "escalated", lastActivity: veryOld }, now), true);
});

test("loadSession returns null when not found; maps fields when found", async () => {
  const empty = async () => ({ ok: true, json: async () => ({ records: [] }) });
  assert.equal(await loadSession("s1", { env: ENV, fetchImpl: empty }), null);
  const found = async () => ({ ok: true, json: async () => ({ records: [rec({
    "Session ID": "s1", Status: "ai", Transcript: '[{"role":"user","text":"hi","at":1}]',
    "Page Context": "default", "Last Activity": "2026-07-17T11:59:00Z" })] }) });
  const s = await loadSession("s1", { env: ENV, fetchImpl: found });
  assert.equal(s.recordId, "recX");
  assert.equal(s.status, "ai");
  assert.equal(s.turns.length, 1);
});

test("saveSession creates when no recordId, patches when present", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => { calls.push({ url: String(url), method: opts.method }); return { ok: true, json: async () => ({ id: "recNew", fields: {} }) }; };
  await saveSession({ id: "s1", status: "ai", turns: [], pageContext: "default" }, { env: ENV, fetchImpl, now: () => 0 });
  await saveSession({ id: "s1", recordId: "recX", status: "ai", turns: [] }, { env: ENV, fetchImpl, now: () => 0 });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[1].method, "PATCH");
  assert.ok(calls[1].url.includes("recX"));
});
