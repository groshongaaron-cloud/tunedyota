// netlify/functions/client-auth.js
// Client login: action "request" emails a 30-minute magic link (response is always
// "sent" for a well-formed email — no account enumeration; any email may sign in,
// a prospect just gets an empty portal). Action "exchange" verifies the link token,
// auto-creates/updates the Clients row (no signup form), and returns the 1-year
// session token + profile. Fail-closed when CLIENT_SESSION_SECRET is unset.
// ACCEPTED RISK: "request" is unthrottled, so it can be used to mail a victim
// sign-in links (inherent to magic-link endpoints); revisit with a rate limit
// if abuse appears in Resend logs.
const { cfg, escapeFormula, listRecords, createRecord, updateRecord } = require("./lib/airtable.js");
const { signSession, signLogin, verifyLogin } = require("./lib/client-auth.js");
const { sendEmail } = require("./lib/resend.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";
const LOGIN_TTL_MS = 30 * 60 * 1000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function parseVehicles(raw) {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

async function processClientAuth(body, deps = {}) {
  const {
    env = process.env, fetchImpl = fetch, now = Date.now(),
    send = (a) => sendEmail({ fetchImpl, ...a }),
    list = (a) => listRecords({ fetchImpl, ...a }),
    create = (a) => createRecord({ fetchImpl, ...a }),
    update = (a) => updateRecord({ fetchImpl, ...a }),
  } = deps;
  const c = cfg(env);
  const action = (body && body.action) || "";

  if (action === "request") {
    const email = String((body && body.email) || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return { status: "error", error: "bad-email" };
    const lt = signLogin(email, LOGIN_TTL_MS, now, env);
    if (!lt) return { status: "error", error: "not-configured" };
    const link = `https://tunedyota.com/account?lt=${lt}`;
    try {
      await send({ apiKey: env.RESEND_API_KEY, from: FROM, to: email, replyTo: OWNER,
        subject: "Your Tuned Yota sign-in link",
        text: `Sign in to your Tuned Yota account (certificates + AMSOIL garage): ${link}\n\nThis link works for 30 minutes. If you didn't request it, you can ignore this email.`,
        html: `<p>Tap to sign in to your <strong>Tuned Yota</strong> account — your certificates and AMSOIL garage:</p>` +
          `<p><a href="${link}" style="display:inline-block;background:#191c1e;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:14px 26px;border-radius:8px;">Sign in to Tuned Yota &#9658;</a></p>` +
          `<p style="font-size:13px;color:#8a8f94;">This link works for 30 minutes and signs you in on this device. If you didn't request it, ignore this email.</p>` });
      return { status: "sent" };
    } catch { return { status: "error", error: "send-failed" }; }
  }

  if (action === "exchange") {
    const v = verifyLogin(body && body.token, now, env);
    if (!v) return { status: "error", error: "bad-link" };
    const today = new Date(now).toISOString().slice(0, 10);
    let name = "", vehicles = [];
    try {
      const rows = await list({ token: c.token, baseId: c.baseId, table: c.clients,
        filterByFormula: `LOWER({Email})="${escapeFormula(v.email)}"` });
      if (rows.length) {
        name = String(rows[0].fields.Name || "");
        vehicles = parseVehicles(rows[0].fields.Vehicles);
        await update({ token: c.token, baseId: c.baseId, table: c.clients, id: rows[0].id,
          fields: { "Last Login": today } });
      } else {
        await create({ token: c.token, baseId: c.baseId, table: c.clients,
          fields: { Email: v.email, "Created At": today, "Last Login": today } });
      }
    } catch { /* best-effort profile — the session is still valid */ }
    return { status: "ok", token: signSession(v.email, now, env), email: v.email, name, vehicles };
  }

  return { status: "error", error: "bad-action" };
}

async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "method-not-allowed" };
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad-json" }; }
  const out = await processClientAuth(body);
  const code = out.status === "ok" || out.status === "sent" ? 200
    : out.error === "bad-link" ? 401 : out.error === "bad-email" || out.error === "bad-action" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler, processClientAuth };
