const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setAiMode, getTranscript } = require("../netlify/functions/lib/chat-admin.js");
const { installerOp } = require("../netlify/functions/chat.js");

const sess = (over) => ({ id: "s1", recordId: "r1", status: "escalated", installer: "aaron", customerName: "M",
  phone: "", vehicle: "", city: "", aiMode: "auto", turns: [{ role: "installer", text: "hi", at: Date.now() - 1000 }], ...over });

test("setAiMode validates and persists", async () => {
  let saved = null;
  const r = await setAiMode("s1", "off", { loadFn: async () => sess(), saveFn: async (s) => { saved = s; } });
  assert.equal(r.status, "ok");
  assert.equal(saved.aiMode, "off");
  const bad = await setAiMode("s1", "sideways", { loadFn: async () => sess(), saveFn: async () => {} });
  assert.equal(bad.error, "bad-mode");
});

test("getTranscript reports aiMode + effective aiActive", async () => {
  const t = await getTranscript("s1", { loadFn: async () => sess() }); // auto + fresh installer turn -> paused
  assert.equal(t.aiMode, "auto");
  assert.equal(t.aiActive, false);
  const t2 = await getTranscript("s1", { loadFn: async () => sess({ aiMode: "on" }) });
  assert.equal(t2.aiActive, true);
});

test("installerOp routes op:aiMode", async () => {
  const out = await installerOp({ op: "aiMode", session: "s1", mode: "off" }, "aaron",
    { setAi: async (id, mode) => ({ status: "ok", aiMode: mode }) });
  assert.equal(out.status, 200);
  assert.equal(out.body.aiMode, "off");
});

test("installerOp aiMode on unknown session -> 404", async () => {
  const out = await installerOp({ op: "aiMode", session: "nope", mode: "off" }, "aaron",
    { loadFn: async () => null });
  assert.equal(out.status, 404);
});
