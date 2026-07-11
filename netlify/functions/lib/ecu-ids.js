// OTT VFT calibration / ECU IDs by model + model year (+ transmission), US market.
// Source: owner's Dropbox "OTT VFT Calibrations" (folder name = the CalID/ECU ID).
// Currently mapped: 3rd Gen Tacoma 3.5L (OTT 9.2). Extend as more models are
// reviewed. Mexican-market IDs are intentionally excluded (owner, 2026-07-10).
//
// ecuCandidates({ vehicleType, engine, year }) → ordered candidate list, most
// likely first (Auto, since automatics dominate), each { id, label, transmission }.
// Empty array when we don't have data for that vehicle → the report leaves ECU
// blank for manual entry, exactly as before.

// 3rd Gen Tacoma 3.5L V6 (2016–2023), OTT 9.2 files.
const TACOMA_35 = [
  { lo: 2016, hi: 2017, auto: "04B06", manual: "04B15" },
  { lo: 2018, hi: 2018, auto: "04A63", manual: "04A73" },
  { lo: 2019, hi: 2019, auto: "04B34", manual: "04B43" },
  { lo: 2020, hi: 2020, auto: "04B83", manual: "04B92" },
  { lo: 2021, hi: 2023, auto: "04C22", manual: "04C31" },
];

function fromRow(row) {
  return [
    { id: row.auto, label: `${row.auto} — Auto`, transmission: "Auto" },
    { id: row.manual, label: `${row.manual} — Manual`, transmission: "Manual" },
  ];
}

// A 3rd Gen Tacoma is the 2016–2023 platform — BOTH the 3.5L V6 and 2.7L I4.
// Used for report sectioning and the gear-ratio default.
function is3rdGenTacoma({ vehicleType, year } = {}) {
  const y = Number(year);
  return vehicleType === "Tacoma" && y >= 2016 && y <= 2023;
}

// ECU candidates are engine-specific — we only have the 3.5L map so far.
function ecuCandidates({ vehicleType, engine, year } = {}) {
  const y = Number(year);
  if (!y) return [];
  if (vehicleType === "Tacoma" && String(engine == null ? "" : engine).trim() === "3.5" && y >= 2016 && y <= 2023) {
    const row = TACOMA_35.find((r) => y >= r.lo && y <= r.hi);
    if (row) return fromRow(row);
  }
  return [];
}

// Default gear ratio (owner rule 2026-07-10): an AUTOMATIC 3rd Gen Tacoma → 3.90;
// everything else — including a MANUAL 3rd Gen Tacoma and all non-Tacomas → 4.30.
// The server default assumes automatic (the common case); picking a Manual ECU on
// the console flips a 3rd Gen Tacoma's gear to 4.30.
const GEAR_AUTO_3GT = "3.90", GEAR_DEFAULT = "4.30";
function defaultGear(v = {}) { return is3rdGenTacoma(v) ? GEAR_AUTO_3GT : GEAR_DEFAULT; }
// Gear for a specific transmission of a 3rd Gen Tacoma (used by the console coupling).
function gearForTransmission(v, transmission) {
  return is3rdGenTacoma(v) ? (/manual/i.test(transmission || "") ? GEAR_DEFAULT : GEAR_AUTO_3GT) : GEAR_DEFAULT;
}

module.exports = { ecuCandidates, is3rdGenTacoma, defaultGear, gearForTransmission, GEAR_AUTO_3GT, GEAR_DEFAULT };
