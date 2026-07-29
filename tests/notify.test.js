const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/notify.js");

const post = (body, headers = {}) => ({ httpMethod: "POST", headers, body: JSON.stringify(body) });
const okNotify = async ({ text }) => { okNotify.last = text; return { ok: true }; };

test("relays text to Slack when token matches (header)", async () => {
  let seen;
  const notify = async ({ webhookUrl, text }) => { seen = { webhookUrl, text }; return { ok: true }; };
  const r = await handler(post({ text: "hello" }, { "x-ty-notify": "secret" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.text, "hello");
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/x");
});

test("accepts token in body as well", async () => {
  const r = await handler(post({ text: "hi", token: "secret" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://x" }, notify: okNotify });
  assert.equal(r.statusCode, 200);
});

test("401 when token missing/wrong", async () => {
  const r = await handler(post({ text: "hi" }, { "x-ty-notify": "nope" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://x" }, notify: okNotify });
  assert.equal(r.statusCode, 401);
});

test("400 on missing text", async () => {
  const r = await handler(post({ token: "secret" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://x" }, notify: okNotify });
  assert.equal(r.statusCode, 400);
});

test("400 on bad json", async () => {
  const r = await handler({ httpMethod: "POST", headers: {}, body: "{not json" }, {}, {
    env: { NOTIFY_TOKEN: "secret" }, notify: okNotify });
  assert.equal(r.statusCode, 400);
});

test("405 on non-POST", async () => {
  const r = await handler({ httpMethod: "GET", headers: {}, body: "" }, {}, {
    env: { NOTIFY_TOKEN: "secret" }, notify: okNotify });
  assert.equal(r.statusCode, 405);
});

test("503 when Slack webhook not configured", async () => {
  const notify = async () => ({ skipped: true });
  const r = await handler(post({ text: "hi", token: "secret" }), {}, {
    env: { NOTIFY_TOKEN: "secret" }, notify });
  assert.equal(r.statusCode, 503);
});

test("502 when Slack post fails", async () => {
  const notify = async () => ({ ok: false, error: "boom" });
  const r = await handler(post({ text: "hi", token: "secret" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://x" }, notify });
  assert.equal(r.statusCode, 502);
});

test("topic content-ops routes to its webhook when configured", async () => {
  let seen;
  const notify = async ({ webhookUrl, text }) => { seen = { webhookUrl, text }; return { ok: true }; };
  const r = await handler(post({ text: "staged", token: "secret", topic: "content-ops" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default",
           SLACK_WEBHOOK_URL_CONTENT_OPS: "https://hooks.slack.test/content" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/content");
});

test("topic falls back to default webhook when topic env not set", async () => {
  let seen;
  const notify = async ({ webhookUrl }) => { seen = { webhookUrl }; return { ok: true }; };
  const r = await handler(post({ text: "staged", token: "secret", topic: "content-ops" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/default");
});

test("unknown topic falls back to default webhook", async () => {
  let seen;
  const notify = async ({ webhookUrl }) => { seen = { webhookUrl }; return { ok: true }; };
  const r = await handler(post({ text: "x", token: "secret", topic: "weird/../thing" }), {}, {
    env: { NOTIFY_TOKEN: "secret", SLACK_WEBHOOK_URL: "https://hooks.slack.test/default" }, notify });
  assert.equal(r.statusCode, 200);
  assert.equal(seen.webhookUrl, "https://hooks.slack.test/default");
});
