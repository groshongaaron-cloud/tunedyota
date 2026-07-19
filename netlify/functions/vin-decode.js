// netlify/functions/vin-decode.js
// Auth-gated proxy over the free NHTSA vPIC VIN decoder. Decodes the entered VIN and
// compares it to the booking (lib/vin-guard) so the close-out console can warn the
// installer before completion. Advisory only — fails OPEN (unavailable, non-blocking)
// on any NHTSA/network problem so a close-out is never trapped. No Airtable.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { compareVin } = require("./lib/vin-guard.js");
const { vinCheckDigitOk } = require("./lib/vin.js");

const NHTSA = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
// Same wording vin-guard emits on NHTSA ErrorCode 1, so the two sources dedupe.
const CD_WARNING = "This VIN may be mistyped — it fails its check digit.";

async function processVinDecode(body, deps) {
  const { fetchImpl = fetch } = deps || {};
  const d = body || {};
  const vin = String(d.vin || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (vin.length !== 17) return { ok: true, unavailable: true, warnings: [] };
  // Local ISO 3779 check digit — works when NHTSA is down or slow (its latency is
  // bimodal), so a scanned-wrong VIN can never sail through warning-free just
  // because the decoder timed out.
  const local = vinCheckDigitOk(vin) ? [] : [CD_WARNING];
  let decoded;
  try {
    const ctrl = new AbortController();
    // NHTSA latency is bimodal (sub-second, or 20s+ spikes). 8s catches the fast
    // common case and stays under Netlify's ~10s sync-function limit so a slow call
    // returns a clean `unavailable` (fails open) instead of a 502. Best-effort guard.
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let res;
    try { res = await fetchImpl(`${NHTSA}${vin}?format=json`, { signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
    if (!res || !res.ok) return { ok: !local.length, unavailable: true, warnings: local };
    const json = await res.json();
    const r = (json.Results && json.Results[0]) || {};
    decoded = { modelYear: r.ModelYear || "", make: r.Make || "", model: r.Model || "",
      fuel: r.FuelTypePrimary || "", errorCode: r.ErrorCode || "" };
  } catch (e) { return { ok: !local.length, unavailable: true, warnings: local }; }
  const { warnings } = compareVin(decoded, { vehicle: d.vehicle, modelYear: d.modelYear });
  const all = [...new Set([...local, ...warnings])];   // identical wording dedupes
  return { ok: all.length === 0, warnings: all, decoded, unavailable: false };
}

async function handler(event) {
  const key = resolveInstaller(event.headers || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, body: "bad json" }; }
  const out = await processVinDecode(body, {});
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(out) };
}
module.exports = { handler, processVinDecode };
