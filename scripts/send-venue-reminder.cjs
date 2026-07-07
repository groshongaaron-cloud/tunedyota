#!/usr/bin/env node
// One-off: email all OTT installers a reminder of every event whose venue address
// is still "To Be Released" in the booking system, so they lock real venues before
// customer 10/2-day address emails go out (otherwise those say "Address: To Be Released").
//
// Pulls live event data from the baked schedule and ownership from markets.js + routing.js,
// so the report stays accurate without hand-maintenance.
//
// Usage (PowerShell):
//   $env:RESEND_API_KEY="re_xxx"; node scripts\send-venue-reminder.cjs          # DRY RUN — prints, does not send
//   $env:RESEND_API_KEY="re_xxx"; node scripts\send-venue-reminder.cjs --send   # actually sends
//
// The script never sends without --send.

const EVENTS = require("../netlify/functions/lib/events-data.js");
const { getMarket } = require("../netlify/functions/lib/markets.js");
const { keyToInstaller, INSTALLERS } = require("../netlify/functions/lib/routing.js");
const { sendEmail } = require("../netlify/functions/lib/resend.js");

const FROM = "Tuned Yota <events@send.tunedyota.events>";
const REPLY_TO = "info@tunedyota.com";
const PLACEHOLDER = "To Be Released";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function daysUntil(dateISO, today) {
  const a = new Date(dateISO + "T00:00:00Z").getTime();
  const b = new Date(today + "T00:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function buildRows(today) {
  const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  return Object.entries(EVENTS)
    .flatMap(([key, val]) => asArr(val).map((e) => [key, e]))
    .filter(([, e]) => e.active && String(e.address || "").trim() === PLACEHOLDER)
    .map(([city, e]) => {
      const market = getMarket(e.event && e.event.split(",")[0] ? city : city) || getMarket(city);
      const inst = market ? keyToInstaller(market.inst) : keyToInstaller("aaron");
      return {
        city: market ? market.city : city,
        state: market ? market.state : "",
        label: e.label,
        dateISO: e.dateISO,
        days: daysUntil(e.dateISO, today),
        owner: inst.name,
        ownerEmail: inst.email,
        event: e.event,
      };
    })
    .filter((r) => r.days >= 0) // only upcoming/today — past events can't take a venue anymore
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function urgency(days) {
  if (days <= 2) return "🔴 URGENT";
  if (days <= 10) return "🟠 Soon";
  return "🟡 Upcoming";
}

function render(rows, today) {
  const subject = `Action needed — ${rows.length} venue${rows.length === 1 ? "" : "s"} to confirm + 2027 anchor-event nominations`;

  const nominateHtml =
    `<hr style="border:none;border-top:1px solid #e6e1da;margin:26px 0 18px">` +
    `<h2 style="color:#5B4B42;margin:0 0 4px">Second ask — 2027 anchor-event nominations</h2>` +
    `<p style="color:#7c8472;margin:0 0 12px;font-size:14px">We're building the 2027 calendar now. The best events are ones we <b>co-locate with a show, meet, or shop</b> you already know — free venue, built-in truck crowd. <b>Please nominate 1–2 events in your territory by <span style="color:#3A2E26">Sep 30, 2026</span></b> so they get first pick of dates.</p>` +
    `<p style="color:#3A2E26;margin:0 0 6px;font-size:14px">Just reply with, for each:</p>` +
    `<ul style="color:#3A2E26;font-size:14px;margin:0 0 4px;padding-left:20px">` +
    `<li>Event name + city/state</li>` +
    `<li>2027 date or weekend (a guess is fine)</li>` +
    `<li>Type — overland expo · Toyota/Tacoma/Tundra/4Runner meet · truck show · off-road park · dealer/shop open house</li>` +
    `<li>Rough attendance</li>` +
    `<li>Venue offered? (free lot / indoor / none)</li>` +
    `<li>Our way in — contact, booth cost, or "I know the organizer"</li>` +
    `<li>Your confidence — would co-host / just attend / unsure</li>` +
    `</ul>`;

  const nominateText =
    `\n\n----------------------------------------\n` +
    `SECOND ASK — 2027 anchor-event nominations (by Sep 30, 2026)\n\n` +
    `We're building the 2027 calendar. Best events co-locate with a show/meet/shop you\n` +
    `already know (free venue + truck crowd). Nominate 1-2 in your territory. For each, reply with:\n` +
    `  - Event name + city/state\n` +
    `  - 2027 date or weekend (a guess is fine)\n` +
    `  - Type: overland expo / Toyota-Tacoma-Tundra-4Runner meet / truck show / off-road park / dealer-shop open house\n` +
    `  - Rough attendance\n` +
    `  - Venue offered? (free lot / indoor / none)\n` +
    `  - Our way in (contact, booth cost, or "I know the organizer")\n` +
    `  - Your confidence (would co-host / just attend / unsure)\n`;

  const head = ["Status", "Days out", "Date", "Event", "Owner"];
  const th = head.map((h) => `<th style="text-align:left;padding:6px 14px 6px 0;color:#7c8472;border-bottom:1px solid #ccc;font-size:13px">${h}</th>`).join("");
  const trs = rows.map((r) => {
    const cells = [
      urgency(r.days),
      r.days === 0 ? "TODAY" : `${r.days} day${r.days === 1 ? "" : "s"}`,
      `${r.label}`,
      `${esc(r.city)}, ${esc(r.state)} — ${esc(r.event)}`,
      esc(r.owner),
    ];
    return `<tr>${cells.map((c) => `<td style="padding:6px 14px 6px 0;color:#3A2E26;font-size:14px;border-bottom:1px solid #f0ede8">${c}</td>`).join("")}</tr>`;
  }).join("");

  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:680px">` +
    `<h2 style="color:#5B4B42;margin:0 0 4px">Venue addresses still needed</h2>` +
    `<p style="color:#7c8472;margin:0 0 14px;font-size:14px">As of ${today}, the booking system shows <b>“To Be Released”</b> for the venue address on the events below. ` +
    `Customers booked into these events get an automatic reminder email 10 and 2 days out — until the real address is set, that email reads <b>“Address: To Be Released.”</b></p>` +
    `<p style="color:#3A2E26;margin:0 0 14px;font-size:14px"><b>Please reply to this email with the confirmed venue address for any event you own</b>, and we'll lock it in.</p>` +
    `<table style="border-collapse:collapse">${`<tr>${th}</tr>`}${trs}</table>` +
    nominateHtml +
    `<p style="color:#7c8472;margin:16px 0 0;font-size:12px">Sent to all installers for shared visibility. Owner column shows who covers each market.</p>` +
    `</div>`;

  const text =
    `Venue addresses still needed (as of ${today})\n\n` +
    `The booking system shows "To Be Released" for these events. Customer reminder emails (10 & 2 days out)\n` +
    `will read "Address: To Be Released" until the real venue is set. Reply with the confirmed address for any\n` +
    `event you own.\n\n` +
    rows.map((r) => `- [${urgency(r.days)}] ${r.label} (${r.days === 0 ? "TODAY" : r.days + "d"}) — ${r.city}, ${r.state} — ${r.event} — owner: ${r.owner}`).join("\n") +
    nominateText;

  return { subject, html, text };
}

async function main() {
  const send = process.argv.includes("--send");
  const today = todayISO();
  const rows = buildRows(today);
  const recipients = Object.values(INSTALLERS).map((i) => i.email);
  const { subject, html, text } = render(rows, today);

  console.log("=== Venue-address reminder ===");
  console.log("To:", recipients.join(", "));
  console.log("From:", FROM, "| Reply-To:", REPLY_TO);
  console.log("Subject:", subject);
  console.log("\n--- text body ---\n" + text);

  if (!send) {
    console.log("\nDRY RUN — nothing sent. Re-run with --send to dispatch.");
    return;
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("\nERROR: RESEND_API_KEY is not set. Cannot send.");
    process.exit(1);
  }
  const res = await sendEmail({
    apiKey: process.env.RESEND_API_KEY,
    from: FROM, to: recipients, replyTo: REPLY_TO, subject, html, text,
  });
  console.log("\nSENT ✓ Resend id:", res && res.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
