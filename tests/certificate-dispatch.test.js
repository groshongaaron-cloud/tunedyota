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

test("emails installer (CC owner) with cert attachment and marks sent", async () => {
  const d = deps();
  await dispatchCertificates(d);
  assert.equal(d._sends.length, 1);
  assert.equal(d._sends[0].to, "cody@tunedyota.com");
  assert.equal(d._sends[0].cc, "info@tunedyota.com");
  assert.equal(d._sends[0].attachments[0].filename, "certificate.html");
  assert.equal(d._updates.length, 1);
  assert.equal(d._updates[0].fields["Certificate Sent"], true);
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
