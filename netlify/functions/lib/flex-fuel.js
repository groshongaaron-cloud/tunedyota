// OTT Policy 0011 — Flex Fuel Tundra: ethanol content MUST be reset to 0% after
// the INITIAL OTT calibration on any flex-fuel-capable Tundra, or the learned
// ethanol value locks in. Flex-fuel capability can't be told from the booking
// (it's marked "Flex Fuel Capable" on the fuel cap), so we flag EVERY Tundra on
// the installer's day-of itinerary for the installer to check and act on.
const FLEX_FUEL_NOTE =
  "Flex Fuel Tundra (Policy 0011): if the fuel cap reads “Flex Fuel Capable,” reset ethanol content to 0% after the initial OTT flash.";

function flexFuelNote(vehicle) {
  return /\btundra\b/i.test(String(vehicle == null ? "" : vehicle)) ? FLEX_FUEL_NOTE : "";
}

module.exports = { flexFuelNote, FLEX_FUEL_NOTE };
