// netlify/functions/lib/client-auth.js
// Client (customer) identity: stateless HMAC tokens signed with CLIENT_SESSION_SECRET.
// Mirrors installer-auth.js in spirit — fail-closed, constant-time compares — but for
// clients the "account" is just a verified email. Two token types share one format
// (base64url(JSON payload).base64url(hmac)): t:"session" (365d, sliding renewal) and
// t:"login" (short-lived magic-link). Revocation = rotate the secret.
const crypto = require("crypto");
const { secretEquals } = require("./secrets.js");

const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const RENEW_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

function hmac(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}
function makeToken(obj, env) {
  const secret = env && env.CLIENT_SESSION_SECRET;
  if (!secret) return null;
  const p = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return p + "." + hmac(p, secret);
}
function readToken(token, env) {
  const secret = env && env.CLIENT_SESSION_SECRET;
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  if (!secretEquals(parts[1], hmac(parts[0], secret))) return null;
  try { return JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { return null; }
}

function signSession(email, now, env) {
  return makeToken({ e: String(email || "").trim().toLowerCase(), t: "session", x: now + SESSION_TTL_MS, i: now }, env);
}
function verifySession(token, now, env) {
  const p = readToken(token, env);
  if (!p || p.t !== "session" || !p.e || !(p.x > now)) return null;
  return { email: p.e, issuedAt: p.i || 0 };
}
function signLogin(email, ttlMs, now, env) {
  return makeToken({ e: String(email || "").trim().toLowerCase(), t: "login", x: now + ttlMs }, env);
}
function verifyLogin(token, now, env) {
  const p = readToken(token, env);
  if (!p || p.t !== "login" || !p.e || !(p.x > now)) return null;
  return { email: p.e };
}
// Header auth for client endpoints. Returns {email, renewedToken?} or null.
// renewedToken implements the sliding session: any visit after 30 days re-issues.
function resolveClient(headers, now, env) {
  const got = ((headers || {})["x-client-token"] || (headers || {})["X-Client-Token"] || "").toString();
  const v = verifySession(got, now, env);
  if (!v) return null;
  const out = { email: v.email };
  if (now - v.issuedAt > RENEW_AFTER_MS) out.renewedToken = signSession(v.email, now, env);
  return out;
}

module.exports = { signSession, verifySession, signLogin, verifyLogin, resolveClient, SESSION_TTL_MS, RENEW_AFTER_MS };
