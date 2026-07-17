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
