// netlify/functions/meta-data-deletion.js
// Meta user-data-deletion callback (App Dashboard -> Settings -> Basic -> Data
// Deletion). When a user asks Facebook to delete their data for our app, Meta
// POSTs a form-encoded `signed_request`; we verify it against META_APP_SECRET,
// delete every Chat Sessions row keyed by that sender (fb:<id>, fb:<id>:<ts>,
// ig:<id>, ig:<id>:<ts>), and answer { url, confirmation_code } as the spec
// requires. GET on the same URL is the human-facing status page Meta links the
// user to. A store failure answers 500 so Meta retries — unlike the events
// webhook there is no always-200 rule here, and claiming success on a failed
// delete would be worse than a retry.
// Caveat: the callback's user_id is Meta's app-scoped id, which for Messenger
// normally equals the PSID we key sessions by; if they ever diverge the lookup
// simply matches nothing and we still confirm (we hold no data under that id).
const crypto = require("crypto");
const { cfg, escapeFormula, listRecords, deleteRecord } = require("./lib/airtable.js");
const { TABLE } = require("./lib/chat-store.js");
const { notifyOwner } = require("./lib/alert.js");

function b64urlDecode(s) {
  return Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Meta signed_request: "<b64url sig>.<b64url payload>", sig = HMAC-SHA256 of the
// *encoded* payload string with the app secret. Returns the payload or null.
function parseSignedRequest(signedRequest, appSecret) {
  if (!appSecret || typeof signedRequest !== "string" || signedRequest.indexOf(".") < 0) return null;
  const [sigB64, payloadB64] = signedRequest.split(".", 2);
  try {
    const expected = crypto.createHmac("sha256", appSecret).update(payloadB64).digest();
    const got = b64urlDecode(sigB64);
    if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
    const payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    return payload && payload.user_id ? payload : null;
  } catch (e) { return null; }
}

// Deterministic per-user code so retries of the same request confirm identically.
function confirmationCode(userId, appSecret) {
  return crypto.createHmac("sha256", String(appSecret)).update("meta-deletion:" + String(userId)).digest("hex").slice(0, 16);
}

async function deleteUserSessions(userId, { env, fetchImpl }) {
  const c = cfg(env);
  const clauses = [];
  for (const p of ["fb:", "ig:"]) {
    const id = escapeFormula(p + userId);
    clauses.push(`{Session ID}="${id}"`, `FIND("${id}:", {Session ID})=1`);
  }
  const recs = await listRecords({
    fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: `OR(${clauses.join(",")})`, fields: ["Session ID"],
  });
  for (const r of recs) {
    await deleteRecord({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env), id: r.id });
  }
  return recs.length;
}

async function handler(event, deps = {}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const notify = deps.notify || ((text) => notifyOwner({ webhookUrl: env.SLACK_WEBHOOK_URL, text }));

  if (event.httpMethod === "GET") {
    const code = (event.queryStringParameters || {}).code || "";
    const safe = String(code).replace(/[^a-f0-9]/gi, "").slice(0, 32);
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Tuned Yota — Data Deletion</title></head><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem"><h1>Data deletion complete</h1><p>Your Facebook/Instagram conversation data with Tuned Yota has been deleted.${safe ? ` Confirmation code: <code>${safe}</code>.` : ""}</p><p>Questions? Email <a href="mailto:info@tunedyota.com">info@tunedyota.com</a>. See our <a href="https://tunedyota.com/privacy">Privacy Policy</a>.</p></body></html>`,
    };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method not allowed" };

  const params = new URLSearchParams(event.body || "");
  const payload = parseSignedRequest(params.get("signed_request") || "", env.META_APP_SECRET);
  if (!payload) return { statusCode: 400, body: "bad signed_request" };

  const userId = String(payload.user_id);
  const code = confirmationCode(userId, env.META_APP_SECRET);
  try {
    const n = await deleteUserSessions(userId, { env, fetchImpl });
    console.log(`meta-data-deletion: user ${userId} -> ${n} session record(s) deleted`);
  } catch (e) {
    console.error("meta-data-deletion", e.message);
    try { await notify(`⚠ Meta data-deletion request for user ${userId} FAILED (${e.message}) — Meta will retry.`); } catch (e2) {}
    return { statusCode: 500, body: "store failure" };
  }

  const base = (env.URL || "https://tunedyota.com").replace(/\/$/, "");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: `${base}/.netlify/functions/meta-data-deletion?code=${code}`, confirmation_code: code }),
  };
}

module.exports = { handler, parseSignedRequest, confirmationCode };
