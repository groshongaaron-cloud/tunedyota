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
  const raw = (event && event.rawUrl) || "";
  if (!raw) return "";
  return raw.replace(/([^/]+)$/, fnName);
}

// Formats US 10-digit numbers only; non-US or short input is passed through as-is.
function formatPhone(e164) {
  const d = String(e164 == null ? "" : e164).replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : String(e164 == null ? "" : e164);
}

function displayName(prefix, e164) { return `${prefix} ${formatPhone(e164)}`.trim(); }

function parseForwardNumbers(env) {
  return String((env && env.TWILIO_FORWARD_NUMBERS) || "").split(",").map((s) => s.trim()).filter(Boolean);
}

const XML = '<?xml version="1.0" encoding="UTF-8"?>';

// Owner-authored no-answer greeting (spec). Edit here to change what callers hear.
const GREETING = "Hi this is Tuned Yota — I saw we missed your call, sorry about that! " +
  "I wanted to make sure I got back to you personally. Whether you're looking for the OTT tune, " +
  "a Magnuson Supercharger, a build for your vehicle, or a maintenance issue needing a fix, or just " +
  "have a few questions, I'd love to help you get it dialed in. You can also shoot a quick text to the " +
  "same line, 612-406-7117, and a team member can begin a live chat with you. So we can call you right " +
  "back, please leave your name and a short message after the tone. Thanks, and talk soon!";

function escapeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function smsReplyTwiml(text) {
  return `${XML}<Response><Message>${escapeXml(text)}</Message></Response>`;
}

function dialTwiml(numbers, opts = {}) {
  const { timeout = 20, action = "", callerId = "" } = opts;
  const attrs = [
    `timeout="${Number.isFinite(+timeout) ? timeout : 20}"`,
    `answerOnBridge="true"`,
    action ? `action="${escapeXml(action)}"` : "",
    callerId ? `callerId="${escapeXml(callerId)}"` : "",
  ].filter(Boolean).join(" ");
  const nums = (numbers || []).map((n) => `<Number>${escapeXml(n)}</Number>`).join("");
  return `${XML}<Response><Dial ${attrs}>${nums}</Dial></Response>`;
}

function voicemailTwiml(opts = {}) {
  const { greeting = GREETING, voice = "Polly.Matthew-Neural", transcribeCallback = "", maxLength = 120 } = opts;
  const cb = transcribeCallback ? ` transcribeCallback="${escapeXml(transcribeCallback)}"` : "";
  const rec = `<Record transcribe="true"${cb} maxLength="${Number.isFinite(+maxLength) ? maxLength : 120}" playBeep="true"/>`;
  return `${XML}<Response><Say voice="${escapeXml(voice)}">${escapeXml(greeting)}</Say>${rec}</Response>`;
}

function hangupTwiml() { return `${XML}<Response><Hangup/></Response>`; }

// Standalone compliance keywords (Twilio US defaults). Twilio's Advanced
// Opt-Out sends the reply; our webhook must stay silent — no lead, no auto-reply.
const SMS_KEYWORDS = {
  optout: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"],
  help: ["HELP", "INFO"],
  optin: ["START", "YES", "UNSTOP"],
};
// "Stop." counts; "Please stop by Saturday" does not — keyword must be the whole message.
function smsKeywordType(body) {
  const word = String(body || "").trim().replace(/[.!?,]+$/, "").toUpperCase();
  for (const [type, words] of Object.entries(SMS_KEYWORDS)) if (words.includes(word)) return type;
  return null;
}

function parseInboundSms(params) {
  const from = params.From || "";
  const body = String(params.Body || "").trim();
  return { name: displayName("Text", from), phone: from, channel: "sms", source: "twilio:sms",
    goals: body, message: body || "inbound text" };
}

function parseInboundCall(params, note) {
  const from = params.From || "";
  return { name: displayName("Caller", from), phone: from, channel: "phone", source: "twilio:call",
    message: note || "inbound call" };
}

function parseTranscription(params) {
  const from = params.From || "";
  const text = String(params.TranscriptionText || "").trim();
  const rec = params.RecordingUrl || "";
  const base = text ? `voicemail: ${text}` : "voicemail (no transcription)";
  return { name: displayName("Caller", from), phone: from, channel: "phone", source: "twilio:call",
    goals: text, message: rec ? `${base} — ${rec}` : base };
}

// POST a normalized lead to the Core ingest endpoint (mirrors gmail-lead-poll.js).
async function ingestLead(body, deps = {}) {
  const env = deps.env || process.env;
  const post = deps.post || fetch;
  const base = env.LEAD_INGEST_URL
    || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");
  try {
    const res = await post(base, { method: "POST",
      headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" },
      body: JSON.stringify(body) });
    return { ok: !!(res && res.ok) };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Outbound SMS via the Twilio REST API. Best-effort: returns {ok:false} on any
// missing config or network error — callers must never break on notify failure.
// A2P: when TWILIO_MESSAGING_SERVICE_SID is set, sends go through the Messaging
// Service (campaign-linked sender pool) instead of a raw From number.
async function sendSms({ to, body }, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console } = deps;
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN,
    from = env.TWILIO_FROM_NUMBER, msid = env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !(msid || from) || !to) return { ok: false, skipped: true };
  const params = { To: to, Body: String(body || "").slice(0, 1500) };
  if (msid) params.MessagingServiceSid = msid; else params.From = from;
  const base = env.TWILIO_PUBLIC_BASE || env.URL;
  if (base) params.StatusCallback = `${String(base).replace(/\/$/, "")}/.netlify/functions/twilio-status`;
  try {
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    if (!res.ok) { if (log.error) log.error("sendSms", res.status); return { ok: false }; }
    return { ok: true };
  } catch (e) { if (log.error) log.error("sendSms", e.message); return { ok: false }; }
}

module.exports = { validateTwilioSignature, decodeBody, webhookUrl, formatPhone, displayName, parseForwardNumbers,
  escapeXml, smsReplyTwiml, dialTwiml, voicemailTwiml, hangupTwiml, GREETING,
  parseInboundSms, parseInboundCall, parseTranscription, ingestLead, sendSms, smsKeywordType };
