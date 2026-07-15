// netlify/functions/lib/ott-email.js
// Parse an OTT "A New Lead From Facebook Ads" email (normalized by lib/gmail.js) into
// the /lead-ingest shape. Refine the field regexes against tests/fixtures/ott-lead-sample.txt.
function firstEmail(s) { const m = String(s || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/); return m ? m[0] : ""; }
function fieldAfter(body, labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i");
    const m = String(body || "").match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}
function parseOttLeadEmail(message) {
  const h = message.headers || {};
  const body = message.textBody || "";
  const name = fieldAfter(body, ["Full Name", "Name", "Customer"]) || "OTT National Lead";
  const phone = (fieldAfter(body, ["Phone", "Phone Number", "Mobile"]) || "").replace(/[^\d+]/g, "");
  const email = fieldAfter(body, ["Email"]) || firstEmail(body);
  const vehicle = fieldAfter(body, ["Vehicle", "Car", "Truck"]);
  const replyTo = (h.replyTo || h.from || "").match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return {
    name, phone, email, vehicle, goals: "",
    channel: "ott-national", source: "ott-national:fb-ads",
    replyTo: replyTo ? replyTo[0] : "",
    threadId: message.threadId || "",
    messageIdHeader: h.messageId || "",
  };
}
module.exports = { parseOttLeadEmail, fieldAfter, firstEmail };
