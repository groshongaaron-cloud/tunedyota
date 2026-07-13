// netlify/functions/lib/webpush.js
// Browser web push (VAPID) to an installer's subscribed browsers. Reads the installer's
// subscriptions from the "Web Push Subs" Airtable table, sends each via the web-push
// library, and deletes any that return 404/410 (expired). Non-blocking: a failure is
// counted, never thrown. Parallel to the dormant FCM lib/push.js.
const webpush = require("web-push");
const { cfg, listRecords, deleteRecord } = require("./airtable.js");

const SUBS = (env) => env.AIRTABLE_WEBPUSH_TABLE || "Web Push Subs";
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function defaultListSubs(installerKey, env, fetchImpl) {
  const c = cfg(env);
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: SUBS(env),
    filterByFormula: `{Installer}="${installerKey}"`, fields: ["Subscription"] });
  return recs.map((r) => ({ id: r.id, sub: safeParse(r.fields.Subscription) })).filter((x) => x.sub);
}

async function sendWebPush(installerKey, msg, deps = {}) {
  const { env = process.env, fetchImpl = fetch, log = console,
          listSubs = (k) => defaultListSubs(k, env, fetchImpl),
          del = (id) => { const c = cfg(env); return deleteRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: SUBS(env), id }); },
          send } = deps;
  const pub = env.VAPID_PUBLIC_KEY, priv = env.VAPID_PRIVATE_KEY, subj = env.VAPID_SUBJECT || "mailto:info@tunedyota.com";
  if (!pub || !priv) return { sent: 0, failed: 0 };
  const rows = await listSubs(installerKey);
  if (!rows.length) return { sent: 0, failed: 0 };
  const sender = send || ((sub, payload) => { webpush.setVapidDetails(subj, pub, priv); return webpush.sendNotification(sub, payload); });
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || "/installer.html" });
  let sent = 0, failed = 0;
  for (const row of rows) {
    try { await sender(row.sub, payload); sent++; }
    catch (e) {
      failed++;
      const code = e && e.statusCode;
      if (code === 404 || code === 410) { try { await del(row.id); } catch (e2) { if (log.error) log.error("webpush del", e2.message); } }
      else if (log.error) log.error("webpush send", (e && e.message) || code);
    }
  }
  return { sent, failed };
}
module.exports = { sendWebPush };
