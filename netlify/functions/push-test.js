// netlify/functions/push-test.js
// Installer-token authed: send a test web push to the caller so they can confirm
// notifications are working on their device.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { sendWebPush } = require("./lib/webpush.js");

async function processTest(deps) {
  const { key, push = sendWebPush } = deps;
  const r = await push(key, { title: "Tuned Yota", body: "✅ Notifications are on.", url: "/installer.html" });
  return { ok: true, sent: (r && r.sent) || 0 };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const out = await processTest({ key });
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processTest };
