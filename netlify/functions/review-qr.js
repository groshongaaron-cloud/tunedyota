// netlify/functions/review-qr.js
// Public: render the configured Google review URL (env GOOGLE_REVIEW_URL) as an inline
// SVG QR for the installer console's "Ask for a review" overlay. Reuses lib/qr.js.
// Public on purpose — a review link is public info, so the console loads it via <img>.
const { qrSvg } = require("./lib/qr.js");

function buildReviewQr(env = process.env) {
  const url = String((env && env.GOOGLE_REVIEW_URL) || "").trim();
  if (!url) return { ok: false };
  return { ok: true, svg: qrSvg(url) };
}

async function handler() {
  const out = buildReviewQr(process.env);
  if (!out.ok) return { statusCode: 404, headers: { "Content-Type": "text/plain" }, body: "review url not configured" };
  return { statusCode: 200, headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" }, body: out.svg };
}
module.exports = { handler, buildReviewQr };
