// netlify/functions/call-log.js
// Calls tab for the installer console: recent phone activity on the business
// line, one row per real call. Twilio logs a forwarded or bridged call as
// parent + child legs (the child carries parent_call_sid), so each child's
// counterparty number is folded into its parent row as bridgedTo instead of
// rendering as a second row. Auth: installer token (same as the other console
// functions). Read-only — never mutates Twilio state.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { withCors } = require("./lib/cors.js");

async function handler(event, ctx = {}) {
  const env = ctx.env || process.env;
  const fetchImpl = ctx.fetchImpl || fetch;
  if ((event.httpMethod || "GET") !== "GET") return { statusCode: 405, body: "method not allowed" };
  const key = resolveInstaller(event.headers || {}, env);
  if (!key) return { statusCode: 401, body: "unauthorized" };

  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { statusCode: 502, body: "telephony not configured" };

  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=100`, {
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64") },
  });
  if (!res.ok) {
    console.error("call-log list failed", res.status);
    return { statusCode: 502, body: "call list failed" };
  }
  const data = await res.json();
  const all = Array.isArray(data.calls) ? data.calls : [];

  const childByParent = {};
  for (const c of all) if (c.parent_call_sid) childByParent[c.parent_call_sid] = c;

  const rows = all.filter((c) => !c.parent_call_sid).map((c) => {
    const child = childByParent[c.sid];
    return {
      sid: c.sid,
      direction: c.direction === "inbound" ? "inbound" : "outbound",
      from: c.from || "",
      to: c.to || "",
      bridgedTo: child ? (child.to || "") : "",
      status: c.status || "",
      startTime: c.start_time || c.date_created || "",
      duration: Number(c.duration || 0),
    };
  });

  return { statusCode: 200, headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ calls: rows }) };
}

module.exports = { handler: withCors(handler) };
