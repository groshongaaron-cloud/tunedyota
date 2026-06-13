// Pure builders: given form data `d` and the resolved `inst` (from routing),
// return { subject, html, text }. No I/O.

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
    `— Tuned Yota · Undeniable Performance\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#3A2E26;max-width:560px">` +
    `<h2 style="color:#5B4B42">Thanks, ${esc(first)} — we got your request.</h2>` +
    `<p>Your request for your <strong>${esc(d.vehicle || "vehicle")}</strong> is in. ` +
    `<strong>${esc(inst.name)}</strong>, your installer for ${esc(d.market || "your area")}, ` +
    `will reach out to confirm your event date and calibration.</p>` +
    `<p>Want it sooner? Call or text ${esc(inst.name)} at <strong>${esc(inst.phone)}</strong>.</p>` +
    `<p style="color:#7c8472;font-weight:700;letter-spacing:.04em">— Tuned Yota · Undeniable Performance</p>` +
    `</div>`;
  return { subject, html, text };
}

module.exports = { buildInstallerEmail, buildCustomerEmail };
