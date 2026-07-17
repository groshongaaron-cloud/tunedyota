// netlify/functions/event-qr.js
// Public: SVG QR for a per-event booking link (/book/<slug>). Mirrors review-qr.js.
// Validates the slug against real markets so this can't QR arbitrary strings.
const { qrSvg } = require("./lib/qr.js");
const { parseEventSlug, eventUrl } = require("./lib/event-links.js");

async function handler(event) {
  const slug = ((event && event.queryStringParameters) || {}).e || "";
  const parsed = parseEventSlug(slug);
  if (!parsed) return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "unknown event" };
  const svg = qrSvg(eventUrl(parsed.city, parsed.dateISO));
  return { statusCode: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }, body: svg };
}
module.exports = { handler };
