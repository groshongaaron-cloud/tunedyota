// Annual rebook nudge (funnel audit 2026-08-02): ~a year after a calibration,
// the customer gets ONE personal check-in inviting them back — unless they
// already rebooked on their own. Email only (no SMS without consent scope).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runRebookNudge } = require("../netlify/functions/rebook-nudge.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b", CLIENT_SESSION_SECRET: "s" };
const NOW = new Date("2026-08-10T15:30:00Z");
const monthsAgo = (m) => { const d = new Date(NOW); d.setUTCMonth(d.getUTCMonth() - m); return d.toISOString().slice(0, 10); };

const bk = (id, over = {}) => ({ id, fields: { Name: "Eli Soetenga", Email: "eli@example.com",
  Phone: "(608) 555-0100", Vehicle: "2019 Tundra", Status: "Completed",
  "Calibration Date": monthsAgo(12), "Event Date": monthsAgo(12), Installer: ["aaron"], ...over } });

function run(records, over = {}) {
  const sends = [], stamps = [];
  return runRebookNudge({ env, now: NOW,
    list: async () => records,
    update: async (a) => { stamps.push(a); return {}; },
    send: async (a) => { sends.push(a); return {}; },
    ...over }).then((out) => ({ out, sends, stamps }));
}

test("nudges a customer ~12 months after calibration: personal, booking link, referral link, stamp", async () => {
  const { out, sends, stamps } = await run([bk("r1")]);
  assert.equal(out.sent, 1);
  assert.equal(sends[0].to, "eli@example.com");
  assert.match(sends[0].text, /Eli/);
  assert.match(sends[0].text, /about a year/i);
  assert.match(sends[0].text, /find-your-exact-tune/);
  assert.match(sends[0].text, /\?ref=/, "referral link included");
  assert.equal(stamps[0].fields["Rebook Nudge Sent"], "2026-08-10");
});

test("customers who already rebooked (newer booking, same phone/email) are left alone", async () => {
  const { sends } = await run([
    bk("r1"),
    bk("r2", { Status: "Booked", "Event Date": monthsAgo(1), "Calibration Date": "" }),
  ]);
  assert.equal(sends.length, 0, "newer booking for the same person suppresses the nudge");
});

test("a newer CANCELLED booking does not count as a rebook", async () => {
  const { sends } = await run([
    bk("r1"),
    bk("r2", { Status: "Cancelled", "Event Date": monthsAgo(1), "Calibration Date": "" }),
  ]);
  assert.equal(sends.length, 1);
});

test("skips: outside the 11-13 month window, no email, already nudged, not Completed", async () => {
  const { sends } = await run([
    bk("r1", { "Calibration Date": monthsAgo(6) }),
    bk("r2", { "Calibration Date": monthsAgo(18) }),
    bk("r3", { Email: "" }),
    bk("r4", { "Rebook Nudge Sent": "2026-07-01" }),
    bk("r5", { Status: "No-show" }),
  ]);
  assert.equal(sends.length, 0);
});

test("send failure leaves the booking unstamped for next week's retry", async () => {
  const { out, stamps } = await run([bk("r1")], { send: async () => { throw new Error("resend 500"); } });
  assert.equal(out.sent, 0);
  assert.equal(stamps.length, 0);
});

test("per-run cap holds", async () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    bk("r" + i, { Email: `c${i}@example.com`, Phone: `(608) 555-0${String(100 + i)}` }));
  const { out } = await run(many);
  assert.ok(out.sent <= 20, "capped at 20, got " + out.sent);
});
