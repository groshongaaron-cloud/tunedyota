const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runDigest } = require("../netlify/functions/inbox-digest.js");

function harness(drafts, threadMsgs) {
  const sent = [], notifies = [];
  return { sent, notifies, deps: {
    env: { GMAIL_REFRESH_TOKEN: "r", RESEND_API_KEY: "k", SLACK_WEBHOOK_URL: "https://x" },
    gmail: { listDrafts: async () => drafts,
      getMessage: async (id) => threadMsgs[id] },
    send: async (m) => { sent.push(m); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {} } } };
}

test("digest emails Aaron a summary of waiting drafts + slacks a one-liner", async () => {
  const h = harness([{ id: "d1", messageId: "dm1", threadId: "t1" }],
    { dm1: { headers: { to: "jo@x.com", subject: "Re: tune?" }, textBody: "draft body" } });
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1);
  assert.equal(h.sent[0].to, "info@tunedyota.com");
  assert.match(h.sent[0].subject, /1 reply draft/);
  assert.match(h.sent[0].text, /jo@x.com/);
  assert.equal(h.notifies.length, 1);
});
test("zero drafts -> no email, quiet slack skip", async () => {
  const h = harness([], {});
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notifies.length, 0);
});
test("a draft whose detail fails to load still appears as a row (no throw)", async () => {
  const h = harness([{ id: "d1", messageId: "dm1", threadId: "t1" }], {});
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1);
  assert.match(h.sent[0].text, /d1/);
});
test("gmail listDrafts failure returns error result, never throws", async () => {
  const h = harness([], {});
  h.deps.gmail.listDrafts = async () => { throw new Error("gmail 500"); };
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.match(String(out.error), /gmail 500/);
});
