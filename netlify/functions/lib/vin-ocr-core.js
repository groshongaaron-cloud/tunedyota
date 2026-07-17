// netlify/functions/lib/vin-ocr-core.js
// Read a 17-character VIN from a photo via the Claude Messages API (vision).
// Dependency-free (raw fetch). ADVISORY capture aid only: every non-success path
// returns { ok:false, reason } so the console falls back to manual VIN entry —
// the camera is never allowed to block a close-out. The image is used only for
// this request and is never stored.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5"; // owner-approved: cheap/fast, ample to read a VIN

// Normalize an OCR'd candidate to a valid 17-char VIN or "" (VINs exclude I/O/Q).
function normalizeVin(raw) {
  const s = String(raw == null ? "" : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s) ? s : "";
}

async function readVinFromImage(input, deps) {
  const { imageBase64, mediaType } = input || {};
  const { fetchImpl = fetch, apiKey, model = MODEL } = deps || {};
  if (!apiKey) return { ok: false, reason: "unconfigured" };
  const b64 = String(imageBase64 == null ? "" : imageBase64).replace(/^data:[^,]*,/, "");
  if (!b64) return { ok: false, reason: "no-image" };
  // ~5MB decoded (the Anthropic per-image limit) — reject before spending the
  // API call; the console falls back to manual entry like every non-success.
  if (b64.length > 7_000_000) return { ok: false, reason: "too-large" };
  const mt = /^image\/(jpeg|png|webp)$/.test(mediaType || "") ? mediaType : "image/jpeg";
  let res;
  try {
    const ctrl = new AbortController();
    // Haiku vision is fast; 15s bounds a stall well under our tolerance. Fails open.
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      res = await fetchImpl(ANTHROPIC_URL, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 40,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mt, data: b64 } },
              { type: "text", text: "This photo shows a vehicle VIN (door-jamb sticker, windshield plate, or dash). Read the 17-character VIN. A VIN uses only letters and digits and never the letters I, O, or Q. Respond with ONLY the 17 VIN characters and nothing else, or the single word NONE if you cannot read a full, confident VIN." },
            ],
          }],
        }),
      });
    } finally { clearTimeout(timer); }
  } catch (e) { return { ok: false, reason: "unavailable" }; }
  if (!res || !res.ok) return { ok: false, reason: "unavailable" };
  let json;
  try { json = await res.json(); } catch (e) { return { ok: false, reason: "unavailable" }; }
  const text = (json && json.content && json.content[0] && json.content[0].text) || "";
  const vin = normalizeVin(text);
  if (!vin) return { ok: false, reason: "no-vin" };
  return { ok: true, vin };
}

module.exports = { readVinFromImage, normalizeVin };
