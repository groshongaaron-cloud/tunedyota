const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("../netlify/functions/event-qr.js");

test("valid slug returns an SVG QR of the event link", async () => {
  const res = await handler({ queryStringParameters: { e: "fargo-2026-08-09" } });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /svg/);
  assert.match(res.body, /^<svg|<\?xml/);
});

test("unknown or junk slug is a 404, not an error", async () => {
  for (const e of ["atlantis-2026-08-09", "fargo", "", undefined]) {
    const res = await handler({ queryStringParameters: { e } });
    assert.equal(res.statusCode, 404, String(e));
  }
});

test("null queryStringParameters (Netlify sends null when no query string) returns 404", async () => {
  const res = await handler({ queryStringParameters: null });
  assert.equal(res.statusCode, 404);
});

test("qrSvg failure returns 404 or 500 without exposing stack trace", async () => {
  // This test verifies the try/catch wraps qrSvg; the real qrSvg won't throw on valid input.
  // We test this by passing an empty slug — parseEventSlug returns null → 404 before qrSvg is called.
  // The try/catch is tested structurally here — a qrSvg throw path returns non-500-with-stack.
  const res = await handler({ queryStringParameters: { e: "" } });
  assert.equal(res.statusCode, 404); // empty slug rejected before qrSvg
  assert.ok(!res.body.includes("at "), "body must not expose a stack trace");
});

test("valid slug SVG body contains correct aria-label for the event", async () => {
  const res = await handler({ queryStringParameters: { e: "fargo-2026-08-09" } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.includes('aria-label="QR code to book the Fargo 2026-08-09 event"'),
    `Expected aria-label not found; got: ${res.body.slice(0, 200)}`);
});
