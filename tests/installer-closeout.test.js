const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
const recFor = (installer, extra = {}) => ({ id: "rec1", fields: { Installer: installer, Name: "Jane", Vehicle: "Tundra", ...extra } });

test("refuses a booking that belongs to another installer (403 shape)", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Spicy" },
    { env, key: "noah", get: async () => recFor("cody"), update: async () => ({}), send: async () => ({}) });
  assert.equal(out.status, "error");
  assert.equal(out.error, "not-yours");
});

test("complete requires a valid calibration", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Nope" },
    { env, key: "cody", get: async () => recFor("cody"), update: async () => ({}), send: async () => ({}) });
  assert.equal(out.error, "bad-calibration");
});

test("complete sets fields, sends the cert, marks Certificate Sent", async () => {
  const updates = []; let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Medium and Spicy" },
    { env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
      get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async (m) => { sent = m; return { ok: true }; } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, true);
  assert.equal(updates[0].Status, "Completed");
  assert.equal(updates[0]["OTT Calibration"], "Medium and Spicy");
  assert.equal(updates[0]["Calibration Date"], "2026-07-03");
  assert.equal(updates[1]["Certificate Sent"], true);       // second update after send
  assert.equal(sent.to, "cody@tunedyota.com");              // routed to the installer
  assert.ok(sent.attachments && sent.attachments[0].filename === "certificate.html");
});

test("noshow just sets Status", async () => {
  const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "noshow" },
    { env, key: "cody", get: async () => recFor("cody"), update: async (a) => { updates.push(a.fields); return {}; }, send: async () => ({}) });
  assert.equal(out.status, "noshow");
  assert.equal(updates[0].Status, "No-show");
});

test("a cert-send failure still leaves the booking Completed, certSent false", async () => {
  const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light" },
    { env, key: "cody", get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async () => { throw new Error("resend down"); }, log: { error() {} } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, false);
  assert.equal(updates[0].Status, "Completed");             // completion persisted
  assert.ok(!updates.some((u) => u["Certificate Sent"]));   // never marked sent
});

test("accepts a multi-select Installer array (Airtable multi-select returns [\"cody\"])", async () => {
  const updates = []; let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light" },
    { env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
      get: async () => ({ id: "rec1", fields: { Installer: ["cody"], Name: "Jane", Vehicle: "Tundra" } }),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async (m) => { sent = m; return { ok: true }; } });
  assert.equal(out.status, "completed");           // NOT "not-yours"
  assert.equal(updates[0].Status, "Completed");
  assert.equal(sent.to, "cody@tunedyota.com");     // installer resolved from the array
});

test("re-completing an already-certified booking is idempotent (no duplicate cert)", async () => {
  let sends = 0;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light" },
    { env, key: "cody", get: async () => recFor("cody", { "Certificate Sent": true, Status: "Completed" }),
      update: async () => ({}), send: async () => { sends++; return {}; } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, true);
  assert.equal(out.alreadySent, true);
  assert.equal(sends, 0); // did NOT re-send the certificate
});
