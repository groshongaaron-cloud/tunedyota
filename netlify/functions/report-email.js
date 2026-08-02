// netlify/functions/report-email.js
//
// Internal report relay: cloud routines POST {subject, text} and the report lands
// in info@'s INBOX as a normal internal email from events@send.tunedyota.events —
// the same shape as every other automated report, so inbox-sweep skips it by
// sender. Replaces the old "save a Gmail draft addressed to yourself" delivery
// (the Gmail connector has no send capability), which left phantom drafts mixed
// in with real reply drafts awaiting review.
//
// Gated by the same NOTIFY_TOKEN as notify.js: the recipient is hardcoded to
// info@ (REPORT_TO), so a leaked token means self-inbox spam at worst.
const { sendEmail } = require("./lib/resend.js");
const { secretEquals } = require("./lib/secrets.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";

async function handler(event, _ctx, deps = {}) {
  const { env = process.env, send = sendEmail, fetchImpl = fetch, log = console } = deps;

  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }

  if (env.NOTIFY_TOKEN) {
    const h = event.headers || {};
    const got = h["x-ty-notify"] || h["X-Ty-Notify"] || h["X-TY-NOTIFY"] || body.token || "";
    if (!secretEquals(got, env.NOTIFY_TOKEN)) return { statusCode: 401, body: "unauthorized" };
  }

  const subject = (body.subject || "").toString().trim();
  const text = (body.text || "").toString().trim();
  if (!subject || !text) return { statusCode: 400, body: "missing subject or text" };
  if (!env.RESEND_API_KEY) return { statusCode: 503, body: "email not configured" };

  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM,
      to: env.REPORT_TO || "info@tunedyota.com", subject, text });
  } catch (e) {
    if (log.error) log.error("report-email send failed:", e.message || e);
    return { statusCode: 502, body: "send failed" };
  }
  return { statusCode: 200, body: "ok" };
}

module.exports = { handler };
