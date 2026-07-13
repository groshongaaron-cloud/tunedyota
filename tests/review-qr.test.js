const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildReviewQr } = require("../netlify/functions/review-qr.js");

test("renders an SVG QR when the review url is set", () => {
  const out = buildReviewQr({ GOOGLE_REVIEW_URL: "https://g.page/r/abc123/review" });
  assert.equal(out.ok, true);
  assert.match(out.svg, /^<svg /);
  assert.ok((out.svg.match(/<rect/g) || []).length > 10);
});

test("not ok when unset or blank", () => {
  assert.equal(buildReviewQr({}).ok, false);
  assert.equal(buildReviewQr({ GOOGLE_REVIEW_URL: "   " }).ok, false);
});
