// OTT Protocol Selection Guide — PCM flash protocol per vehicle. Source of
// truth: Dropbox/Overland Tailor 3rd Party Calibrators/Instructions/Protocol
// Selection Guide.pdf (transcribed 2026-07-22; re-check on guide updates).
// Adds the PCM Flash column's protocol number to the installer's day-of
// itinerary, mirroring the flex-fuel Tundra precedent (flex-fuel.js).
//
// pcmProtocol(vehicle, modelYear) -> { pcm, fid, software, throttle, note } | null
// When the engine can't be read from the booking and candidates disagree, pcm
// lists the alternatives with engine qualifiers so the installer confirms on-site.

const R = (models, engines, y0, y1, out) => ({ models, engines, y0, y1, out });
const PCMF = "PCM Flash (Tactrix)";
const VFT = "VFTuner (WiFlash device)";
const CABLE = "ECU direct-connect cable required; if no VFT file, read ECU with PCM Flash (Tactrix) and drop the file into Dropbox";

const RULES = [
  // Tacoma
  R(["tacoma"], ["2.7"], 2005, 2015, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["tacoma"], ["4.0"], 2005, 2015, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild" }),
  R(["tacoma"], ["3.5"], 2016, 2023, { pcm: "[46]", fid: "FID 27", software: PCMF, throttle: "lite/medium AT · mild MT" }),
  R(["tacoma"], ["2.7"], 2016, 2023, { pcm: "[46]", fid: "FID 28", software: PCMF, throttle: "medium" }),
  R(["tacoma"], ["2.4"], 2024, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "enhanced", note: CABLE }),
  // 4Runner
  R(["4runner", "4 runner"], [], 2003, 2004, { pcm: "[35] K-Line", fid: "", software: PCMF + " — K-Line", throttle: "medium", note: "CUW takes ~45 min; TCU flashed separately" }),
  R(["4runner", "4 runner"], [], 2005, 2009, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild" }),
  R(["4runner", "4 runner"], ["4.0", "4.7"], 2010, 2019, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild" }),
  R(["4runner", "4 runner"], ["4.0"], 2020, 2024, { pcm: "[46]", fid: "FID 28", software: PCMF, throttle: "mild" }),
  R(["4runner", "4 runner"], ["2.4"], 2025, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "enhanced", note: CABLE }),
  // FJ Cruiser
  R(["fj"], ["4.0"], 2007, 2014, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild" }),
  // Tundra
  R(["tundra"], ["4.0"], 2007, 2013, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["tundra"], ["4.7"], 2005, 2009, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["tundra"], ["5.7"], 2007, 2017, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild/medium" }),
  R(["tundra"], ["4.6"], 2018, 2019, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["tundra"], ["5.7"], 2018, 2021, { pcm: "[46]", fid: "FID 28", software: PCMF, throttle: "mild/medium" }),
  R(["tundra"], ["3.4", "3.5"], 2022, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "TBD", note: CABLE }),
  // Sequoia
  R(["sequoia"], ["4.7"], 2006, 2009, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["sequoia"], ["5.7"], 2008, 2017, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild/medium" }),
  R(["sequoia"], ["4.6"], 2009, 2017, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild/medium" }),
  R(["sequoia"], ["5.7"], 2018, 2022, { pcm: "[46]", fid: "FID 28", software: PCMF, throttle: "mild/medium" }),
  R(["sequoia"], ["3.4", "3.5"], 2023, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "TBD", note: CABLE }),
  // Land Cruiser / LX
  R(["land cruiser", "lx470", "lx 470"], ["4.7"], 2006, 2007, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild/medium" }),
  R(["land cruiser", "lx570", "lx 570"], ["5.7"], 2008, 2015, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "mild/medium" }),
  R(["land cruiser", "lx570", "lx 570"], ["5.7"], 2016, 2021, { pcm: "[46]", fid: "FID 28", software: PCMF, throttle: "mild/medium" }),
  R(["lc 250", "lc250", "land cruiser"], ["2.4"], 2024, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "enhanced", note: CABLE }),
  // GX
  R(["gx470", "gx 470"], [], 2003, 2004, { pcm: "[35] K-Line", fid: "", software: PCMF + " — K-Line", throttle: "medium", note: "CUW takes ~45 min; TCU flashed separately" }),
  R(["gx470", "gx 470"], [], 2005, 2009, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["gx460", "gx 460"], [], 2010, 2024, { pcm: "[35]", fid: "FID 24", software: PCMF, throttle: "medium" }),
  R(["gx550", "gx 550"], [], 2022, 9999, { pcm: "[95]", fid: "", software: VFT, throttle: "TBD", note: CABLE }),
];

// Per the guide's Note column: 2013-2019 4Runner needs its TCM flashed separately.
function fourRunnerTcmNote(modelKey, year) {
  return /4 ?runner/.test(modelKey) && year >= 2013 && year <= 2019 ? "TCM flashed separately (2013–2019 4Runner)" : "";
}

function pcmProtocol(vehicle, modelYear) {
  const v = String(vehicle == null ? "" : vehicle).toLowerCase();
  if (!v) return null;
  const year = parseInt(modelYear, 10) || parseInt((v.match(/\b(19|20)\d{2}\b/) || [])[0], 10) || 0;
  const engine = (v.match(/\b(\d\.\d)\s*l/) || [])[1] || "";
  const hits = RULES.filter((r) =>
    r.models.some((m) => v.includes(m)) &&
    (!year || (year >= r.y0 && year <= r.y1)) &&
    (r.engines.length === 0 || !engine || r.engines.includes(engine)));
  if (!hits.length) return null;
  const distinct = [...new Set(hits.map((h) => h.out.pcm))];
  if (distinct.length === 1) {
    const h = hits[0];
    const out = { fid: "", note: "", ...h.out };
    const tcm = fourRunnerTcmNote(h.models[0], year);
    if (tcm) out.note = out.note ? out.note + "; " + tcm : tcm;
    return out;
  }
  // Candidates disagree (engine unreadable from the booking): list alternatives.
  const alts = hits.map((h) => `${h.out.pcm} (${h.engines.join("/") || "?"}L)`).join(" or ");
  return { pcm: alts + " — confirm engine", fid: "", software: "", throttle: "confirm engine on-site", note: "" };
}

module.exports = { pcmProtocol };
