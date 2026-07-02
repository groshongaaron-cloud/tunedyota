// Installer calibration reference (Track B) — serves the calibration cross-reference
// to the /calibration.html console, gated by the installer token (same as the roster).
// Returns the full row set for responsive client-side filtering + the coverage report.
const { resolveInstaller } = require("./lib/installer-auth.js");
const { allRows, models, coverage } = require("./lib/calibration-reference.js");

async function handler(event) {
  const key = resolveInstaller((event && event.headers) || {}, process.env);
  if (!key) return { statusCode: 401, body: "unauthorized" };
  const rows = allRows().map((r) => ({
    model: r.Model, year: r.Year, trans: r.Trans, engine: r["Engine Size"], keyPush: r["Key / Push"],
    drivetrain: r.Drivetrain, fuelTank: r["Fuel Tank"], tow: r.Tow, flex: r.Flex,
    oldCal: r["Old Cal ID"], newCal: r["New Cal ID"], tsb: r.TSB, cuw: r.CUW,
  }));
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" },
    body: JSON.stringify({ rows, models: models(), coverage: coverage() }),
  };
}
module.exports = { handler };
