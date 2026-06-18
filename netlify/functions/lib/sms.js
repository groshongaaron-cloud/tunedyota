// netlify/functions/lib/sms.js
function normalizePhone(raw) {
  const d = String(raw == null ? "" : raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === "1") return `+${d}`;
  return `+${d}`;
}
function smsConfig(env = process.env) {
  return { sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, from: env.TWILIO_FROM };
}
async function sendSms({ fetchImpl = fetch, to, body, env = process.env, log = console }) {
  const { sid, token, from } = smsConfig(env);
  if (!sid || !token || !from) { if (log.warn) log.warn("SMS disabled (Twilio env unset)"); return { skipped: true }; }
  if (!to) return { skipped: true, reason: "no-to" };
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetchImpl(url, { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() });
  if (!res.ok) throw new Error(`twilio ${res.status}`);
  return { sent: true };
}
module.exports = { normalizePhone, smsConfig, sendSms };
