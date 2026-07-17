const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processClientAuth } = require("../netlify/functions/client-auth.js");
const { verifyLogin, verifySession, signLogin } = require("../netlify/functions/lib/client-auth.js");

const ENV = {
  CLIENT_SESSION_SECRET: "test-secret-0123456789",
  RESEND_API_KEY: "rk", AIRTABLE_TOKEN: "at", AIRTABLE_BASE_ID: "app1",
};
const NOW = 1800000000000;

test("request emails a 30-minute magic link and never enumerates", async () => {
  const sent = [];
  const out = await processClientAuth({ action: "request", email: "Pat@Example.com" },
    { env: ENV, now: NOW, send: async (a) => { sent.push(a); } });
  assert.equal(out.status, "sent");
  assert.equal(sent[0].to, "pat@example.com");
  const m = /account\?lt=([A-Za-z0-9_\-\.]+)/.exec(sent[0].html);
  assert.ok(m, "link in email");
  assert.equal(verifyLogin(m[1], NOW + 29 * 60 * 1000, ENV).email, "pat@example.com");
  assert.equal(verifyLogin(m[1], NOW + 31 * 60 * 1000, ENV), null, "30-min ttl");
});

test("request rejects a malformed email without sending", async () => {
  const sent = [];
  const out = await processClientAuth({ action: "request", email: "not-an-email" },
    { env: ENV, now: NOW, send: async (a) => { sent.push(a); } });
  assert.equal(out.status, "error");
  assert.equal(out.error, "bad-email");
  assert.equal(sent.length, 0);
});

test("request reports an honest send failure", async () => {
  const out = await processClientAuth({ action: "request", email: "pat@example.com" },
    { env: ENV, now: NOW, send: async () => { throw new Error("Resend 500"); } });
  assert.deepEqual(out, { status: "error", error: "send-failed" });
});

test("exchange creates the client on first login and returns a session", async () => {
  const created = [];
  const lt = signLogin("pat@example.com", 30 * 60 * 1000, NOW, ENV);
  const out = await processClientAuth({ action: "exchange", token: lt },
    { env: ENV, now: NOW + 1000,
      list: async () => [],
      create: async (a) => { created.push(a.fields); return { id: "rc1" }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.email, "pat@example.com");
  assert.deepEqual(out.vehicles, []);
  assert.equal(created[0].Email, "pat@example.com");
  assert.ok(created[0]["Created At"]);
  assert.equal(verifySession(out.token, NOW + 2000, ENV).email, "pat@example.com");
});

test("exchange returns the existing profile and stamps Last Login", async () => {
  const updated = [];
  const lt = signLogin("pat@example.com", 30 * 60 * 1000, NOW, ENV);
  const out = await processClientAuth({ action: "exchange", token: lt },
    { env: ENV, now: NOW + 1000,
      list: async () => [{ id: "rc1", fields: { Email: "pat@example.com", Name: "Pat R",
        Vehicles: JSON.stringify([{ make: "Toyota", model: "Tundra", year: "2021" }]) } }],
      update: async (a) => { updated.push(a); return { id: a.id }; } });
  assert.equal(out.status, "ok");
  assert.equal(out.name, "Pat R");
  assert.equal(out.vehicles[0].model, "Tundra");
  assert.equal(updated[0].id, "rc1");
  assert.ok(updated[0].fields["Last Login"]);
});

test("exchange rejects a bad or expired link", async () => {
  const out = await processClientAuth({ action: "exchange", token: "junk" }, { env: ENV, now: NOW });
  assert.deepEqual(out, { status: "error", error: "bad-link" });
  const lt = signLogin("pat@example.com", 1000, NOW, ENV);
  const out2 = await processClientAuth({ action: "exchange", token: lt }, { env: ENV, now: NOW + 2000 });
  assert.deepEqual(out2, { status: "error", error: "bad-link" });
});
