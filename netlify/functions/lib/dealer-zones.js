// Dealer prospecting zones: which rep owns which state, which cities count as
// "close" to that rep's home base, and which dealer names belong to a known
// multi-store group. Pure data + helpers, no I/O. Mirrors the coverage map in
// the strategy brief (§5.2) and installer home bases.
const STATE_REP = { MN: "aaron", IA: "aaron", ND: "aaron", WI: "noah", SD: "cody", NE: "cody" };

// Lowercased home-metro city clusters → proximity "close". Owner-overridable per
// dealer in dealers.json. Aaron = Twin Cities metro; Cody = SD anchors + Omaha;
// Noah = Sheboygan/Milwaukee/Green Bay corridor.
const CLOSE_CITIES = {
  aaron: ["rosemount", "bloomington", "burnsville", "brooklyn center", "coon rapids",
    "golden valley", "inver grove heights", "maplewood", "minneapolis", "saint paul",
    "st paul", "eagan", "apple valley", "lakeville", "richfield", "edina",
    "brooklyn park", "plymouth", "maple grove", "shakopee", "white bear lake", "roseville"],
  cody: ["sioux falls", "rapid city", "omaha"],
  noah: ["sheboygan", "milwaukee", "green bay", "grafton", "mequon", "brookfield", "waukesha"],
};

// Group display name → lowercased name-fragments identifying member stores (§5.1).
const GROUP_FRAGMENTS = {
  Baxter: ["baxter"],
  Corwin: ["corwin"],
  "Gregg Young": ["gregg young"],
  Dahl: ["dahl"],
  Billion: ["billion"],
  LeadCar: ["leadcar"],
  Luther: ["luther"],
  Walser: ["walser"],
  Deery: ["deery"],
};

function assignRep(state) {
  return STATE_REP[String(state || "").toUpperCase().trim()] || null;
}
function computeProximity(city, rep) {
  const c = String(city || "").toLowerCase().trim();
  return (CLOSE_CITIES[rep] || []).includes(c) ? "close" : "mid";
}
function tagGroup(name) {
  const n = String(name || "").toLowerCase();
  for (const [group, frags] of Object.entries(GROUP_FRAGMENTS)) {
    if (frags.some((f) => n.includes(f))) return group;
  }
  return null;
}

module.exports = { STATE_REP, CLOSE_CITIES, GROUP_FRAGMENTS, assignRep, computeProximity, tagGroup };
