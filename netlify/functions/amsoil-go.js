// netlify/functions/amsoil-go.js
// Per-customer AMSOIL click tracker + dealer-referral redirect. The certificate QR
// and the follow-up email link here as /.netlify/functions/amsoil-go?c=<bookingId>&to=pc|shop.
// We log the click to the "AMSOIL Clicks" Airtable table (best-effort — never blocks)
// then 302 to amsoil.com with the dealer ?zo= so AMSOIL's 30-day referral cookie still
// sets on landing. No PII in the URL (only the internal booking record id).
const { cfg, createRecord } = require("./lib/airtable.js");

const ZO = "30713116";
// Destinations are centralized here — the cert/email never hard-code amsoil URLs, so a
// URL change (e.g. the PC registration path) is a one-line fix, no re-issued certs.
const DEST = {
  pc: `https://www.amsoil.com/p/preferred-customer-registration-preg/?zo=${ZO}`,
  shop: `https://www.amsoil.com/shop/?zo=${ZO}`,
};
const CLICKS = (env) => env.AIRTABLE_CLICKS_TABLE || "AMSOIL Clicks";

async function logClick(booking, to, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  try {
    await create({ token: c.token, baseId: c.baseId, table: CLICKS(env),
      fields: { Booking: String(booking || ""), Destination: to, "Clicked At": now.toISOString() } });
    return true;
  } catch (e) { return false; } // best-effort: a logging failure must never break the redirect
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const to = q.to === "pc" ? "pc" : "shop";
  const booking = String(q.c || "").trim();
  await logClick(booking, to);
  return { statusCode: 302, headers: { Location: DEST[to], "Cache-Control": "no-store" }, body: "" };
}
module.exports = { handler, logClick, DEST };
