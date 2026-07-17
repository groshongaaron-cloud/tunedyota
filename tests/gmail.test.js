// tests/gmail.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../netlify/functions/lib/gmail.js");

const tokenImpl = async () => "acc-tok";

test("listMessages issues a search and returns id/threadId pairs", async () => {
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ messages: [{ id: "m1", threadId: "t1" }] }) }; };
  const out = await G.listMessages("subject:x", { fetchImpl, tokenImpl });
  assert.match(seenUrl, /messages\?q=subject%3Ax/);
  assert.deepEqual(out, [{ id: "m1", threadId: "t1" }]);
});

test("getMessage normalizes headers + decodes the text/plain body", async () => {
  const b64 = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const fetchImpl = async () => ({ ok: true, json: async () => ({ id: "m1", threadId: "t1", payload: {
    headers: [{ name: "From", value: "OTT <info@overlandtailor.com>" }, { name: "Reply-To", value: "lead@x.com" },
      { name: "Subject", value: "A New Lead From Facebook Ads" }, { name: "Message-ID", value: "<abc@mail>" }],
    parts: [{ mimeType: "text/plain", body: { data: b64("Hello lead") } }] } }) });
  const m = await G.getMessage("m1", { fetchImpl, tokenImpl });
  assert.equal(m.threadId, "t1");
  assert.equal(m.headers.from, "OTT <info@overlandtailor.com>");
  assert.equal(m.headers.replyTo, "lead@x.com");
  assert.equal(m.headers.messageId, "<abc@mail>");
  assert.equal(m.textBody, "Hello lead");
});

test("getThread fetches the full thread and returns simplified messages in order", async () => {
  const b64 = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  let seenUrl;
  const fetchImpl = async (url) => { seenUrl = url; return { ok: true, json: async () => ({ id: "t1", messages: [
    { id: "m1", threadId: "t1", payload: { headers: [{ name: "From", value: "jo@x.com" }, { name: "Subject", value: "tune?" }],
      parts: [{ mimeType: "text/plain", body: { data: b64("first message") } }] } },
    { id: "m2", threadId: "t1", payload: { headers: [{ name: "From", value: "info@tunedyota.com" }, { name: "Subject", value: "Re: tune?" }],
      parts: [{ mimeType: "text/plain", body: { data: b64("our reply") } }] } },
  ] }) }; };
  const out = await G.getThread("t1", { fetchImpl, tokenImpl });
  assert.match(seenUrl, /\/threads\/t1\?format=full/);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "m1");
  assert.equal(out[0].headers.from, "jo@x.com");
  assert.equal(out[0].textBody, "first message");
  assert.equal(out[1].id, "m2");
  assert.equal(out[1].textBody, "our reply");
});

test("sendReply posts a base64url raw message with threadId + In-Reply-To", async () => {
  let body;
  const fetchImpl = async (url, opts) => { body = JSON.parse(opts.body); return { ok: true, json: async () => ({ id: "sent1" }) }; };
  const r = await G.sendReply({ threadId: "t1", to: "lead@x.com", inReplyTo: "<abc@mail>", references: "<abc@mail>",
    subject: "Re: A New Lead From Facebook Ads", body: "done" }, { fetchImpl, tokenImpl });
  assert.equal(r.id, "sent1");
  assert.equal(body.threadId, "t1");
  const raw = Buffer.from(body.raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
  assert.match(raw, /To: lead@x.com/);
  assert.match(raw, /In-Reply-To: <abc@mail>/);
  assert.match(raw, /done/);
});
