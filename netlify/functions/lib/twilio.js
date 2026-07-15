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

function decodeBody(event) {
  const raw = event && event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf-8")
    : (event && event.body) || "";
  const params = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;
  return params;
}

function webhookUrl(event, env, fnName) {
  const base = env && env.TWILIO_PUBLIC_BASE;
  if (base) return `${String(base).replace(/\/$/, "")}/.netlify/functions/${fnName}`;
  return (event && event.rawUrl) || "";
}

function formatPhone(e164) {
  const d = String(e164 == null ? "" : e164).replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(e164 == null ? "" : e164);
}

function displayName(prefix, e164) { return `${prefix} ${formatPhone(e164)}`.trim(); }

function parseForwardNumbers(env) {
  return String((env && env.TWILIO_FORWARD_NUMBERS) || "").split(",").map((s) => s.trim()).filter(Boolean);
}

module.exports = { validateTwilioSignature, decodeBody, webhookUrl, formatPhone, displayName, parseForwardNumbers };
