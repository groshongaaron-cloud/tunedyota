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

test("complete stores a normalized VIN and stamps it on the certificate", async () => {
  const updates = []; let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Spicy", vin: " 5tfdw5f17-mx000000 " },
    { env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
      get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async (m) => { sent = m; return { ok: true }; } });
  assert.equal(out.status, "completed");
  assert.equal(updates[0].VIN, "5TFDW5F17MX000000");   // upper-cased, spaces + dashes stripped
  const certHtml = Buffer.from(sent.attachments[0].content, "base64").toString();
  assert.ok(certHtml.includes("5TFDW5F17MX000000"));   // VIN present on the certificate
});

test("complete still persists when the base has no VIN column (tolerant)", async () => {
  const updates = []; let sent = null;
  const update = async (a) => {
    updates.push(a.fields);
    if ("VIN" in a.fields) throw new Error('airtable update 422: Unknown field name: "VIN"');
    return {};
  };
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light", vin: "5TFDW5F17MX000000" },
    { env, key: "cody", get: async () => recFor("cody"), update, send: async (m) => { sent = m; return {}; }, log: { error() {} } });
  assert.equal(out.status, "completed");
  assert.equal(out.certSent, true);
  assert.equal(updates[0].Status, "Completed");        // completion persisted on retry
  const certHtml = Buffer.from(sent.attachments[0].content, "base64").toString();
  assert.ok(certHtml.includes("5TFDW5F17MX000000"));   // cert still carries the VIN
});

test("complete stores the OTT commission fields (normalized) but keeps them off the certificate", async () => {
  const updates = []; let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Spicy", vin: "5TFDW5F17MX000000",
      tuningPlatform: "vft", calibrationType: "Basic", ecuId: "04c21", gearSize: "4.30", mileage: "85,000 mi" },
    { env, key: "cody", now: new Date("2026-07-03T12:00:00Z"),
      get: async () => recFor("cody"),
      update: async (a) => { updates.push(a.fields); return {}; },
      send: async (m) => { sent = m; return { ok: true }; } });
  assert.equal(out.status, "completed");
  assert.equal(updates[0]["Tuning Platform"], "VFT");          // upper-cased
  assert.equal(updates[0]["Calibration Type"], "Basic");
  assert.equal(updates[0]["ECU ID"], "04C21");
  assert.equal(updates[0]["Gear Size"], "4.30");
  assert.equal(updates[0]["Mileage"], 85000);                  // digits only, numeric
  const cert = Buffer.from(sent.attachments[0].content, "base64").toString();
  assert.ok(!/Tuning Platform|Calibration Type|ECU ID|Gear Size|Mileage/i.test(cert)); // not on the customer cert
  assert.ok(!cert.includes("04C21"));
});

test("complete still persists when the base lacks the OTT columns (tolerant)", async () => {
  const updates = [];
  const update = async (a) => {
    updates.push(a.fields);
    if ("Tuning Platform" in a.fields) throw new Error('airtable update 422: Unknown field name: "Tuning Platform"');
    return {};
  };
  const out = await processCloseout({ recordId: "rec1", action: "complete", calibration: "Light", vin: "5TFDW5F17MX000000", tuningPlatform: "PCM", calibrationType: "Custom", ecuId: "CM5201", gearSize: "3.91", mileage: "42000" },
    { env, key: "cody", get: async () => recFor("cody"), update, send: async () => ({}), log: { error() {} } });
  assert.equal(out.status, "completed");
  assert.equal(updates[0].Status, "Completed");                // completion persisted on retry
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
