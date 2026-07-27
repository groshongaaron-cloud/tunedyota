// netlify/functions/sms-volume-report.js
// Daily SMS volume canary (netlify.toml, 13:00 UTC = morning Central). One
// Slack line: yesterday's outbound messages/segments/estimated cost + inbound,
// against the trailing 7-day average — added 2026-07-27 when the chat relay
// started forwarding every client message to installer phones (owner asked to
// watch A2P volume). ⚠-flags a day above 2× the trailing average. Baseline at
// launch: 15–35 outbound/day, <$0.50/day.
const { notifyOwner } = require("./lib/alert.js");

const API = "https://api.twilio.com";

// One UTC day of Messages, paged. {out, segs, inbound, price}.
async function dayStats(dayISO, { env = process.env, fetchImpl = fetch } = {}) {
  const sid = env.TWILIO_ACCOUNT_SID, token = env.TWILIO_AUTH_TOKEN;
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  const next = new Date(Date.parse(dayISO + "T00:00:00Z") + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let uri = `/2010-04-01/Accounts/${sid}/Messages.json?DateSent%3E=${dayISO}T00:00:00Z&DateSent%3C=${next}T00:00:00Z&PageSize=400`;
  const s = { out: 0, segs: 0, inbound: 0, price: 0 };
  while (uri) {
    const res = await fetchImpl(API + uri, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`twilio messages ${res.status}`);
    const j = await res.json();
    for (const m of j.messages || []) {
      if (String(m.direction || "").startsWith("outbound")) {
        s.out++;
        s.segs += Number(m.num_segments) || 1;
        if (m.price != null) s.price += Math.abs(parseFloat(m.price)) || 0;
      } else if (m.direction === "inbound") s.inbound++;
    }
    uri = j.next_page_uri || null;
  }
  return s;
}

async function buildReport({ env = process.env, fetchImpl = fetch, now = Date.now, log = console } = {}) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) return { skipped: true };
  const dayISO = (d) => new Date(now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Trailing 7 days (8..2 days ago) first, yesterday last — dayStats call order
  // is part of the contract (tests feed pages sequentially).
  const trail = [];
  for (let d = 8; d >= 2; d--) trail.push(await dayStats(dayISO(d), { env, fetchImpl }));
  const y = await dayStats(dayISO(1), { env, fetchImpl });
  const avgOut = trail.reduce((n, s) => n + s.out, 0) / (trail.length || 1);
  const spike = avgOut >= 5 && y.out > 2 * avgOut;
  const text = `${spike ? "⚠ " : ""}SMS volume ${dayISO(1)}: ${y.out} out (${y.segs} segs, ~$${y.price.toFixed(2)}), ${y.inbound} in — 7-day avg ${avgOut.toFixed(1)}/day out.${spike ? " Above 2× the trailing average — check the relay volume." : ""}`;
  if (log.log) log.log("sms-volume-report:", text);
  return { text, out: y.out, segs: y.segs, spike };
}

async function handler() {
  try {
    const r = await buildReport({});
    if (!r.skipped && r.text) {
      try { await notifyOwner({ webhookUrl: process.env.SLACK_WEBHOOK_URL, text: r.text }); } catch (e) { console.error("sms-volume-report slack", e.message); }
    }
    return { statusCode: 200, body: JSON.stringify(r) };
  } catch (e) {
    console.error("sms-volume-report", e.message);
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { handler, buildReport, dayStats };
