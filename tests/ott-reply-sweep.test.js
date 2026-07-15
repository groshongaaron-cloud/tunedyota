// tests/ott-reply-sweep.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReplySweep, buildReplyBody } = require("../netlify/functions/ott-reply-sweep.js");

const leadRec = (f) => ({ id: "L1", fields: Object.assign({ Name: "Jo", "Email Thread": "t1", "Email Message-Id": "<x@m>",
  "Reply-To": "info@overlandtailor.com", "Converted Booking": "recBk", "OTT Reply Sent": "" }, f) });

test("buildReplyBody fills vehicle/date/installer", () => {
  const b = buildReplyBody({ Vehicle: "2022 Tundra", Installer: "cody", "Calibration Date": "2026-07-20" });
  assert.match(b, /2022 Tundra/);
  assert.match(b, /completed/i);
});

test("runReplySweep replies for a Completed OTT booking and stamps the lead", async () => {
  let sent, stamped;
  const out = await runReplySweep({ today: "2026-07-21",
    listLeadsImpl: async () => [leadRec()],
    getBookingImpl: async () => ({ id: "recBk", fields: { Status: "Completed", Vehicle: "2022 Tundra", Installer: "cody" } }),
    gmail: { sendReply: async (m) => { sent = m; return { id: "s1" }; } },
    updateLeadImpl: async (a) => { stamped = a.fields; return { id: a.id }; }, env: {} });
  assert.equal(out.replied, 1);
  assert.equal(sent.threadId, "t1");
  assert.equal(sent.inReplyTo, "<x@m>");
  assert.equal(sent.to, "info@overlandtailor.com");
  assert.equal(stamped["OTT Reply Sent"], "2026-07-21");
});

test("runReplySweep skips a booking that is not Completed", async () => {
  const out = await runReplySweep({ today: "2026-07-21", listLeadsImpl: async () => [leadRec()],
    getBookingImpl: async () => ({ id: "recBk", fields: { Status: "Booked" } }),
    gmail: { sendReply: async () => { throw new Error("should not send"); } }, updateLeadImpl: async () => ({}), env: {} });
  assert.equal(out.replied, 0);
});
