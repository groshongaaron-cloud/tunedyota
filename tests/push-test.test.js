const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processTest } = require("../netlify/functions/push-test.js");

test("sends a test push to the caller and returns sent count", async () => {
  let calledKey, calledMsg;
  const out = await processTest({ key: "aaron", push: async (k, m) => { calledKey = k; calledMsg = m; return { sent: 1, failed: 0 }; } });
  assert.equal(out.ok, true);
  assert.equal(out.sent, 1);
  assert.equal(calledKey, "aaron");
  assert.match(calledMsg.body, /notification/i);
});
