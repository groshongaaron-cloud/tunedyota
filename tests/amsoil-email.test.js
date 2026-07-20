const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildAmsoilEmail } = require("../netlify/functions/lib/amsoil-email.js");
const { resolveFluids } = require("../netlify/functions/lib/amsoil-fluids.js");

test("builds a tailored AMSOIL follow-up email with fluids + opt-out", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { subject, html, text } = buildAmsoilEmail({
    name: "Marcus Bell", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024", fluids, bookingId: "recABC" });
  assert.match(subject, /AMSOIL|running strong/i);
  assert.ok(html.includes("Signature Series 0W-20"), "product listed");
  assert.ok(html.includes("ASMQT"), "stock number listed");
  // Links now route through the tracker (source=email, per-customer c=<id>); the ZO
  // referral is applied by the redirect target, not printed in the email.
  assert.match(html, /amsoil-go\?to=shop&s=email&c=recABC/, "shop CTA is tracked per-customer");
  assert.match(html, /amsoil-go\?to=pc&s=email&c=recABC/, "PC CTA is tracked per-customer");
  assert.ok(!/Enroll free/i.test(html), "dropped the inaccurate 'Enroll free' claim");
  assert.match(text, /amsoil-go\?to=shop&s=email&c=recABC/, "text CTA is tracked too");
  assert.match(html, /amsoil-logo\.png/);
  assert.match(html, /UNSUBSCRIBE/);
  assert.match(html, /Marcus/);
  assert.match(text, /UNSUBSCRIBE/);
});
test("tracked links omit the customer id when no booking id is supplied", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { html } = buildAmsoilEmail({ name: "A", fluids });
  assert.match(html, /amsoil-go\?to=shop&s=email"/, "shop link still tracked, no c= when id absent");
  assert.ok(!/&c=/.test(html), "no dangling customer id");
});

test("degrades safely with no fluids", () => {
  const { html } = buildAmsoilEmail({ name: "A", vehicle: "2020 Ford F-150", fluids: null });
  assert.ok(!/<table/.test(html), "no fluids table when unresolved");
  assert.match(html, /amsoil-garage/);
});

test("built html contains account?lt= when accountUrl carries a token", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { html } = buildAmsoilEmail({
    name: "Marcus", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024",
    fluids, bookingId: "recABC",
    accountUrl: "https://tunedyota.com/account?lt=sometoken123",
  });
  assert.match(html, /account\?lt=sometoken123/);
});

test("plain accountUrl renders a plain /account link", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { html } = buildAmsoilEmail({
    name: "Marcus", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024",
    fluids, bookingId: "recABC",
    accountUrl: "https://tunedyota.com/account",
  });
  assert.match(html, /tunedyota\.com\/account/);
  assert.ok(!/account\?lt=/.test(html), "plain url must not carry a token");
});

test("accountUrl falls back to plain /account when not provided", () => {
  const fluids = resolveFluids("2024 Toyota Tacoma 2.4L-T I4", "2024");
  const { html } = buildAmsoilEmail({
    name: "Marcus", vehicle: "2024 Toyota Tacoma 2.4L-T I4", modelYear: "2024",
    fluids, bookingId: "recABC",
  });
  assert.match(html, /tunedyota\.com\/account/);
  assert.ok(!/account\?lt=/.test(html), "no token in fallback");
});

test("review ask renders only when a reviewUrl is provided (GBP_REVIEW_URL gate)", () => {
  const { buildAmsoilEmail } = require("../netlify/functions/lib/amsoil-email.js");
  const withUrl = buildAmsoilEmail({ name: "Ana", reviewUrl: "https://g.page/r/tunedyota-review" });
  assert.match(withUrl.html, /Leave a Google review/);
  assert.match(withUrl.html, /g\.page\/r\/tunedyota-review/);
  assert.match(withUrl.text, /Google review helps other Toyota/);
  const without = buildAmsoilEmail({ name: "Ana" });
  assert.doesNotMatch(without.html, /Google review/);
  assert.doesNotMatch(without.text, /Google review/);
});
