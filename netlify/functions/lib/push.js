// netlify/functions/lib/push.js
// Send a push notification to all of an installer's registered devices via
// Firebase Cloud Messaging (FCM HTTP v1 — covers Android + iOS/APNs). Auth reuses
// google-auth-library (already a repo dependency) with the Firebase service-account
// key in env FCM_SERVICE_ACCOUNT. Non-blocking: a failed send is counted, never thrown.
const { GoogleAuth } = require("google-auth-library");
const { cfg, listRecords } = require("./airtable.js");

const DEVICES = (env) => env.AIRTABLE_DEVICES_TABLE || "Push Devices";

// Default token lookup: the installer's device tokens from the Push Devices table.
async function defaultListTokens(installerKey, env, fetchImpl) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: DEVICES(env),
    filterByFormula: `{Installer}="${installerKey}"`, fields: ["Token"] });
  return recs.map((r) => r.fields.Token).filter(Boolean);
}

async function sendPush(installerKey, msg, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console,
          listTokens = (k) => defaultListTokens(k, env, fetchImpl), auth } = deps;
  const tokens = await listTokens(installerKey);
  if (!tokens.length) return { sent: 0, failed: 0 };

  const creds = JSON.parse(env.FCM_SERVICE_ACCOUNT || "{}");
  const projectId = creds.project_id;
  const client = auth || await new GoogleAuth({ credentials: creds,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"] }).getClient();
  const at = await client.getAccessToken();
  const accessToken = (at && at.token) ? at.token : at;

  let sent = 0, failed = 0;
  for (const token of tokens) {
    try {
      const r = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, notification: { title: msg.title, body: msg.body }, data: msg.data || {} } }),
      });
      if (r.ok) sent++; else { failed++; if (log.error) log.error("fcm send", r.status); }
    } catch (e) { failed++; if (log.error) log.error("fcm send", e.message); }
  }
  return { sent, failed };
}

module.exports = { sendPush };
