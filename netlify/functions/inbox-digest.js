// netlify/functions/inbox-digest.js
// 8am / noon / 7pm CT: tell Aaron how many reply drafts are waiting in Gmail and
// who they're for, so inbox review happens in 3 predictable batches. Reads Gmail
// drafts (created by inbox-sweep); zero drafts = zero noise.
const gmailLib = require("./lib/gmail.js");
const { sendEmail } = require("./lib/resend.js");
const { notifyOwner } = require("./lib/alert.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const OWNER = "info@tunedyota.com";

async function runDigest(deps = {}) {
  const env = deps.env || process.env;
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) return { count: 0, skipped: "no-gmail-config" };
  const gmail = deps.gmail || gmailLib;
  const send = deps.send || sendEmail;
  const notify = deps.notify || notifyOwner;
  const log = deps.log || console;

  let drafts;
  try {
    drafts = await gmail.listDrafts({ env });
    // Filter to only drafts created by the sweep: keep drafts whose threadId belongs
    // to a thread that carries the ty-drafted label (applied by inbox-sweep).
    const tagged = await gmail.listMessages("label:ty-drafted", { env });
    const threadIds = new Set(tagged.map((m) => m.threadId));
    drafts = drafts.filter((d) => threadIds.has(d.threadId));
  } catch (e) { return { count: 0, error: e.message }; }
  if (!drafts.length) return { count: 0 };

  const rows = [];
  for (const d of drafts) {
    try {
      const m = await gmail.getMessage(d.messageId, { env });
      rows.push(`• ${m.headers.to || "?"} — "${m.headers.subject || "(no subject)"}"`);
    } catch (e) { rows.push(`• draft ${d.id} (couldn't load detail)`); }
  }
  const n = rows.length;
  const text = `${n} reply draft${n === 1 ? "" : "s"} waiting for your review in Gmail:\n\n${rows.join("\n")}\n\nOpen Gmail → Drafts, review, and hit send on each. Nothing sends without you.`;
  try { await send({ fetchImpl: deps.fetchImpl || fetch, apiKey: env.RESEND_API_KEY, from: FROM, to: OWNER, replyTo: OWNER,
    subject: `Inbox review — ${n} reply draft${n === 1 ? "" : "s"} waiting`, text }); }
  catch (e) { if (log.error) log.error("inbox-digest send", e.message); }
  try { await notify({ fetchImpl: deps.fetchImpl || fetch, webhookUrl: env.SLACK_WEBHOOK_URL, text: `📥 ${n} reply draft${n === 1 ? "" : "s"} waiting in Gmail for review`, log }); }
  catch (e) { if (log.error) log.error("inbox-digest slack", e.message); }
  return { count: n };
}

async function handler() { const r = await runDigest({}); return { statusCode: 200, body: JSON.stringify(r) }; }
module.exports = { handler, runDigest };
