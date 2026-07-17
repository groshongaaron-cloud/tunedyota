const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDraft, listDrafts, b64urlDecode } = require("../netlify/functions/lib/gmail.js");

const deps = (impl) => ({ tokenImpl: async () => "tok", fetchImpl: impl });

test("createDraft POSTs a threaded RFC822 draft", async () => {
  let seen;
  const impl = async (url, opts) => { seen = { url, body: JSON.parse(opts.body) }; return { ok: true, json: async () => ({ id: "d1" }) }; };
  await createDraft({ threadId: "t1", to: "jo@x.com", subject: "Re: your towing question",
    inReplyTo: "<m1@x>", references: "<m1@x>", body: "hey Jo" }, deps(impl));
  assert.ok(seen.url.endsWith("/drafts"));
  assert.equal(seen.body.message.threadId, "t1");
  const raw = b64urlDecode(seen.body.message.raw);
  assert.match(raw, /To: jo@x.com/);
  assert.match(raw, /In-Reply-To: <m1@x>/);
  assert.match(raw, /hey Jo/);
});

test("listDrafts returns id + message ids", async () => {
  const impl = async () => ({ ok: true, json: async () => ({ drafts: [{ id: "d1", message: { id: "m1", threadId: "t1" } }] }) });
  const out = await listDrafts(deps(impl));
  assert.deepEqual(out, [{ id: "d1", messageId: "m1", threadId: "t1" }]);
});
