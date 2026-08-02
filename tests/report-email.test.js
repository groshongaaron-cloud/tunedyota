// tests/report-email.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/report-email.js");

const ENV = { NOTIFY_TOKEN: "tok", RESEND_API_KEY: "rk" };
const POST = (body, headers = {}) => ({ httpMethod: "POST", headers, body: JSON.stringify(body) });

function harness(env = ENV) {
  const sends = [];
  return { sends, deps: { env, send: async (a) => { sends.push(a); return { id: "e1" }; } } };
}

test("valid token + subject + text sends one report email to info@ and returns 200", async () => {
  const h = harness();
  const res = await handler(POST({ subject: "[TY Trend Scan] 2026-08-02", text: "digest body", token: "tok" }), {}, h.deps);
  assert.equal(res.statusCode, 200);
  assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].to, "info@tunedyota.com");
  assert.match(h.sends[0].from, /events@send\.tunedyota\.events/);
  assert.equal(h.sends[0].subject, "[TY Trend Scan] 2026-08-02");
  assert.equal(h.sends[0].text, "digest body");
});

test("token can come via x-ty-notify header instead of the body", async () => {
  const h = harness();
  const res = await handler(POST({ subject: "s", text: "t" }, { "x-ty-notify": "tok" }), {}, h.deps);
  assert.equal(res.statusCode, 200);
  assert.equal(h.sends.length, 1);
});

test("wrong or missing token is rejected 401, nothing sent", async () => {
  const h = harness();
  const res = await handler(POST({ subject: "s", text: "t", token: "nope" }), {}, h.deps);
  assert.equal(res.statusCode, 401);
  assert.equal(h.sends.length, 0);
});

test("non-POST is rejected 405", async () => {
  const h = harness();
  const res = await handler({ httpMethod: "GET", headers: {} }, {}, h.deps);
  assert.equal(res.statusCode, 405);
});

test("missing subject or text is rejected 400, nothing sent", async () => {
  const h = harness();
  const r1 = await handler(POST({ text: "t", token: "tok" }), {}, h.deps);
  const r2 = await handler(POST({ subject: "s", token: "tok" }), {}, h.deps);
  assert.equal(r1.statusCode, 400);
  assert.equal(r2.statusCode, 400);
  assert.equal(h.sends.length, 0);
});

test("no RESEND_API_KEY returns 503, nothing sent", async () => {
  const h = harness({ NOTIFY_TOKEN: "tok" });
  const res = await handler(POST({ subject: "s", text: "t", token: "tok" }), {}, h.deps);
  assert.equal(res.statusCode, 503);
  assert.equal(h.sends.length, 0);
});

test("send failure returns 502, never throws", async () => {
  const h = harness();
  h.deps.send = async () => { throw new Error("resend 500"); };
  const res = await handler(POST({ subject: "s", text: "t", token: "tok" }), {}, h.deps);
  assert.equal(res.statusCode, 502);
});
