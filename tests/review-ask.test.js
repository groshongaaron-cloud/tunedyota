// Post-install review ask (funnel audit 2026-08-02): every completed customer
// with an email gets ONE personal ask, a few days after the certificate, with
// the Google review link + their referral link. Dormant until GOOGLE_REVIEW_URL
// is configured — turning it on is a one-env-var motion.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runReviewAsk } = require("../netlify/functions/review-ask.js");

const env = { AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b",
  GOOGLE_REVIEW_URL: "https://g.page/r/tunedyota/review", CLIENT_SESSION_SECRET: "s" };
const NOW = new Date("2026-08-10T16:00:00Z");
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400 * 1000).toISOString().slice(0, 10);

const bk = (id, over = {}) => ({ id, fields: { Name: "Eli Soetenga", Email: "eli@example.com",
  Vehicle: "2019 Tundra", Status: "Completed", "Certificate Sent": true,
  "Certificate Issued": daysAgo(3), Installer: ["aaron"], ...over } });

function run(records, over = {}) {
  const sends = [], stamps = [];
  return runReviewAsk({ env, now: NOW,
    list: async () => records,
    update: async (a) => { stamps.push(a); return {}; },
    send: async (a) => { sends.push(a); return {}; },
    ...over }).then((out) => ({ out, sends, stamps }));
}

test("dormant when GOOGLE_REVIEW_URL is unset — no sends, says so", async () => {
  const { out, sends } = await run([bk("r1")], { env: { ...env, GOOGLE_REVIEW_URL: "" } });
  assert.equal(out.dormant, true);
  assert.equal(sends.length, 0);
});

test("asks an eligible completed customer once: review link + referral link + stamp", async () => {
  const { out, sends, stamps } = await run([bk("r1")]);
  assert.equal(out.sent, 1);
  assert.equal(sends[0].to, "eli@example.com");
  assert.match(sends[0].text, /g\.page\/r\/tunedyota\/review/);
  assert.match(sends[0].text, /find-your-exact-tune\?ref=/, "referral link included");
  assert.match(sends[0].text, /Eli/, "first name used");
  assert.match(sends[0].html, /g\.page\/r\/tunedyota\/review/);
  assert.equal(stamps[0].fields["Review Ask Sent"], daysAgo(0));
});

test("skips: no email, already asked, cert not sent, not Completed", async () => {
  const { sends } = await run([
    bk("r1", { Email: "" }),
    bk("r2", { "Review Ask Sent": "2026-08-05" }),
    bk("r3", { "Certificate Sent": false }),
    bk("r4", { Status: "Booked" }),
  ]);
  assert.equal(sends.length, 0);
});

test("waits 2 days after the certificate and never backfills past 14", async () => {
  const { sends } = await run([
    bk("r1", { "Certificate Issued": daysAgo(0) }),
    bk("r2", { "Certificate Issued": daysAgo(1) }),
    bk("r3", { "Certificate Issued": daysAgo(20) }),
  ]);
  assert.equal(sends.length, 0);
});

test("send failure leaves the booking unstamped so tomorrow retries", async () => {
  const { out, stamps } = await run([bk("r1")], { send: async () => { throw new Error("resend 500"); } });
  assert.equal(out.sent, 0);
  assert.equal(stamps.length, 0);
});

test("per-run cap holds", async () => {
  const many = Array.from({ length: 30 }, (_, i) => bk("r" + i));
  const { out } = await run(many);
  assert.ok(out.sent <= 20, "capped at 20, got " + out.sent);
});
