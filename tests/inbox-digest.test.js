const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runDigest } = require("../netlify/functions/inbox-digest.js");

// taggedMsgs: what listMessages("label:ty-drafted") returns — messages in sweep-created threads
function harness(drafts, threadMsgs, taggedMsgs) {
  const sent = [], notifies = [];
  let capturedListMessagesQuery = null;
  const deps = {
    env: { GMAIL_REFRESH_TOKEN: "r", RESEND_API_KEY: "k", SLACK_WEBHOOK_URL: "https://x" },
    gmail: {
      listDrafts: async () => drafts,
      getMessage: async (id) => {
        if (!(id in threadMsgs)) throw new Error(`no msg ${id}`);
        return threadMsgs[id];
      },
      listMessages: async (q) => {
        capturedListMessagesQuery = q;
        return taggedMsgs;
      },
    },
    send: async (m) => { sent.push(m); return { id: "e" }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {} },
  };
  return { sent, notifies, deps, getQuery: () => capturedListMessagesQuery };
}

test("digest emails Aaron a summary of waiting drafts + slacks a one-liner", async () => {
  // draft d1 in thread t1; listMessages returns t1 → draft is counted
  const h = harness(
    [{ id: "d1", messageId: "dm1", threadId: "t1" }],
    { dm1: { headers: { to: "jo@x.com", subject: "Re: tune?" }, textBody: "draft body" } },
    [{ id: "m1", threadId: "t1" }],
  );
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1);
  assert.equal(h.sent[0].to, "info@tunedyota.com");
  assert.match(h.sent[0].subject, /1 reply draft/);
  assert.match(h.sent[0].text, /jo@x.com/);
  assert.equal(h.notifies.length, 1);
});

test("zero drafts -> no email, quiet slack skip", async () => {
  const h = harness([], {}, []);
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notifies.length, 0);
});

test("a draft whose detail fails to load still appears as a row (no throw)", async () => {
  // draft d1 in thread t1; listMessages returns t1 → draft counted; getMessage throws → fallback row
  const h = harness(
    [{ id: "d1", messageId: "dm1", threadId: "t1" }],
    {},
    [{ id: "m1", threadId: "t1" }],
  );
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1);
  assert.match(h.sent[0].text, /d1/);
});

test("gmail listDrafts failure returns error result, never throws", async () => {
  const h = harness([], {}, []);
  h.deps.gmail.listDrafts = async () => { throw new Error("gmail 500"); };
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.match(String(out.error), /gmail 500/);
});

// --- NEW CASES ---

test("digest counts only drafts whose threadId appears in ty-drafted listMessages", async () => {
  // 2 drafts: d1 in t1 (tagged), d2 in t2 (not tagged) → only d1 counted
  const h = harness(
    [
      { id: "d1", messageId: "dm1", threadId: "t1" },
      { id: "d2", messageId: "dm2", threadId: "t2" },
    ],
    {
      dm1: { headers: { to: "alice@x.com", subject: "Re: tune?" }, textBody: "body" },
      dm2: { headers: { to: "bob@x.com", subject: "Re: lift?" }, textBody: "body" },
    },
    [{ id: "m1", threadId: "t1" }], // only t1 is ty-drafted
  );
  const out = await runDigest(h.deps);
  assert.equal(out.count, 1, "should count only the 1 ty-drafted draft");
  assert.match(h.sent[0].text, /alice@x.com/, "should list alice (the tagged thread)");
  assert.doesNotMatch(h.sent[0].text, /bob@x.com/, "should NOT list bob (untagged thread)");
  assert.equal(h.notifies.length, 1);
});

test("listMessages query must include label:ty-drafted", async () => {
  const h = harness(
    [{ id: "d1", messageId: "dm1", threadId: "t1" }],
    { dm1: { headers: { to: "jo@x.com", subject: "Re: tune?" }, textBody: "body" } },
    [{ id: "m1", threadId: "t1" }],
  );
  await runDigest(h.deps);
  const q = h.getQuery();
  assert.ok(q !== null, "listMessages should have been called");
  assert.match(q, /label:ty-drafted/, "query must include label:ty-drafted");
});

test("zero matching ty-drafted drafts → no email, no slack, count 0", async () => {
  // 2 drafts exist but neither is in a ty-drafted thread → filtered to 0
  const h = harness(
    [
      { id: "d1", messageId: "dm1", threadId: "t1" },
      { id: "d2", messageId: "dm2", threadId: "t2" },
    ],
    {
      dm1: { headers: { to: "alice@x.com", subject: "Re: tune?" }, textBody: "body" },
      dm2: { headers: { to: "bob@x.com", subject: "Re: lift?" }, textBody: "body" },
    },
    [], // no ty-drafted threads at all
  );
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0, "filtered-to-zero should return count 0");
  assert.equal(h.sent.length, 0, "no email when nothing matches");
  assert.equal(h.notifies.length, 0, "no slack when nothing matches");
});

test("listMessages throw → same error containment as listDrafts (count 0, error message)", async () => {
  const h = harness(
    [{ id: "d1", messageId: "dm1", threadId: "t1" }],
    { dm1: { headers: { to: "jo@x.com", subject: "Re: tune?" }, textBody: "body" } },
    [],
  );
  h.deps.gmail.listMessages = async () => { throw new Error("listMessages boom"); };
  const out = await runDigest(h.deps);
  assert.equal(out.count, 0);
  assert.match(String(out.error), /listMessages boom/);
  assert.equal(h.sent.length, 0);
  assert.equal(h.notifies.length, 0);
});
