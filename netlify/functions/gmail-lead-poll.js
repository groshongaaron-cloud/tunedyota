// netlify/functions/gmail-lead-poll.js
// Scheduled: find new OTT lead emails, parse, POST to /lead-ingest, label processed.
const gmailLib = require("./lib/gmail.js");
const { parseOttLeadEmail } = require("./lib/ott-email.js");

// 60-day lookback ("60 days in arrears") so first activation backfills recent leads,
// not just brand-new ones. Already-processed messages are excluded by the labels.
const QUERY = 'subject:"A New Lead From Facebook Ads" -label:ty-ingested -label:ty-ingest-failed newer_than:60d';

async function runPoll(deps = {}) {
  const env = deps.env || process.env;
  if (!env.GMAIL_REFRESH_TOKEN && !deps.gmail) return { ingested: 0, skipped: "no-gmail-config" };
  const gmail = deps.gmail || gmailLib;
  const post = deps.postImpl || fetch;
  const base = env.LEAD_INGEST_URL || (env.URL ? `${env.URL}/.netlify/functions/lead-ingest` : "https://tunedyota.com/.netlify/functions/lead-ingest");
  // A transient Gmail failure must not crash the 10-minute schedule — return an
  // error result; unprocessed messages are simply picked up on the next tick.
  let msgs;
  try { msgs = await gmail.listMessages(QUERY, { env }); }
  catch (e) { return { ingested: 0, error: e.message }; }
  let ingested = 0;
  for (const { id } of msgs) {
    try {
      const full = await gmail.getMessage(id, { env });
      const lead = parseOttLeadEmail(full);
      const body = { name: lead.name, phone: lead.phone, email: lead.email, vehicle: lead.vehicle,
        goals: lead.goals, city: lead.city, message: lead.message,
        channel: lead.channel, source: lead.source, emailThread: lead.threadId, emailMessageId: lead.messageIdHeader, replyTo: lead.replyTo };
      const res = await post(base, { method: "POST",
        headers: { "Content-Type": "application/json", "x-ty-task": env.INTERNAL_TASK_SECRET || "" }, body: JSON.stringify(body) });
      if (res.ok) { await gmail.addLabel(id, "ty-ingested", { env }); ingested++; }
      else { await gmail.addLabel(id, "ty-ingest-failed", { env }); }
    } catch (e) { try { await gmail.addLabel(id, "ty-ingest-failed", { env }); } catch (_) {} }
  }
  return { ingested, scanned: msgs.length };
}
async function handler() { const out = await runPoll({}); return { statusCode: 200, body: JSON.stringify(out) }; }
module.exports = { handler, runPoll };
