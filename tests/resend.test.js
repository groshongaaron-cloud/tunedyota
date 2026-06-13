const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sendEmail } = require("../netlify/functions/lib/resend.js");

function fakeFetch(captured, { ok = true, status = 200, body = "{\"id\":\"abc\"}" } = {}) {
  return async (url, opts) => {
    captured.url = url; captured.opts = opts;
    return {
      ok, status,
      json: async () => JSON.parse(body),
      text: async () => body,
    };
  };
}

test("posts to Resend with auth header and JSON body", async () => {
  const cap = {};
  await sendEmail({
    fetchImpl: fakeFetch(cap), apiKey: "re_test",
    from: "Tuned Yota <info@tunedyota.com>", to: "noah@tunedyota.com",
    cc: "info@tunedyota.com", replyTo: "jane@example.com",
    subject: "S", html: "<p>H</p>", text: "T",
  });
  assert.equal(cap.url, "https://api.resend.com/emails");
  assert.equal(cap.opts.method, "POST");
  assert.equal(cap.opts.headers.Authorization, "Bearer re_test");
  const sent = JSON.parse(cap.opts.body);
  assert.deepEqual(sent.to, ["noah@tunedyota.com"]);
  assert.deepEqual(sent.cc, ["info@tunedyota.com"]);
  assert.deepEqual(sent.reply_to, ["jane@example.com"]);
  assert.equal(sent.subject, "S");
});

test("omits cc and reply_to when not provided", async () => {
  const cap = {};
  await sendEmail({
    fetchImpl: fakeFetch(cap), apiKey: "re_test",
    from: "f", to: "x@y.com", subject: "S", html: "h", text: "t",
  });
  const sent = JSON.parse(cap.opts.body);
  assert.equal(sent.cc, undefined);
  assert.equal(sent.reply_to, undefined);
});

test("throws on non-ok response", async () => {
  const cap = {};
  await assert.rejects(
    () => sendEmail({
      fetchImpl: fakeFetch(cap, { ok: false, status: 422, body: "bad" }),
      apiKey: "re_test", from: "f", to: "x@y.com", subject: "s", html: "h", text: "t",
    }),
    /Resend 422/,
  );
});
