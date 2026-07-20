// Pure builders: given form data `d` and the resolved `inst` (from routing),
// return { subject, html, text }. No I/O.
const { formatSlot } = require("./slots.js");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label, value) {
  if (!value) return { text: "", html: "" };
  return {
    text: `${label}: ${value}\n`,
    html: `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">${esc(label)}</td><td style="padding:4px 0;color:#3A2E26">${esc(value)}</td></tr>`,
  };
}

function quoteLine(d) {
  const parts = [];
  if (d.quote_base) parts.push(`OTT from $${d.quote_base}`);
  if (d.quote_custom) parts.push(`Custom $${d.quote_custom}`);
  if (d.quote_sc) parts.push(`Forced-induction from $${d.quote_sc}`);
  return parts.join(" · ");
}

function attribution(d) {
  const parts = [];
  if (d.utm_source) parts.push(`source=${d.utm_source}`);
  if (d.utm_medium) parts.push(`medium=${d.utm_medium}`);
  if (d.utm_campaign) parts.push(`campaign=${d.utm_campaign}`);
  if (d.referrer) parts.push(`referrer=${d.referrer}`);
  return parts.join(" · ");
}

function buildInstallerEmail(d, inst) {
  const rows = [
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email),
    row("Market", d.market), row("Vehicle", d.vehicle), row("Goals", d.goals),
    row("Quote shown", quoteLine(d)), row("Message", d.message),
    row("Attribution", attribution(d)),
  ];
  const subject = `New tune lead — ${d.vehicle || "vehicle TBD"} (${d.market || "no market"})`;
  const text =
    `New lead from the tune finder — routed to ${inst.name}.\n\n` +
    rows.map((r) => r.text).join("") +
    `\nReply directly to reach the customer.\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42;margin:0 0 4px">New tune lead</h2>` +
    `<p style="margin:0 0 16px;color:#7c8472">Routed to ${esc(inst.name)} — reply directly to reach the customer.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table>` +
    `</div>`;
  return { subject, html, text };
}

function buildCustomerEmail(d, inst) {
  const subject = "Tuned Yota — we got your request";
  const first = (d.name || "there").split(" ")[0];
  const text =
    `Hi ${first},\n\n` +
    `Thanks for using the Tuned Yota tune finder. Your request for your ` +
    `${d.vehicle || "vehicle"} is in, and ${inst.name} — your installer for ` +
    `${d.market || "your area"} — will reach out to confirm your event date and calibration.\n\n` +
    `Want it sooner? Call or text ${inst.name} at ${inst.phone}.\n\n` +
    `We may text you at the number you provided. Msg & data rates may apply; reply STOP to opt out, HELP for help. Privacy: https://tunedyota.com/privacy\n\n` +
    `— Tuned Yota · Undeniable Performance\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">Thanks, ${esc(first)} — we got your request.</h2>` +
    `<p>Your request for your <strong>${esc(d.vehicle || "vehicle")}</strong> is in. ` +
    `<strong>${esc(inst.name)}</strong>, your installer for ${esc(d.market || "your area")}, ` +
    `will reach out to confirm your event date and calibration.</p>` +
    `<p>Want it sooner? Call or text ${esc(inst.name)} at <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="font-size:12px;color:#9aa08f;margin-top:16px">We may text you at the number you provided. Msg &amp; data rates may apply; reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. See our <a href="https://tunedyota.com/privacy" style="color:#9aa08f">Privacy Policy</a>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p>` +
    `</div>`;
  return { subject, html, text };
}

function buildBookingCustomerEmail(d, inst, market, event) {
  const first = (d.name || "there").split(" ")[0];
  // Show the venue street address on the confirmation when it's set; when the venue
  // is still "To Be Released" (or missing), promise it by email before the event.
  const addr = event && event.address && !/to be released/i.test(event.address) ? event.address : "";
  const subject = `You're booked — Tuned Yota ${market.city} (${d.slot})`;
  const text =
    `Hi ${first},\n\nYou're booked for your ${d.vehicle || "vehicle"} tune.\n\n` +
    `City: ${market.city}, ${market.state}\n` +
    (addr ? `Address: ${addr}\n` : "") +
    `Date: ${event.label || event.dateISO}\nTime: ${d.slot}\nInstaller: ${inst.name} (${inst.phone})\n\n` +
    (addr ? "" : `We'll email you the exact address before your event.\n\n`) +
    `A calendar invite is attached. Need to change it? Call or text ${inst.phone}.\n\n` +
    `We may text you about this appointment at the number you provided. Msg & data rates may apply; reply STOP to opt out, HELP for help. Privacy: https://tunedyota.com/privacy\n\n` +
    `— Tuned Yota · Undeniable Performance\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">You're booked, ${esc(first)}.</h2>` +
    `<p>Your <strong>${esc(d.vehicle || "vehicle")}</strong> tune is confirmed.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    row("City", `${market.city}, ${market.state}`).html + row("Address", addr).html + row("Date", event.label || event.dateISO).html +
    row("Time", d.slot).html + row("Model year", d.modelYear).html + row("Installer", `${inst.name} (${inst.phone})`).html +
    `</table>` +
    (addr ? "" : `<p style="margin-top:10px;color:#7c8472">We'll email you the exact address before your event.</p>`) +
    `<p style="margin-top:14px">A calendar invite is attached. Need to change it? Call or text <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="font-size:12px;color:#9aa08f;margin-top:16px">We may text you about this appointment at the number you provided. Msg &amp; data rates may apply; reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. See our <a href="https://tunedyota.com/privacy" style="color:#9aa08f">Privacy Policy</a>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
function buildBookingInstallerEmail(d, inst, market, event, referredBy) {
  const rows = [
    ...(d.source === "OTT Update" ? [row("Request type", "Free OTT Update (existing customer re-flash)")] : []),
    row("Name", d.name), row("Phone", d.phone), row("Email", d.email),
    row("City", `${market.city}, ${market.state}`), row("Date", event.label || event.dateISO),
    row("Time", d.slot), row("Vehicle", d.vehicle), row("Model year", d.modelYear), row("Goals", d.goals), row("Attribution", attribution(d)),
    // No-reward referral loop: prompt the installer/owner to personally thank the referrer.
    ...(referredBy ? [row("Referred by", `${referredBy} — send a thank-you 🙏`)] : []),
  ];
  const subject = `New booking — ${market.city} ${event.label || event.dateISO} @ ${d.slot}`;
  const text = `New booking routed to ${inst.name}.\n\n` + rows.map((r) => r.text).join("") + `\nReply to reach the customer.\n`;
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42;margin:0 0 4px">New booking</h2>` +
    `<p style="margin:0 0 16px;color:#7c8472">Routed to ${esc(inst.name)}.</p>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table></div>`;
  return { subject, html, text };
}
function priorityWord(reason) { return reason === "full" ? "the event is currently full" : "no event is scheduled in your city yet"; }
function buildPriorityCustomerEmail(d, inst, market, reason) {
  const first = (d.name || "there").split(" ")[0];
  const pref = (reason === "full" && d.slot) ? ` We noted your preferred time of ${d.slot}, and you'll be first in line if it opens.` : "";
  const subject = `You're on the Tuned Yota Priority Wait List, ${market.city}`;
  const text = `Hi ${first},\n\nYou're on the Priority Wait List for ${market.city} (${priorityWord(reason)}).${pref} ` +
    `You'll be first to know when a slot opens. Questions? Call or text ${inst.name} at ${inst.phone}.\n\nWe may text you at the number you provided. Msg & data rates may apply; reply STOP to opt out, HELP for help. Privacy: https://tunedyota.com/privacy\n\n— Tuned Yota · Undeniable Performance\n`;
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42">You're on the Priority Wait List.</h2>` +
    `<p>Thanks, ${esc(first)} — ${esc(priorityWord(reason))} in <strong>${esc(market.city)}</strong>.${esc(pref)} You'll be first to know when a slot opens.</p>` +
    `<p>Questions? Call or text ${esc(inst.name)} at <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="font-size:12px;color:#9aa08f;margin-top:16px">We may text you at the number you provided. Msg &amp; data rates may apply; reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. See our <a href="https://tunedyota.com/privacy" style="color:#9aa08f">Privacy Policy</a>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
function buildPriorityInstallerEmail(d, inst, market, reason) {
  const rows = [...(d.source === "OTT Update" ? [row("Request type", "Free OTT Update (existing customer re-flash)")] : []), row("Name", d.name), row("Phone", d.phone), row("Email", d.email), row("City", market.city), row("Requested time", reason === "full" ? (d.slot || "") : ""), row("Vehicle", d.vehicle), row("Model year", d.modelYear), row("Goals", d.goals), row("Reason", reason === "full" ? "Event full" : "No event scheduled"), row("Attribution", attribution(d))];
  const subject = `New Priority Wait List signup, ${market.city}`;
  const text = `New Priority Wait List signup routed to ${inst.name}.\n\n` + rows.map((r) => r.text).join("");
  const html = `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px"><h2 style="color:#5B4B42;margin:0 0 4px">Priority Wait List signup</h2>` +
    `<table style="border-collapse:collapse;font-size:14px">${rows.map((r) => r.html).join("")}</table></div>`;
  return { subject, html, text };
}
function buildEventReminderCustomerEmail(booking, event, inst, daysUntil) {
  const first = (booking.Name || "there").split(" ")[0];
  const phrase = daysUntil === 0 ? "today" : daysUntil === 2 ? "in 2 days" : "coming up";
  const subjWhen = daysUntil === 0 ? "is today" : daysUntil === 2 ? "in 2 days" : "coming up";
  const when = `${event.label || event.dateISO} at ${booking.Slot ? formatSlot(booking.Slot) : "9:00 AM"}`;
  const where = `${event.city}, ${event.state || ""}`.trim().replace(/,\s*$/, "");
  const subject = `Tuned Yota — your ${event.city} tune ${subjWhen}`;
  // A still-"To Be Released" venue must never print as a literal address.
  const realAddr = event.address && !/to be released/i.test(event.address) ? event.address : "";
  const addr = realAddr ? `\nAddress: ${realAddr}` : "";
  const closer = realAddr
    ? `Please save the address above so you know exactly where to go. `
    : `We'll email you the exact address before your event. `;
  const text =
    `Hi ${first},\n\nYour Tuned Yota tuning event is ${phrase}.\n\n` +
    `When: ${when}\nWhere: ${where}${addr}\n\n` +
    closer +
    `Questions? Call or text ${inst.name} at ${inst.phone}.\n\nWe may text you at the number you provided. Msg & data rates may apply; reply STOP to opt out, HELP for help. Privacy: https://tunedyota.com/privacy\n\n— Tuned Yota · Undeniable Performance\n`;
  const addrHtml = realAddr
    ? `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">Address</td><td style="padding:4px 0;color:#3A2E26"><strong>${esc(realAddr)}</strong></td></tr>`
    : "";
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">See you soon, ${esc(first)}.</h2>` +
    `<p>Your tuning event is <strong>${phrase}</strong>. Here are the details:</p>` +
    `<table style="border-collapse:collapse;font-size:14px">` +
    `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">When</td><td style="padding:4px 0;color:#3A2E26">${esc(when)}</td></tr>` +
    `<tr><td style="padding:4px 12px 4px 0;color:#7c8472;font-weight:700">Where</td><td style="padding:4px 0;color:#3A2E26">${esc(where)}</td></tr>` +
    addrHtml + `</table>` +
    `<p style="margin-top:12px">${realAddr ? "Please save the address so you know exactly where to go." : "We'll email you the exact address before your event."} Questions? Call or text <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="font-size:12px;color:#9aa08f;margin-top:16px">We may text you at the number you provided. Msg &amp; data rates may apply; reply <strong>STOP</strong> to opt out, <strong>HELP</strong> for help. See our <a href="https://tunedyota.com/privacy" style="color:#9aa08f">Privacy Policy</a>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p></div>`;
  return { subject, html, text };
}
module.exports = {
  buildInstallerEmail, buildCustomerEmail,
  buildBookingCustomerEmail, buildBookingInstallerEmail,
  buildPriorityCustomerEmail, buildPriorityInstallerEmail,
  buildEventReminderCustomerEmail,
};
