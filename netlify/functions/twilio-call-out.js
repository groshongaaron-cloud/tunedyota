// netlify/functions/twilio-call-out.js
// Click-to-call from the installer console. Rings the INSTALLER's cell first
// (presenting the business number), where twilio-call-bridge gates on press-1
// before dialing the client — so the client only ever sees 612-406-7117 and an
// installer voicemail can never trigger a stray outbound call. Auth: installer
// token (same as lead-update). Logs the attempt onto the client's lead.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { smsNumberFor } = require("./lib/routing.js");
const { normalizePhone } = require("./lib/leads.js");
const { webhookUrl, formatPhone, ingestLead } = require("./lib/twilio.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  const ingest = ctx.ingest || ((b) => ingestLead(b, { env }));
  if ((event.httpMethod || "POST") !== "POST") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const digits = normalizePhone(body.to);
  if (digits.length !== 10) return { statusCode: 400, body: "bad phone" };
  const client = `+1${digits}`;

  const installerCell = smsNumberFor(key, env);
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN, from = env.TWILIO_FROM_NUMBER;
  if (!installerCell || !sid || !token || !from) return { statusCode: 502, body: "telephony not configured" };

  const bridge = `${webhookUrl(event, env, "twilio-call-bridge")}?to=${encodeURIComponent(client)}`;
  const form = new URLSearchParams({ To: installerCell, From: from, Url: bridge, Timeout: "20" });
  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    console.error("twilio-call-out create failed", res.status);
    return { statusCode: 502, body: "call create failed" };
  }
  const call = await res.json();

  try {
    await ingest({ name: String(body.name || "").trim() || `Caller ${formatPhone(client)}`,
      phone: client, channel: "phone", source: "twilio:call",
      message: `outbound click-to-call placed by ${key}` });
  } catch (e) { console.error("twilio-call-out ingest failed", e && e.message); /* best-effort */ }

  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, callSid: call.sid }) };
}

module.exports = { handler };
