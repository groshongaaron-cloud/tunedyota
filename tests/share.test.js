const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shareLinks } = require("../site/share.js");

test("shareLinks builds encoded fallback URLs per platform", () => {
  const L = shareLinks("https://tunedyota.com/get-ott-now", "Get OTT Now");
  assert.match(L.facebook, /facebook\.com\/sharer\/sharer\.php\?u=https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
  assert.match(L.reddit, /reddit\.com\/submit\?url=https%3A%2F%2Ftunedyota\.com%2Fget-ott-now&title=Get%20OTT%20Now/);
  assert.match(L.email, /^mailto:\?subject=.*&body=Get%20OTT%20Now%20https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
  assert.match(L.sms, /body=Get%20OTT%20Now%20https%3A%2F%2Ftunedyota\.com%2Fget-ott-now/);
});

test("require does not throw in node (no document) and exports the pure builder", () => {
  assert.equal(typeof shareLinks, "function");
});
