// resend-cert: regenerate + re-send a completed booking's Certificate of
// Calibration from the CURRENT record — the recovery path after a data
// correction (e.g. wrong engine picked at booking, fixed via installer-reschedule).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processCloseout } = require("../netlify/functions/installer-closeout.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", RESEND_API_KEY: "k" };
const completedRec = (extra = {}) => ({ id: "rec1", fields: {
  Installer: "cody", Name: "Alexander Ellis", Vehicle: "2016-2023 Toyota Tacoma 3.5L V6",
  "Model Year": "2023", VIN: "3TMCZ5AN0PM555555", Status: "Completed",
  "OTT Calibration": "Spicy", "Event Date": "2026-07-28", "Calibration Date": "2026-07-28",
  "Certificate Sent": true, "Certificate Issued": "2026-07-28",
  Email: "alex@example.com", ...extra } });

const deps = (over = {}) => ({ env, key: "cody", now: new Date("2026-08-02T12:00:00Z"),
  get: async () => completedRec(), update: async () => ({}), send: async () => ({ ok: true }),
  log: { error() {} }, ...over });

test("resend requires confirmation", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert" }, deps());
  assert.equal(out.error, "unconfirmed");
});

test("resend refuses a booking that is not completed", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ get: async () => completedRec({ Status: "Booked" }) }));
  assert.equal(out.error, "not-completed");
});

test("resend refuses a record with no calibration on file", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ get: async () => completedRec({ "OTT Calibration": "" }) }));
  assert.equal(out.error, "no-calibration");
});

test("ownership: not-yours for another installer, admin allowed", async () => {
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ key: "noah" }));
  assert.equal(out.error, "not-yours");
  const ok = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ key: "aaron", admin: true }));
  assert.equal(ok.status, "resent");
});

test("resend renders from the CURRENT record and supersedes the earlier copy", async () => {
  let sent = null; const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ send: async (m) => { sent = m; return { ok: true }; },
           update: async (a) => { updates.push(a.fields); return {}; } }));
  assert.equal(out.status, "resent");
  assert.equal(out.to, "alex@example.com");
  const html = Buffer.from(sent.attachments[0].content, "base64").toString();
  assert.ok(html.includes("2023 Toyota Tacoma 3.5L V6"), "corrected vehicle on the cert");
  assert.ok(!html.includes("2.7L"), "no trace of the wrong engine");
  assert.ok(/\(corrected\)/.test(sent.subject), "subject flags the corrected copy");
  assert.ok(/supersedes/.test(sent.text), "body says it supersedes the earlier copy");
  const all = Object.assign({}, ...updates);
  assert.equal(all["Certificate Sent"], true);
  assert.equal(all["Certificate Issued"], "2026-08-02");
  assert.equal(all["Certificate Recipient"], "alex@example.com");
  assert.equal(all["Cert Delivery"], "customer");
  assert.ok(all["Certificate Reissued"], "reissue timestamp recorded");
});

test("first-time send via resend (cert never sent) is not labelled corrected", async () => {
  let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ get: async () => completedRec({ "Certificate Sent": undefined }),
           send: async (m) => { sent = m; return { ok: true }; } }));
  assert.equal(out.status, "resent");
  assert.ok(!/\(corrected\)/.test(sent.subject));
  assert.ok(!/supersedes/.test(sent.text));
});

test("customerEmail param redirects delivery and is persisted (fixes installer-fallback certs)", async () => {
  let sent = null; const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true, customerEmail: "new@example.com" },
    deps({ get: async () => completedRec({ Email: "", "Cert Delivery": "installer-fallback" }),
           send: async (m) => { sent = m; return { ok: true }; },
           update: async (a) => { updates.push(a.fields); return {}; } }));
  assert.equal(out.status, "resent");
  assert.equal(sent.to, "new@example.com");
  const all = Object.assign({}, ...updates);
  assert.equal(all.Email, "new@example.com");
  assert.equal(all["Cert Delivery"], "customer");
});

test("no email anywhere falls back to the owning installer", async () => {
  let sent = null;
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ get: async () => completedRec({ Email: "" }), send: async (m) => { sent = m; return { ok: true }; } }));
  assert.equal(out.status, "resent");
  assert.equal(sent.to, "cody@tunedyota.com");
});

test("a send failure reports send-failed and writes nothing", async () => {
  const updates = [];
  const out = await processCloseout({ recordId: "rec1", action: "resend-cert", confirmed: true },
    deps({ send: async () => { throw new Error("smtp down"); },
           update: async (a) => { updates.push(a.fields); return {}; } }));
  assert.equal(out.error, "send-failed");
  assert.equal(updates.length, 0);
});

test("console completed card wires correction + resend", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");
  assert.ok(HTML.includes("resend-cert"), "resend action wired");
  assert.ok(HTML.includes("rem_'+b.id"), "resend email input rendered");
  assert.ok(HTML.includes("ry_'+b.id"), "completed-card model year input rendered");
  assert.ok(HTML.includes("correctCompleted"), "completed-card correction handler present");
});
