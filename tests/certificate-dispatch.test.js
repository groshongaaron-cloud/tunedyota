const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dispatchCertificates } = require("../netlify/functions/certificate-dispatch.js");

function deps(overrides = {}) {
  const sends = [], updates = [], notifies = [];
  const rows = [{ id: "b1", fields: { Name: "Jane", Vehicle: "Tacoma", Installer: "cody", "Calibration Date": "2026-06-28", Status: "Completed", "OTT Calibration": "Medium" } }];
  return {
    env: { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "re", SLACK_WEBHOOK_URL: "https://hooks.slack.test/x" },
    list: async () => rows,
    send: async (a) => { sends.push(a); return { id: "e" }; },
    update: async (a) => { updates.push(a); return { id: a.id }; },
    notify: async (a) => { notifies.push(a); return { ok: true }; },
    log: { warn() {}, error() {} },
    _sends: sends, _updates: updates, _notifies: notifies,
    ...overrides,
  };
}

test("no customer email — sends to installer (no cc) with cert attachment and marks sent", async () => {
  const d = deps();
  await dispatchCertificates(d);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "cody@tunedyota.com");
  assert.equal(d._sends[0].cc, undefined);
  assert.equal(d._sends[0].attachments[0].filename, "certificate.html");
  assert.equal(d._updates.length, 1);
  assert.equal(d._updates[0].fields["Certificate Sent"], true);
  assert.equal(d._updates[0].fields["Cert Delivery"], "installer-fallback");
  assert.equal(d._notifies.length, 0);
});
test("email failure -> Slack alert AND row left unmarked", async () => {
  const d = deps({ send: async () => { throw new Error("Resend 403"); } });
  await dispatchCertificates(d);
  assert.equal(d._updates.length, 0);
  assert.equal(d._notifies.length, 1);
  assert.match(d._notifies[0].text, /Certificate email FAILED/i);
});
test("installer IS owner (aaron) -> no CC", async () => {
  const d = deps({ list: async () => [{ id: "b2", fields: { Name: "Sam", Vehicle: "4Runner", Installer: "aaron", Status: "Completed", "OTT Calibration": "Spicy" } }] });
  await dispatchCertificates(d);
  assert.equal(d._sends[0].to, "info@tunedyota.com");
  assert.equal(d._sends[0].cc, undefined);
});
test("holds the certificate when OTT Calibration is empty (no send, retries next run)", async () => {
  const d = deps({ list: async () => [{ id: "b9", fields: { Name: "Pat", Vehicle: "Tundra", Installer: "noah", "Calibration Date": "2026-06-28", Status: "Completed" } }] });
  const r = await dispatchCertificates(d);
  assert.equal(d._sends.length, 0);        // nothing emailed
  assert.equal(d._updates.length, 0);      // left unmarked → eligible next run
  assert.equal(r.held, 1);
  assert.equal(d._notifies.length, 1);     // owner nudged once
  assert.match(d._notifies[0].text, /held/i);
});
test("OTT Calibration field from Airtable appears in the certificate attachment", async () => {
  const d = deps({ list: async () => [{ id: "b3", fields: { Name: "Jane", Vehicle: "Tacoma", Installer: "cody", "Calibration Date": "2026-06-28", Status: "Completed", "OTT Calibration": "SS" } }] });
  await dispatchCertificates(d);
  assert.equal(d._sends.length, 1);
  const attachmentHtml = Buffer.from(d._sends[0].attachments[0].content, "base64").toString("utf8");
  assert.ok(/OTT Calibration/.test(attachmentHtml), "attachment HTML should contain 'OTT Calibration' label");
  assert.ok(/SS/.test(attachmentHtml), "attachment HTML should contain calibration value 'SS'");
});
test("idempotency flag persists even when the new metadata columns are missing", async () => {
  const writes = [];
  // Simulate Airtable rejecting the optional columns until they're dropped.
  const update = async (a) => {
    if (a.fields && "Cert Delivery" in a.fields) {
      const e = new Error("Unknown field name: \"Cert Delivery\" (UNKNOWN_FIELD_NAME)");
      throw e;
    }
    writes.push(a.fields);
    return {};
  };
  const r = await dispatchCertificates({
    list: async () => ([{ id: "rec1", fields: {
      Status: "Completed", "OTT Calibration": "Medium", Name: "C", Installer: "aaron",
      Vehicle: "2024 Toyota Tacoma 2.4L-T I4", Email: "cust@example.com", "Calibration Date": "2026-07-12" } }]),
    update, send: async () => {}, notify: async () => {}, env: { RESEND_API_KEY: "x" },
  });
  assert.equal(r.sent, 1);
  const merged = Object.assign({}, ...writes);
  assert.equal(merged["Certificate Sent"], true, "idempotency flag must still persist");
});
test("backstop sends to the customer email when present, no cc", async () => {
  const sent = [];
  const r = await dispatchCertificates({
    list: async () => ([{ id: "rec1", fields: {
      Status: "Completed", "OTT Calibration": "Medium", Name: "C", Installer: "aaron",
      Vehicle: "2024 Toyota Tacoma 2.4L-T I4", Email: "cust@example.com", "Calibration Date": "2026-07-12" } }]),
    update: async () => ({}), send: async (a) => { sent.push(a); }, notify: async () => {},
    env: { RESEND_API_KEY: "x" },
  });
  assert.equal(r.sent, 1);
  assert.equal(sent[0].to, "cust@example.com");
  assert.equal(sent[0].cc, undefined);
});
