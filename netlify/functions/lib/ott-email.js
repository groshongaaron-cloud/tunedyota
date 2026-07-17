// netlify/functions/lib/ott-email.js
// Parse an OTT "A New Lead From Facebook Ads" email (normalized by lib/gmail.js) into
// the /lead-ingest shape. Production emails are forwarded by info@overlandtailor.com and
// carry labeled lines: Name / Email / Phone / City / State / Vehicle Year|Make|Model /
// Engine Size / Transmission Type / Engine modifications. See tests/fixtures/ott-lead-sample.txt.
function firstEmail(s) { const m = String(s || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/); return m ? m[0] : ""; }

// Value after a "Label:" (or "Label -") at the START of a line. Line-anchored so a label
// like "Name" doesn't match "Campaign name", and "Vehicle" doesn't grab "Vehicle Year".
function fieldAfter(body, labels) {
  const text = String(body || "");
  for (const label of labels) {
    const re = new RegExp(`^\\s*${label}\\s*[:\\-]\\s*(.+)$`, "im");
    const m = text.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

function parseOttLeadEmail(message) {
  const h = message.headers || {};
  const body = message.textBody || "";
  const name = fieldAfter(body, ["Full Name", "Name", "Customer"]) || "OTT National Lead";
  // Phone arrives as "+1XXXXXXXXXX | (XXX) XXX-XXXX" — take the first format, keep +digits.
  const phone = fieldAfter(body, ["Phone", "Phone Number", "Mobile"]).split("|")[0].replace(/[^\d+]/g, "");
  const email = fieldAfter(body, ["Email"]) || firstEmail(body);
  // Vehicle is split across three labeled lines; fall back to a single "Vehicle:" line.
  const vehicle = [fieldAfter(body, ["Vehicle Year"]), fieldAfter(body, ["Vehicle Make"]), fieldAfter(body, ["Vehicle Model"])]
    .filter(Boolean).join(" ") || fieldAfter(body, ["Vehicle", "Car", "Truck"]);
  // Extra context → Goals (location + engine). City also routes to a market if it's a known one.
  const city = fieldAfter(body, ["City"]);
  const state = fieldAfter(body, ["State"]);
  const engine = fieldAfter(body, ["Engine Size"]);
  const trans = fieldAfter(body, ["Transmission Type"]).replace(/_+$/, "");
  const mods = fieldAfter(body, ["Engine modifications", "Engine Modifications"]);
  const ghlLink = fieldAfter(body, ["GHL Link"]);
  const goals = [[city, state].filter(Boolean).join(", "), engine && ("Engine " + engine), trans && ("Trans " + trans),
    (mods && !/^none?$/i.test(mods)) && ("Mods " + mods)].filter(Boolean).join(" · ");
  const rt = (h.replyTo || h.from || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return {
    name, phone, email, vehicle, goals, city, ghlLink,
    channel: "ott-national", source: "ott-national:fb-ads",
    message: "OTT national Facebook lead",
    replyTo: rt ? rt[0] : "",
    threadId: message.threadId || "",
    messageIdHeader: h.messageId || "",
  };
}
module.exports = { parseOttLeadEmail, fieldAfter, firstEmail };
