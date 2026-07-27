const { test } = require("node:test");
const assert = require("node:assert/strict");
const { dispatcherKey } = require("../netlify/functions/lib/routing.js");

test("dispatcherKey: env override, default aaron, garbage falls back", () => {
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "cody" }), "cody");
  assert.equal(dispatcherKey({}), "aaron");
  assert.equal(dispatcherKey({ CHAT_DISPATCHER: "nobody" }), "aaron");
});
