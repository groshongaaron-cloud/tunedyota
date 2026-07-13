const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAmsoilEmail } = require("../netlify/functions/lib/amsoil-email.js");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

test("builds a tailored AMSOIL follow-up email with fluids + opt-out", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { subject, html, text } = buildAmsoilEmail({
    name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024", fluids });
  assert.match(subject, /AMSOIL|running strong/i);
  assert.ok(html.includes("Signature Series 0W-20"), "product listed");
  assert.ok(html.includes("ASMQT"), "stock number listed");
  assert.ok(html.includes(fluids.garageUrl), "CTA links to the pre-filtered garage");
  assert.match(html, /amsoil-logo\.png/);
  assert.match(html, /UNSUBSCRIBE/);
  assert.match(html, /Marcus/);
  assert.match(text, /UNSUBSCRIBE/);
});

test("degrades safely with no fluids", () => {
  const { html } = buildAmsoilEmail({ name: "A", vehicle: "2020 Ford F-150", fluids: null });
  assert.ok(!/<table/.test(html), "no fluids table when unresolved");
  assert.match(html, /amsoil-garage/);
});
