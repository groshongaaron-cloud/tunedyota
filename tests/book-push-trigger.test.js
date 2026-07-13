const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processNotifications } = require("../netlify/functions/book-background.js");

// A booking job (job.inst/market/event/d — NOT job.kind "priority") fires a push
// to the assigned installer after the installer email. Real email templates run
// but `send` is mocked so nothing is actually sent.
const bookingJob = () => ({
  inst: { key: "aaron", name: "Aaron", email: "a@x.com", phone: "555" },
  market: { city: "Fargo", state: "ND" },
  event: { dateISO: "2026-07-11", slot: "9:00" },
  d: { name: "Jo", email: "j@x.com", vehicle: "Tundra", slot: "9:00" },
  recordId: "rec1", stamp: "s1",
});

test("a new booking pushes the assigned installer", async () => {
  const pushes = [];
  await processNotifications(bookingJob(), {
    env: {}, send: async () => ({}), notify: async () => ({}), update: async () => ({}),
    ping: async () => ({}), log: { error() {}, log() {} },
    push: async (key, msg) => { pushes.push({ key, msg }); return { sent: 1, failed: 0 }; },
  });
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].key, "aaron");
  assert.match(pushes[0].msg.body, /Jo/);
});

test("booking also sends a web push to the installer", async () => {
  let wp;
  await processNotifications(bookingJob(), {
    env: {}, send: async () => ({}), notify: async () => ({}), update: async () => ({}),
    ping: async () => ({}), log: { error() {}, log() {} },
    push: async () => ({ sent: 1, failed: 0 }),
    webPush: async (k, m) => { wp = { k, m }; return { sent: 1, failed: 0 }; },
  });
  assert.equal(wp.k, "aaron");
  assert.match(wp.m.title, /New booking/i);
});

test("a push failure never breaks the notification flow", async () => {
  const out = await processNotifications(bookingJob(), {
    env: {}, send: async () => ({}), notify: async () => ({}), update: async () => ({}),
    ping: async () => ({}), log: { error() {}, log() {} },
    push: async () => { throw new Error("fcm down"); },
  });
  assert.ok(out);
});
