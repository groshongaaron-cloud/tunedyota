// netlify/functions/vin-ocr.js
// Auth-gated Claude-vision proxy: read a VIN from a photo taken at close-out.
// Advisory capture aid — the console routes every non-success to manual entry,
// so the camera never blocks a close-out. The image is transient (OCR only,
// never stored). Degrades gracefully when ANTHROPIC_API_KEY is unset.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { readVinFromImage } = require("./lib/vin-ocr-core.js");

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "bad json" }; }
  const out = await readVinFromImage(
    { imageBase64: body.imageBase64, mediaType: body.mediaType },
    { apiKey: process.env.ANTHROPIC_API_KEY }
  );
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}

module.exports = { handler };
