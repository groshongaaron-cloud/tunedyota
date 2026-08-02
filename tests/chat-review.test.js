// Weekly chat-quality review (owner directive 2026-08-02): constantly assess
// incoming chats — how the AI and the INSTALLERS engaged, how tailored the
// responses were, and where we improve. World-class bar; the NEPQ playbook is
// the standard the review grades against.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runChatReview, buildBundle } = require("../netlify/functions/chat-review.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", ANTHROPIC_API_KEY: "k",
  SLACK_WEBHOOK_URL: "https://x" };
const NOW = new Date("2026-08-10T13:45:00Z");
const hoursAgo = (h) => NOW.getTime() - h * 3600 * 1000;

const sess = (id, over = {}) => ({ id, fields: {
  "Session ID": over.sid || "sms:+16055551212", Status: "escalated", "Page Context": "",
  "Customer Name": "Eli", Installer: "aaron", "Last Activity": new Date(hoursAgo(20)).toISOString(),
  Transcript: over.turns || JSON.stringify([
    { role: "user", text: "Do you tune 4Runners?", at: hoursAgo(26) },
    { role: "assistant", text: "We do — what year is yours?", at: hoursAgo(26) + 60000 },
    { role: "user", text: "2019. Can I talk to a person?", at: hoursAgo(25) },
    { role: "installer", text: "Aaron here — happy to help with that 2019.", at: hoursAgo(19) },
  ]), ...over } });

function run(records, over = {}) {
  const sends = [], slacks = [], llmCalls = [];
  return runChatReview({ env, now: NOW,
    list: async () => records,
    send: async (a) => { sends.push(a); return {}; },
    notify: async (a) => { slacks.push(a); return {}; },
    llm: async (prompt) => { llmCalls.push(prompt); return "## Review\nGreat week. Coaching: reply faster."; },
    ...over }).then((out) => ({ out, sends, slacks, llmCalls }));
}

test("buildBundle labels every speaker, annotates slow installer replies, skips smoke sessions", () => {
  const b = buildBundle([sess("r1"), sess("r2", { sid: "web-smoke-urgent-1" }), sess("r3", { sid: "fb:smoketest9" })], NOW);
  assert.equal(b.count, 1, "smoke sessions excluded");
  assert.match(b.text, /customer: Do you tune 4Runners\?/);
  assert.match(b.text, /installer: Aaron here/);
  assert.match(b.text, /replied ~6h later/, "installer lag annotated");
  assert.match(b.text, /channel=sms/);
  assert.match(b.text, /status=escalated/);
});

test("only sessions active in the last 7 days are reviewed", () => {
  const old = sess("r2", { "Last Activity": new Date(hoursAgo(24 * 10)).toISOString() });
  const b = buildBundle([sess("r1"), old], NOW);
  assert.equal(b.count, 1);
});

test("review runs: rubric prompt + transcripts to the LLM, result emailed to info@, Slack line", async () => {
  const { out, sends, slacks, llmCalls } = await run([sess("r1")]);
  assert.equal(out.reviewed, 1);
  assert.match(llmCalls[0], /NEPQ/, "grades against the playbook standard");
  assert.match(llmCalls[0], /tailor/i);
  assert.match(llmCalls[0], /installer/i, "installer engagement in scope");
  assert.match(llmCalls[0], /Do you tune 4Runners\?/, "actual transcripts included");
  assert.equal(sends[0].to, "info@tunedyota.com");
  assert.match(sends[0].subject, /chat quality/i);
  assert.match(sends[0].text, /Coaching: reply faster/);
  assert.equal(slacks.length, 1);
});

test("no API key → dormant, nothing sent", async () => {
  const { out, sends } = await run([sess("r1")], { env: { ...env, ANTHROPIC_API_KEY: "" } });
  assert.equal(out.dormant, true);
  assert.equal(sends.length, 0);
});

test("quiet week (no sessions) → skipped, nothing sent", async () => {
  const { out, sends } = await run([]);
  assert.equal(out.skipped, "no-sessions");
  assert.equal(sends.length, 0);
});

test("LLM failure reports the error and sends nothing half-baked", async () => {
  const { out, sends } = await run([sess("r1")], { llm: async () => { throw new Error("api 529"); } });
  assert.equal(out.error, "review-failed");
  assert.equal(sends.length, 0);
});
