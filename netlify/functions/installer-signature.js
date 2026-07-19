// netlify/functions/installer-signature.js
// Installer-token authed: return a stored customer sign-off signature (PNG data URL)
// for one booking, scoped like the roster — the owning installer, or any booking for
// an admin. View-only proof of acceptance; the image is never in the roster payload.
const { cfg, getRecord } = require("./lib/airtable.js");
const { resolveInstaller, isAdmin } = require("./lib/installer-auth.js");
const { normalizeInstallerKey } = require("./lib/routing.js");

async function getSignature(id, deps) {
  const { env = process.env, fetchImpl = fetch, key, admin = false, log = console,
          get = (a) => getRecord({ fetchImpl, ...a }) } = deps;
  if (!id) return { status: "error", error: "missing-id" };
  const c = cfg(env);
  let rec;
  try { rec = await get({ token: c.token, baseId: c.baseId, table: c.bookings, id }); }
  catch (e) { if (log.error) log.error("signature get", e.message); return { status: "error", error: "store-unavailable" }; }
  const f = (rec && rec.fields) || {};
  const owner = normalizeInstallerKey(f.Installer);
  if (!admin && owner !== key) return { status: "error", error: "not-yours" };
  const sig = String(f["Customer Signature"] || "").trim();
  if (!sig) return { status: "none" };
  return { status: "ok", signature: sig };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const id = (event.queryStringParameters && event.queryStringParameters.id) || "";
  const out = await getSignature(id, { key, admin: isAdmin(key, process.env) });
  const code = (out.status === "ok" || out.status === "none") ? 200
    : out.error === "not-yours" ? 403
    : out.error === "missing-id" ? 400 : 502;
  return { statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, getSignature };
