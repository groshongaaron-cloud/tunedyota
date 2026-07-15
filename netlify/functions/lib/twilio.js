// netlify/functions/lib/twilio.js
// Pure helpers for the Twilio SMS+Voice lead adapter. No I/O except the injected
// `post` in ingestLead. See docs/superpowers/specs/2026-07-15-twilio-sms-voice-lead-adapter-design.md
const crypto = require("crypto");

// Twilio request signature: HMAC-SHA1 of (URL + each POST param, sorted by key,
// concatenated as key+value), base64, compared constant-time to X-Twilio-Signature.
function validateTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const data = Object.keys(params || {}).sort().reduce((acc, k) => acc + k + params[k], String(url || ""));
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { validateTwilioSignature };
