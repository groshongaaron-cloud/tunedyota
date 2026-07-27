// netlify/functions/lib/installer-relay.js
// Forwards a client's message in an escalated session to the phone of whoever
// is working it: the assigned installer, else the dispatcher (centralized
// intake — CHAT_DISPATCHER, owner decision 2026-07-27). Labeled single chain:
// every SMS leads with "TY · name · vehicle · NEW/RETURNING" so multiple
// clients stay tellable-apart in one thread. Stamps sess.lastRelayedAt (caller
// saves) — reply routing picks the thread whose message most recently hit the
// phone. Deps-injected like every lib here.
const { cfg, escapeFormula, listRecords } = require("./airtable.js");
const { sendSms } = require("./twilio.js");
const { smsNumberFor, dispatcherKey, normalizeInstallerKey, INSTALLERS } = require("./routing.js");
const { isStale, TABLE } = require("./chat-store.js");

// The · separators keep the owner-approved label look; they force UCS-2 SMS segments (67/153 chars) — accepted for readability at TY's volume.
const MAX_RELAY_CHARS = 320;

function relayTargetKey(sess, env) { return normalizeInstallerKey(sess.installer) || dispatcherKey(env); }

// Prior COMPLETED booking with this phone -> returning client. null = unknown
// (no phone, or lookup failed) -> the tag is simply omitted; never blocks relay.
async function isReturningClient(sess, { env = process.env, fetchImpl = fetch } = {}) {
  const digits = String(sess.phone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;
  const c = cfg(env);
  // Phone column holds raw form input — strip separators in-formula before matching.
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: c.bookings,
    filterByFormula: `AND({Status}="Completed", FIND("${digits}", SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({Phone}&"", " ", ""), "-", ""), "(", ""), ")", ""), "+", ""), ".", ""))>0)`, fields: ["Name"] });
  return recs.length > 0;
}

// How many live escalated threads currently relay to this person. For the
// dispatcher that includes every unassigned thread.
async function countActiveFor(key, { env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const c = cfg(env);
  const k = escapeFormula(key);
  const filter = key === dispatcherKey(env)
    ? `AND({Status}="escalated", OR({Installer}="${k}", {Installer}=""))`
    : `AND({Status}="escalated", {Installer}="${k}")`;
  const recs = await listRecords({ fetchImpl, token: c.token, baseId: c.baseId, table: TABLE(env),
    filterByFormula: filter, fields: ["Session ID", "Last Activity"] });
  return recs.filter((r) => !isStale({ status: "escalated", lastActivity: (r.fields || {})["Last Activity"] || "" }, now())).length;
}

// Returns the label lines (head first). Kept pure for testability.
function relayLabel(sess, { returning = null, activeCount = 1, firstRelay = false, env = process.env } = {}) {
  const tag = returning === true ? "RETURNING" : returning === false ? "NEW" : "";
  const head = ["TY", sess.customerName || "Customer", sess.vehicle || "", tag].filter(Boolean).join(" · ");
  const lines = [head];
  if (activeCount > 1) lines.push(`⚠ ${activeCount} active chats — reply goes to ${sess.customerName || "this customer"}; switch in console.`);
  if (firstRelay && !sess.installer) {
    const others = Object.keys(INSTALLERS).filter((k) => k !== dispatcherKey(env));
    lines.push(`Reply to answer, or ${others.map((k) => "@" + k).join(" / ")} to dispatch.`);
  }
  return lines;
}

async function relayClientTurn(sess, message, deps = {}) {
  const { env = process.env, log = console, now = Date.now,
    sms = (a) => sendSms(a, { env, log }),
    returningLookup = (s) => isReturningClient(s, { env }),
    activeFor = (k) => countActiveFor(k, { env }) } = deps;
  const target = relayTargetKey(sess, env);
  const firstRelay = !sess.lastRelayedAt;
  let returning = null;
  try { returning = await returningLookup(sess); } catch (e) { if (log.warn) log.warn("relay returning-lookup", e.message); }
  let activeCount = 1;
  try { activeCount = await activeFor(target); } catch (e) { if (log.warn) log.warn("relay active-count", e.message); }
  const lines = relayLabel(sess, { returning, activeCount, firstRelay, env });
  const raw = String(message || "");
  const text = raw.length > MAX_RELAY_CHARS ? raw.slice(0, MAX_RELAY_CHARS) + "..." : raw;
  const body = lines[0] + '\n"' + text + '"' + (lines.length > 1 ? "\n" + lines.slice(1).join("\n") : "");
  const out = await sms({ to: smsNumberFor(target, env), body });
  if (out && out.ok === false) throw new Error(out.error || (out.skipped ? "sms skipped (twilio env unconfigured)" : "sms send failed"));
  sess.lastRelayedAt = new Date(now()).toISOString();
  return { target };
}

module.exports = { relayClientTurn, relayTargetKey, relayLabel, isReturningClient, countActiveFor, MAX_RELAY_CHARS };
