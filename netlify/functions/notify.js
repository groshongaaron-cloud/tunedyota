// netlify/functions/notify.js
//
// Public Slack relay. Cloud routines (and any internal caller) POST {text} here
// instead of embedding the raw Slack webhook in their prompt — the webhook lives
// only in the SLACK_WEBHOOK_URL env var, so rotating Slack never touches a routine
// prompt again (and never re-leaks the webhook through RemoteTrigger's prompt echo).
//
// Gated by NOTIFY_TOKEN: callers must present it via header x-ty-notify (or in the
// JSON body as `token`) so the endpoint isn't an open Slack-spam relay. The token is
// a low-value, self-minted relay key — worst case on leak is channel spam; rotate
// the one env var. The Slack webhook itself never leaves the server.
const { notifyOwner } = require("./lib/alert.js");

async function handler(event, _ctx, deps = {}) {
  const { env = process.env, notify = notifyOwner, fetchImpl = fetch, log = console } = deps;

  if (event.httpMethod && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  // Auth gate. When NOTIFY_TOKEN is set (it always is in prod), require a match.
  const h = event.headers || {};
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  if (env.NOTIFY_TOKEN) {
    const got = h["x-ty-notify"] || h["X-Ty-Notify"] || h["X-TY-NOTIFY"] || body.token || "";
    if (got !== env.NOTIFY_TOKEN) return { statusCode: 401, body: "unauthorized" };
  }

  const text = (body.text || "").toString().trim();
  if (!text) return { statusCode: 400, body: "missing text" };

  const r = await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text, log });
  if (r.skipped) return { statusCode: 503, body: "slack not configured" };
  return { statusCode: r.ok ? 200 : 502, body: r.ok ? "ok" : "slack error" };
}

module.exports = { handler };
