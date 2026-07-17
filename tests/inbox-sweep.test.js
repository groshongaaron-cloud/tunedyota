// tests/inbox-sweep.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runSweep } = require("../netlify/functions/inbox-sweep.js");

function harness(msgs, classifications) {
  const labeled = [], posted = [], drafts = [], notifies = [];
  let ci = 0;
  return { labeled, posted, drafts, notifies, deps: {
    env: { GMAIL_REFRESH_TOKEN: "r", ANTHROPIC_API_KEY: "k", INTERNAL_TASK_SECRET: "s", URL: "https://tunedyota.com", SLACK_WEBHOOK_URL: "https://x" },
    gmail: { listMessages: async () => msgs.map((m) => ({ id: m.id, threadId: m.threadId })),
      getMessage: async (id) => msgs.find((m) => m.id === id),
      addLabel: async (id, name) => { labeled.push([id, name]); },
      createDraft: async (a) => { drafts.push(a); return { id: "d" + drafts.length }; } },
    classify: async () => classifications[ci++],
    draft: async () => "Happy to help — what year is it?\n— Aaron @ Tuned Yota · (612) 406-7117",
    postImpl: async (url, opts) => { posted.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ status: "lead" }) }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { error() {} },
  } };
}
const MSG = (id, over = {}) => ({ id, threadId: "t" + id, headers: { from: "jo@x.com", subject: "s", messageId: "<" + id + "@x>", replyTo: "" }, textBody: "Name: Q\nPhone: 555\nCity: Fargo\nVehicle Year: 2019\nVehicle Make: Toyota\nVehicle Model: Tundra", ...over });

test("ott-lead routes to lead-ingest and labels ty-ingested", async () => {
  const h = harness([MSG("m1")], [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.ingested, 1);
  assert.equal(h.posted[0].channel, "ott-national");
  assert.deepEqual(h.labeled[0], ["m1", "ty-ingested"]);
});
test("inquiry gets a draft (never a send) and labels ty-drafted", async () => {
  const h = harness([MSG("m2", { textBody: "how much for a tune?" })], [{ bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "price ask" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.drafted, 1);
  assert.equal(h.drafts[0].threadId, "tm2");
  assert.deepEqual(h.labeled[0], ["m2", "ty-drafted"]);
});
test("sensitive drafts AND flags Slack, labels both", async () => {
  const h = harness([MSG("m3", { textBody: "this is unacceptable, I want a refund" })], [{ bucket: "sensitive", stage: "connect", confidence: 0.9, summary: "refund demand" }]);
  await runSweep(h.deps);
  assert.equal(h.notifies.length, 1);
  assert.ok(h.labeled.some((l) => l[1] === "ty-flagged"));
  assert.ok(h.labeled.some((l) => l[1] === "ty-drafted"));
});
test("automated and spam are skipped with a label, no draft, no ingest", async () => {
  const h = harness([MSG("m4")], [{ bucket: "automated", stage: "connect", confidence: 0.9, summary: "" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.drafted + out.ingested, 0);
  assert.deepEqual(h.labeled[0], ["m4", "ty-skipped"]);
});
test("a draft failing the shape check is retried once, then flagged not drafted", async () => {
  const h = harness([MSG("m5", { textBody: "question" })], [{ bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "" }]);
  h.deps.draft = async () => "No question here at all, just statements padding length beyond minimum.";
  await runSweep(h.deps);
  assert.equal(h.drafts.length, 0, "bad-shape draft must not be created");
  assert.ok(h.labeled.some((l) => l[1] === "ty-flagged"));
});
test("one throwing message never kills the sweep", async () => {
  const h = harness([MSG("m6"), MSG("m7", { textBody: "how much" })],
    [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }, { bucket: "inquiry", stage: "connect", confidence: 0.9, summary: "" }]);
  h.deps.postImpl = async () => { throw new Error("ingest down"); };
  const out = await runSweep(h.deps);
  assert.equal(out.drafted, 1, "second message still processed");
});

// Legacy adapted tests
test("gmail listMessages throwing returns { scanned:0, error } and never throws", async () => {
  const out = await runSweep({
    env: { GMAIL_REFRESH_TOKEN: "r" },
    gmail: { listMessages: async () => { throw new Error("gmail 500"); } },
    log: { error() {} },
  });
  assert.equal(out.scanned, 0);
  assert.match(String(out.error), /gmail 500/);
});

test("no-gmail-config skips sweep entirely", async () => {
  const out = await runSweep({ env: {}, log: { error() {} } });
  assert.equal(out.scanned, 0);
  assert.equal(out.skipped, "no-gmail-config");
});

test("CAP: 25 msgs listed but only 20 processed (scanned === 20)", async () => {
  const msgs = Array.from({ length: 25 }, (_, i) => MSG("m" + i));
  const classifications = Array.from({ length: 25 }, () => ({ bucket: "spam", stage: "connect", confidence: 0.9, summary: "" }));
  let ci = 0;
  const deps = {
    env: { GMAIL_REFRESH_TOKEN: "r", ANTHROPIC_API_KEY: "k" },
    gmail: {
      listMessages: async () => msgs.map((m) => ({ id: m.id, threadId: m.threadId })),
      getMessage: async (id) => msgs.find((m) => m.id === id),
      addLabel: async () => {},
      createDraft: async () => ({ id: "d" }),
    },
    classify: async () => classifications[ci++],
    draft: async () => "Happy to help — what year is it?\n— Aaron @ Tuned Yota · (612) 406-7117",
    postImpl: async () => ({ ok: true, json: async () => ({}) }),
    notify: async () => ({ ok: true }),
    log: { error() {} },
  };
  const out = await runSweep(deps);
  assert.equal(out.scanned, 20, "CAP of 20 must be enforced");
});
