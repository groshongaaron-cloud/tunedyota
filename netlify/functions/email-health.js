// Daily canary: prove the Resend send path still returns 200. On failure, alert
// the owner via Slack (independent of Resend). Scheduled in netlify.toml.
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";

async function checkEmailHealth(deps) {
  const { fetchImpl = fetch, env = process.env, send = sendEmail, notify = notifyOwner, log = console } = deps;
  const to = env.CANARY_TO || "info+canary@tunedyota.com";
  try {
    await send({ fetchImpl, apiKey: env.RESEND_API_KEY, from: FROM, to,
      subject: "[canary] email-health", text: "Tuned Yota email-path canary — a 200 means sending works." });
    return { ok: true };
  } catch (e) {
    try { await notify({ fetchImpl, webhookUrl: env.SLACK_WEBHOOK_URL, text: `⚠️ Tuned Yota email path DOWN: ${e.message}`, log }); }
    catch (e2) { if (log.error) log.error("canary notify", e2.message); }
    return { ok: false, error: e.message };
  }
}
async function handler() {
  const r = await checkEmailHealth({});
  return { statusCode: 200, body: JSON.stringify(r) };
}
module.exports = { handler, checkEmailHealth };
