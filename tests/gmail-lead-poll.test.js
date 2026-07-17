// tests/gmail-lead-poll.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runPoll } = require("../netlify/functions/gmail-lead-poll.js");

test("runPoll parses each new email, posts to lead-ingest, labels it", async () => {
  const posted = [], labeled = [];
  const gmail = {
    listMessages: async () => [{ id: "m1", threadId: "t1" }],
    getMessage: async () => ({ id: "m1", threadId: "t1",
      headers: { from: "OTT <info@overlandtailor.com>", replyTo: "", subject: "A New Lead From Facebook Ads", messageId: "<x@m>" },
      textBody: "Full Name: Jo\nPhone: 6125550147\nEmail: jo@x.com" }),
    addLabel: async (id, name) => { labeled.push([id, name]); },
  };
  const out = await runPoll({ env: { INTERNAL_TASK_SECRET: "sec", URL: "https://tunedyota.com" }, gmail,
    postImpl: async (url, opts) => { posted.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      return { ok: true, json: async () => ({ status: "lead", recordId: "r1", deduped: false }) }; } });
  assert.equal(out.ingested, 1);
  assert.equal(posted[0].headers["x-ty-task"], "sec");
  assert.equal(posted[0].body.channel, "ott-national");
  assert.equal(posted[0].body.emailThread, "t1");
  assert.equal(posted[0].body.emailMessageId, "<x@m>");
  assert.deepEqual(labeled[0], ["m1", "ty-ingested"]);
});

test("runPoll labels a parse/ingest failure ty-ingest-failed and continues", async () => {
  const labeled = [];
  const gmail = {
    listMessages: async () => [{ id: "m1", threadId: "t1" }],
    getMessage: async () => ({ id: "m1", threadId: "t1", headers: { subject: "A New Lead From Facebook Ads" }, textBody: "x" }),
    addLabel: async (id, name) => { labeled.push([id, name]); },
  };
  const out = await runPoll({ env: { INTERNAL_TASK_SECRET: "sec" }, gmail,
    postImpl: async () => ({ ok: false, status: 400, json: async () => ({ status: "error", error: "missing-contact" }) }) });
  assert.equal(out.ingested, 0);
  assert.deepEqual(labeled[0], ["m1", "ty-ingest-failed"]);
});

test("a Gmail list failure is contained — returns an error result, never throws", async () => {
  const out = await runPoll({ env: { INTERNAL_TASK_SECRET: "sec" },
    gmail: { listMessages: async () => { throw new Error("gmail 500"); } } });
  assert.equal(out.ingested, 0);
  assert.match(String(out.error), /gmail 500/);
});
