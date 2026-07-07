// Pure dealer scoring. score = truck volume + proximity + enthusiast + ownership.
// Null owner-signals are scored provisionally (truckVolume→med) and flagged via
// needsSignal so the tier is real but marked provisional until the owner fills in.
const TRUCK_PTS = { high: 3, med: 2, low: 1 };
const PROX_PTS = { close: 2, mid: 1 };
const STAGES = ["Prospect", "Contacted", "Kit Sent", "Pilot", "Active"];

function inferOwnership(group) {
  return group ? "group" : "independent";
}

function scoreDealer(d) {
  const truckPts = d.truckVolume == null ? 2 : (TRUCK_PTS[d.truckVolume] ?? 2);
  const proxPts = PROX_PTS[d.proximity] ?? 1;
  const enthPts = d.enthusiastPosture === true ? 1 : 0;
  const ownPts = d.ownershipType === "independent" ? 1 : 0;
  const score = truckPts + proxPts + enthPts + ownPts;
  const tier = score >= 6 ? "A" : score >= 4 ? "B" : "C";
  const needsSignal = d.truckVolume == null || d.enthusiastPosture == null;
  return { score, tier, needsSignal };
}

module.exports = { TRUCK_PTS, PROX_PTS, STAGES, inferOwnership, scoreDealer };
