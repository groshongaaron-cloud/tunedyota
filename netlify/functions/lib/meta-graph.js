// netlify/functions/lib/meta-graph.js
// Meta Graph API client for the DM feeder (spec 2026-07-20-meta-dm-feeder-design.md).
// One Page token serves both Messenger and the linked Instagram account. All
// functions are best-effort and deps-injected; callers never break on failure.
const crypto = require("crypto");
const { secretEquals } = require("./secrets.js");

const GRAPH_VERSION = (env) => (env && env.META_GRAPH_VERSION) || "v22.0";
const WINDOW_SUBCODE = 2018278; // "sent outside of allowed window"

function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || typeof header !== "string" || header.indexOf("sha256=") !== 0) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody || "", "utf8").digest("hex");
  return secretEquals(header, expected);
}

async function sendDm({ platform, recipientId, text }, { env = process.env, fetchImpl = fetch, log = console } = {}) {
  const token = env.META_PAGE_TOKEN;
  if (!token) return { ok: false, skipped: true };
  const url = `https://graph.facebook.com/${GRAPH_VERSION(env)}/me/messages?access_token=${token}`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text: String(text || "").slice(0, 2000) } }),
    });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}));
    const err = (j && j.error) || {};
    const windowClosed = err.error_subcode === WINDOW_SUBCODE || /outside of allowed window/i.test(err.message || "");
    return { ok: false, error: err.message || `graph ${res.status}`, code: err.code, windowClosed };
  } catch (e) {
    if (log.error) log.error("meta sendDm", e.message);
    return { ok: false, error: e.message };
  }
}

async function getProfile(senderId, { env = process.env, fetchImpl = fetch } = {}) {
  const token = env.META_PAGE_TOKEN;
  if (!token) return null;
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION(env)}/${senderId}?fields=name,first_name,last_name&access_token=${token}`);
    if (!res.ok) return null;
    const j = await res.json();
    return j.name || [j.first_name, j.last_name].filter(Boolean).join(" ") || null;
  } catch (e) { return null; }
}

module.exports = { verifySignature, sendDm, getProfile, GRAPH_VERSION };
