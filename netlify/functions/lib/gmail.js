// netlify/functions/lib/gmail.js
// Thin Gmail REST client for info@tunedyota.com. OAuth2 refresh-token auth via
// google-auth-library (already a dep). All I/O injectable for unit tests.
const { OAuth2Client } = require("google-auth-library");
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function defaultToken(env) {
  const c = new OAuth2Client(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  c.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const t = await c.getAccessToken();
  return (t && t.token) ? t.token : t;
}
function b64url(s) { return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(s) { return Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }

async function authFetch(path, opts, deps) {
  const { fetchImpl = fetch, tokenImpl, env = process.env } = deps;
  const token = await (tokenImpl ? tokenImpl() : defaultToken(env));
  const res = await fetchImpl(`${BASE}${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`,
    "Content-Type": "application/json", ...(opts && opts.headers) } });
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}`);
  return res.json();
}

async function listMessages(query, deps) {
  const j = await authFetch(`/messages?q=${encodeURIComponent(query)}`, {}, deps);
  return (j.messages || []).map((m) => ({ id: m.id, threadId: m.threadId }));
}

function pickBody(payload) {
  // Prefer text/plain; fall back to text/html. Walk one level of parts.
  const parts = payload.parts || [payload];
  let text = "", html = "";
  for (const p of parts) {
    const data = p.body && p.body.data;
    if (!data) continue;
    if (p.mimeType === "text/plain" && !text) text = b64urlDecode(data);
    if (p.mimeType === "text/html" && !html) html = b64urlDecode(data);
  }
  return { text, html };
}
function simplifyMessage(j) {
  const h = {};
  for (const { name, value } of (j.payload && j.payload.headers) || []) h[name.toLowerCase()] = value;
  const { text, html } = pickBody(j.payload || {});
  return { id: j.id, threadId: j.threadId,
    headers: { from: h.from || "", to: h.to || "", cc: h.cc || "", replyTo: h["reply-to"] || "",
      subject: h.subject || "", messageId: h["message-id"] || "", date: h.date || "" },
    textBody: text, htmlBody: html };
}
async function getMessage(id, deps) {
  const j = await authFetch(`/messages/${id}?format=full`, {}, deps);
  return simplifyMessage(j);
}
async function getThread(threadId, deps) {
  const j = await authFetch(`/threads/${threadId}?format=full`, {}, deps);
  return (j.messages || []).map(simplifyMessage);
}

async function ensureLabel(name, deps) {
  const j = await authFetch(`/labels`, {}, deps);
  const found = (j.labels || []).find((l) => l.name === name);
  if (found) return found.id;
  const created = await authFetch(`/labels`, { method: "POST", body: JSON.stringify({ name,
    labelListVisibility: "labelShow", messageListVisibility: "show" }) }, deps);
  return created.id;
}
async function addLabel(id, name, deps) {
  const labelId = await ensureLabel(name, deps);
  return authFetch(`/messages/${id}/modify`, { method: "POST", body: JSON.stringify({ addLabelIds: [labelId] }) }, deps);
}

async function sendReply({ threadId, to, inReplyTo, references, subject, body }, deps) {
  const lines = [`To: ${to}`, `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, references ? `References: ${references}` : null,
    "Content-Type: text/plain; charset=UTF-8", "", body].filter((x) => x !== null).join("\r\n");
  return authFetch(`/messages/send`, { method: "POST", body: JSON.stringify({ raw: b64url(lines), threadId }) }, deps);
}

// A reply DRAFT in the thread — created, never sent (Aaron reviews in Gmail).
async function createDraft({ threadId, to, inReplyTo, references, subject, body }, deps) {
  const lines = [`To: ${to}`, `Subject: ${subject}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null, references ? `References: ${references}` : null,
    "Content-Type: text/plain; charset=UTF-8", "", body].filter((x) => x !== null).join("\r\n");
  return authFetch(`/drafts`, { method: "POST", body: JSON.stringify({ message: { raw: b64url(lines), threadId } }) }, deps);
}
async function listDrafts(deps) {
  const j = await authFetch(`/drafts`, {}, deps);
  return (j.drafts || []).map((d) => ({ id: d.id, messageId: d.message && d.message.id, threadId: d.message && d.message.threadId }));
}

module.exports = { listMessages, getMessage, getThread, ensureLabel, addLabel, sendReply, createDraft, listDrafts, b64url, b64urlDecode };
