const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aiPaused, AI_PAUSE_MS, isStale, STALE_ESCALATED_MS } = require("../netlify/functions/lib/chat-store.js");

const HOUR = 60 * 60 * 1000;

test("aiPaused auto: paused within 72h of last installer turn, live after", () => {
  const now = Date.now();
  const sess = (at) => ({ aiMode: "auto", turns: [{ role: "user", text: "hi", at: now - 100 * HOUR }, { role: "installer", text: "yo", at }] });
  assert.equal(aiPaused(sess(now - 1 * HOUR), now), true);
  assert.equal(aiPaused(sess(now - 71 * HOUR), now), true);
  assert.equal(aiPaused(sess(now - 73 * HOUR), now), false);
});

test("aiPaused auto: no installer turn -> AI keeps covering", () => {
  const now = Date.now();
  assert.equal(aiPaused({ aiMode: "auto", turns: [{ role: "user", text: "hi", at: now }] }, now), false);
  assert.equal(aiPaused({ turns: [] }, now), false); // missing aiMode = auto
});

test("aiPaused manual overrides beat the clock", () => {
  const now = Date.now();
  assert.equal(aiPaused({ aiMode: "off", turns: [] }, now), true);
  assert.equal(aiPaused({ aiMode: "on", turns: [{ role: "installer", text: "x", at: now - 1000 }] }, now), false);
});

test("escalated staleness window is 72h", () => {
  assert.equal(STALE_ESCALATED_MS, 72 * HOUR);
  assert.equal(AI_PAUSE_MS, 72 * HOUR);
  const sess = { status: "escalated", lastActivity: new Date(Date.now() - 3 * HOUR).toISOString() };
  assert.equal(isStale(sess, Date.now()), false); // 3h idle used to be dead — now alive
});
