// netlify/functions/amsoil-go.js
// AMSOIL click tracker + dealer-referral redirect. Cert QR, follow-up email, AND the
// public vehicle/state/guide page CTAs link here as
//   /.netlify/functions/amsoil-go?to=pc|shop&s=<source>&c=<bookingId>&p=<productPath>
// We log the click to the "AMSOIL Clicks" Airtable table (best-effort — never blocks)
// then 302 to amsoil.com with the dealer ?zo= so AMSOIL's 30-day referral cookie sets.
// No PII in the URL (only the internal booking record id, when present).
const { cfg, createRecord, createTolerant } = require("./lib/airtable.js");

const ZO = "30713116";
const BASE = "https://www.amsoil.com";
// Destinations are centralized here so a URL change is a one-line fix, no re-issued certs.
const DEST = {
  pc: `${BASE}/p/preferred-customer-registration-preg/?zo=${ZO}`,
  shop: `${BASE}/shop/?zo=${ZO}`,
};
const CLICKS = (env) => env.AIRTABLE_CLICKS_TABLE || "AMSOIL Clicks";

// A specific product link (?p=/shop/...) lands on that product while keeping ?zo=.
// Only a same-site RELATIVE path is honored (must start with a single "/", no scheme,
// no "//"), so this can never be coerced into an open redirect to another domain.
function destUrl(to, productPath) {
  const p = String(productPath == null ? "" : productPath).trim();
  if (p && p[0] === "/" && !p.includes("//") && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/?#-]*$/.test(p)) {
    const sep = p.includes("?") ? "&" : "?";
    return `${BASE}${p}${sep}zo=${ZO}`;
  }
  return DEST[to] || DEST.shop;
}

// Normalize a source tag to a short, safe token. Defaults: a booking-scoped click
// (cert/follow-up) is "cert" unless the caller says otherwise; everything else "other".
function normSource(s, booking) {
  const clean = String(s == null ? "" : s).trim().slice(0, 60).replace(/[^A-Za-z0-9:._/-]/g, "");
  if (clean) return clean;
  return booking ? "cert" : "other";
}

async function logClick(booking, to, source, deps = {}) {
  const { env = process.env, fetchImpl = fetch, now = new Date(),
          create = (a) => createRecord({ fetchImpl, ...a }) } = deps;
  const c = cfg(env);
  try {
    // Tolerant: if the "Source" column doesn't exist yet, drop it and still log the
    // click — instrumentation must never silently stop logging on a missing column.
    await createTolerant(create, { token: c.token, baseId: c.baseId, table: CLICKS(env),
      fields: { Booking: String(booking || ""), Destination: to, Source: source || "", "Clicked At": now.toISOString() } },
      ["Source"]);
    return true;
  } catch (e) { return false; } // best-effort: a logging failure must never break the redirect
}

async function handler(event) {
  const q = (event && event.queryStringParameters) || {};
  const to = q.to === "pc" ? "pc" : "shop";
  const booking = String(q.c || "").trim();
  await logClick(booking, to, normSource(q.s, booking));
  return { statusCode: 302, headers: { Location: destUrl(to, q.p), "Cache-Control": "no-store" }, body: "" };
}
module.exports = { handler, logClick, normSource, destUrl, DEST };
