const { test } = require("node:test");
const assert = require("node:assert/strict");
const { saveSession } = require("../netlify/functions/lib/chat-store.js");
const { processChat } = require("../netlify/functions/chat.js");

const ENV = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" };

// Airtable REST stub: dispatches on HTTP method. `listBatches` feeds successive
// GET (list) calls; POST returns `createId`; PATCH/DELETE are recorded.
function airtableStub({ createId = "recNEW", listBatches = [] } = {}) {
  const calls = { deleted: [], patched: [], listCount: 0 };
  const fetchImpl = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    if (method === "POST") return { ok: true, status: 200, json: async () => ({ id: createId }) };
    if (method === "PATCH") {
      calls.patched.push({ id: String(url).split("/").pop(), fields: JSON.parse(opts.body).fields });
      return { ok: true, status: 200, json: async () => ({ id: String(url).split("/").pop() }) };
    }
    if (method === "DELETE") {
      calls.deleted.push(String(url).split("/").pop());
      return { ok: true, status: 200, json: async () => ({ deleted: true }) };
    }
    const records = listBatches[Math.min(calls.listCount, listBatches.length - 1)] || [];
    calls.listCount++;
    return { ok: true, status: 200, json: async () => ({ records }) };
  };
  return { fetchImpl, calls };
}

const rec = (id, created, turns, extra = {}) => ({ id, fields: {
  "Session ID": "sms:+15075550123", Status: "ai", Transcript: JSON.stringify(turns),
  Created: created, "Last Activity": created, ...extra } });

test("create race: the younger record deletes itself and merges into the winner", async () => {
  const winnerTurns = [{ role: "user", text: "Hello", at: 100 }, { role: "assistant", text: "Hi!", at: 200 }];
  // Our (loser) session raced the same message — same texts, different timestamps —
  // plus one genuinely new turn the winner lacks.
  const sess = { id: "sms:+15075550123", status: "ai", pageContext: "sms",
    turns: [{ role: "user", text: "Hello", at: 150 }, { role: "assistant", text: "Hi!", at: 250 },
            { role: "assistant", text: "Anything else?", at: 300 }] };
  const { fetchImpl, calls } = airtableStub({ createId: "recLOSER", listBatches: [
    [rec("recWINNER", "2026-07-27T16:20:01.897Z", winnerTurns), rec("recLOSER", "2026-07-27T16:20:01.988Z", sess.turns)],
  ] });
  await saveSession(sess, { env: ENV, fetchImpl });
  assert.deepEqual(calls.deleted, ["recLOSER"], "loser removes its own record");
  assert.equal(sess.recordId, "recWINNER", "caller repointed at the canonical record");
  const merged = calls.patched.find((p) => p.id === "recWINNER");
  const turns = JSON.parse(merged.fields.Transcript);
  const texts = turns.map((t) => t.text);
  assert.deepEqual(texts, ["Hello", "Hi!", "Anything else?"], "raced duplicates (role+text match) are NOT doubled; new turn merged");
});

test("create race: the older record keeps itself — no delete, no merge", async () => {
  const sess = { id: "sms:+15075550123", status: "ai", pageContext: "sms",
    turns: [{ role: "user", text: "Hello", at: 100 }] };
  const { fetchImpl, calls } = airtableStub({ createId: "recWINNER", listBatches: [
    [rec("recWINNER", "2026-07-27T16:20:01.897Z", sess.turns), rec("recLOSER", "2026-07-27T16:20:01.988Z", [])],
  ] });
  await saveSession(sess, { env: ENV, fetchImpl });
  assert.deepEqual(calls.deleted, []);
  assert.equal(sess.recordId, "recWINNER");
});

test("a closed co-record is never merged into — new conversation keeps its own record", async () => {
  const sess = { id: "sms:+15075550123", status: "ai", pageContext: "sms",
    turns: [{ role: "user", text: "New convo", at: 100 }] };
  const { fetchImpl, calls } = airtableStub({ createId: "recNEW", listBatches: [
    [rec("recOLDCLOSED", "2026-07-01T00:00:00.000Z", [], { Status: "closed" }), rec("recNEW", "2026-07-27T16:20:01.988Z", sess.turns)],
  ] });
  await saveSession(sess, { env: ENV, fetchImpl });
  assert.deepEqual(calls.deleted, []);
  assert.equal(sess.recordId, "recNEW");
});

test("guard failure leaves the created record intact (best-effort)", async () => {
  const sess = { id: "sms:+15075550123", status: "ai", pageContext: "sms", turns: [] };
  let created = false;
  const fetchImpl = async (url, opts = {}) => {
    const method = (opts.method || "GET").toUpperCase();
    if (method === "POST") { created = true; return { ok: true, status: 200, json: async () => ({ id: "recNEW" }) }; }
    return { ok: false, status: 503, text: async () => "down", json: async () => ({}) }; // dedupe re-query fails
  };
  await saveSession(sess, { env: ENV, fetchImpl });
  assert.equal(created, true);
  assert.equal(sess.recordId, "recNEW");
});

test("processChat: an already-processed MessageSid is a no-op — no AI, no relay, no save", async () => {
  let aiRan = false, relayed = false, saved = false;
  const out = await processChat({ session: "sms:+15075550123", message: "Hello", sid: "SM111" }, {
    env: ENV,
    load: async () => ({ id: "sms:+15075550123", recordId: "r1", status: "escalated", installer: "cody",
      pageContext: "sms", aiMode: "auto", lastActivity: new Date().toISOString(),
      turns: [{ role: "user", text: "Hello", at: Date.now() - 5000, sid: "SM111" }] }),
    relay: async () => { relayed = true; }, save: async () => { saved = true; },
    ai: async () => { aiRan = true; return { reply: "x" }; },
  });
  assert.equal(out.status, 200);
  assert.equal(out.body.duplicate, true);
  assert.equal(aiRan, false);
  assert.equal(relayed, false);
  assert.equal(saved, false);
});

test("processChat stamps the user turn with the sid; missing sid changes nothing", async () => {
  let saved = null;
  await processChat({ session: "s1", message: "First!", sid: "SM222" }, {
    env: ENV, load: async () => null, relay: async () => {}, save: async (s) => { saved = s; },
    ai: async () => ({ reply: "hi" }),
  });
  const userTurn = saved.turns.find((t) => t.role === "user");
  assert.equal(userTurn.sid, "SM222");
  let saved2 = null;
  await processChat({ session: "s2", message: "no sid here" }, {
    env: ENV, load: async () => null, relay: async () => {}, save: async (s) => { saved2 = s; },
    ai: async () => ({ reply: "hi" }),
  });
  assert.equal("sid" in saved2.turns.find((t) => t.role === "user"), false);
});
