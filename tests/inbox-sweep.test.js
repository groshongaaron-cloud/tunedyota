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
  const h = harness([MSG("m1", { textBody: "Name: Q\nPhone: 555\nCity: Fargo\nVehicle Year: 2019\nVehicle Make: Toyota\nVehicle Model: Tundra\nGHL Link: https://app.gohighlevel.com/x" })], [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }]);
  const out = await runSweep(h.deps);
  assert.equal(out.ingested, 1);
  assert.equal(h.posted[0].channel, "ott-national");
  assert.equal(h.posted[0].ghlLink, "https://app.gohighlevel.com/x");
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
    env: { GMAIL_REFRESH_TOKEN: "r", INTERNAL_TASK_SECRET: "s" },
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

// ── Fix 1a: fail-fast on missing INTERNAL_TASK_SECRET ───────────────────────
test("missing INTERNAL_TASK_SECRET returns { skipped: 'no-task-secret' }, no gmail calls made", async () => {
  const gmailCalls = [];
  const h = harness([MSG("m10")], [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }]);
  // Remove the secret from env
  h.deps.env = { ...h.deps.env, INTERNAL_TASK_SECRET: "" };
  // Override gmail to track if it was called
  h.deps.gmail = {
    listMessages: async () => { gmailCalls.push("listMessages"); return []; },
    getMessage: async () => { gmailCalls.push("getMessage"); return MSG("m10"); },
    addLabel: async () => { gmailCalls.push("addLabel"); },
    createDraft: async () => { gmailCalls.push("createDraft"); return { id: "d" }; },
  };
  const out = await runSweep(h.deps);
  assert.equal(out.scanned, 0);
  assert.equal(out.skipped, "no-task-secret");
  assert.equal(gmailCalls.length, 0, "no gmail calls must be made");
});

// ── Fix 1b: OTT lead !res.ok branch notifies AND labels ty-flagged ───────────
test("postImpl returning { ok:false, status:401 } notifies once and labels ty-flagged", async () => {
  const h = harness([MSG("m11")], [{ bucket: "ott-lead", stage: "situation", confidence: 0.95, summary: "" }]);
  h.deps.postImpl = async () => ({ ok: false, status: 401 });
  const out = await runSweep(h.deps);
  assert.equal(h.notifies.length, 1, "must fire exactly one Slack alert");
  assert.ok(h.labeled.some(([, lbl]) => lbl === "ty-flagged"), "must add ty-flagged label");
  assert.equal(out.flagged, 1);
  assert.equal(out.ingested, 0);
});

// ── Fix 2: non-transient per-message error → ty-flagged + notify ─────────────
test("classify throwing TypeError flags message and notifies, does not rethrow", async () => {
  const h = harness([MSG("m12")], []);
  h.deps.classify = async () => { throw new TypeError("boom"); };
  const out = await runSweep(h.deps);
  assert.ok(h.labeled.some(([, lbl]) => lbl === "ty-flagged"), "TypeError must add ty-flagged");
  assert.equal(h.notifies.length, 1, "must notify on non-transient error");
  assert.equal(out.scanned, 1, "sweep must complete");
});

test("classify throwing transient Error does NOT flag or notify (retry preserved)", async () => {
  const h = harness([MSG("m13")], []);
  h.deps.classify = async () => { throw new Error("anthropic 529"); };
  const out = await runSweep(h.deps);
  assert.equal(h.labeled.length, 0, "transient error must NOT label — leave for retry");
  assert.equal(h.notifies.length, 0, "transient error must NOT notify");
  assert.equal(out.scanned, 1, "sweep must complete");
});

test("CAP: 25 msgs listed but only 20 processed (scanned === 20)", async () => {
  const msgs = Array.from({ length: 25 }, (_, i) => MSG("m" + i));
  const classifications = Array.from({ length: 25 }, () => ({ bucket: "spam", stage: "connect", confidence: 0.9, summary: "" }));
  let ci = 0;
  const deps = {
    env: { GMAIL_REFRESH_TOKEN: "r", ANTHROPIC_API_KEY: "k", INTERNAL_TASK_SECRET: "s" },
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

test("sweep query is bounded to fresh mail and excludes all state labels", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "netlify", "functions", "inbox-sweep.js"), "utf8");
  const m = src.match(/const QUERY = "([^"]+)"/);
  assert.ok(m, "QUERY const found");
  const q = m[1];
  assert.ok(q.includes("newer_than:"), "date bound present — without it the sweep drafts replies to the whole historical inbox");
  for (const l of ["ty-ingested", "ty-drafted", "ty-skipped", "ty-flagged"]) assert.ok(q.includes("-label:" + l), l);
  assert.ok(q.includes("-from:me"), "excludes own sends");
});
