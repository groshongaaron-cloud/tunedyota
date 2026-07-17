// netlify/functions/lib/secrets.js
// Constant-time secret comparison (same pattern as the Twilio HMAC check in
// lib/twilio.js). Fails closed: empty/missing values never match — an unset
// secret is a deployment error, not a wildcard.
const crypto = require("crypto");

function secretEquals(got, expected) {
  const a = Buffer.from(String(got == null ? "" : got));
  const b = Buffer.from(String(expected == null ? "" : expected));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { secretEquals };
