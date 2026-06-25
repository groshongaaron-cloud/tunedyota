const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processSubmission } = require("../netlify/functions/submission-created.js");

function spyDeps(apiKey = "re_test") {
  const calls = [];
  return {
    apiKey,
    log: { warn() {}, error() {} },
    sendEmail: async (args) => { calls.push(args); return { id: "x" }; },
    calls,
  };
}

const data = {
  name: "Jane", phone: "555", email: "jane@example.com", market: "Green Bay, WI",
  installer_key: "noah", installer_name: "Noah Kreis",
  vehicle: "2025+ Toyota Tacoma", goals: "Power", quote_base: "650",
  quote_custom: "", quote_sc: "950", message: "hi",
  referrer: "", utm_source: "ig", utm_medium: "", utm_campaign: "",
};

test("ignores submissions from other forms", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "contact", data }, d);
  assert.equal(r.skipped, true);
  assert.equal(d.calls.length, 0);
});

test("sends installer email (cc info@) and customer auto-reply", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "tune-lead", data }, d);
  assert.equal(r.sent, 2);
  const installerMail = d.calls[0];
  assert.equal(installerMail.to, "noah@tunedyota.com");
  assert.equal(installerMail.cc, "info@tunedyota.com");
  assert.equal(installerMail.replyTo, "jane@example.com");
  const customerMail = d.calls[1];
  assert.equal(customerMail.to, "jane@example.com");
  assert.equal(customerMail.replyTo, "info@tunedyota.com");
});

test("does not cc info@ when the installer IS info@ (Aaron)", async () => {
  const d = spyDeps();
  await processSubmission({ form_name: "tune-lead", data: { ...data, installer_key: "aaron" } }, d);
  assert.equal(d.calls[0].to, "info@tunedyota.com");
  assert.equal(d.calls[0].cc, undefined);
});

test("skips customer auto-reply when no customer email", async () => {
  const d = spyDeps();
  const r = await processSubmission({ form_name: "tune-lead", data: { ...data, email: "" } }, d);
  assert.equal(r.sent, 1);
  assert.equal(d.calls.length, 1);
});

test("unknown installer_key routes to Aaron / info@", async () => {
  const d = spyDeps();
  await processSubmission({ form_name: "tune-lead", data: { ...data, installer_key: "zzz" } }, d);
  assert.equal(d.calls[0].to, "info@tunedyota.com");
});

test("no API key → sends nothing, returns reason", async () => {
  const d = spyDeps(null);
  const r = await processSubmission({ form_name: "tune-lead", data }, d);
  assert.equal(r.sent, 0);
  assert.equal(r.reason, "no-api-key");
  assert.equal(d.calls.length, 0);
});

test("alerts owner when a lead email send fails", async () => {
  const notifies = [];
  const deps = {
    apiKey: "re_test", log: { warn() {}, error() {} },
    webhookUrl: "https://hooks.slack.test/x",
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    sendEmail: async () => { throw new Error("Resend 403: domain not verified"); },
  };
  const r = await processSubmission({ form_name: "tune-lead", data }, deps);
  assert.equal(r.sent, 0);
  assert.equal(notifies.length, 1);
  assert.match(notifies[0].text, /lead email FAILED/i);
});
test("a failing send is caught and does not abort the other send", async () => {
  const calls = [];
  let first = true;
  const deps = {
    apiKey: "re_test", log: { warn() {}, error() {} },
    sendEmail: async (args) => {
      calls.push(args);
      if (first) { first = false; throw new Error("boom"); }
      return { id: "ok" };
    },
  };
  const r = await processSubmission({ form_name: "tune-lead", data }, deps);
  assert.equal(calls.length, 2);   // both attempted
  assert.equal(r.sent, 1);         // only the second succeeded
});
