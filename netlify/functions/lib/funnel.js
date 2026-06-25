// Pure: turn Funnel Events rows into a distinct-sessions-per-step drop-off funnel.
const STEP_LABELS = { 0: "make", 1: "model", 2: "config", 3: "goals", 4: "result", 5: "book", 6: "outcome" };

function aggregateFunnel(events) {
  const perStep = {};            // step -> Set of session ids that reached it
  for (let s = 0; s <= 6; s++) perStep[s] = new Set();
  for (const e of events || []) {
    const step = Number(e.Step);
    if (!Number.isInteger(step) || step < 0 || step > 6) continue;
    if (e.Session) perStep[step].add(String(e.Session));
  }
  const base = perStep[0].size;
  const steps = [];
  let prev = null;
  for (let s = 0; s <= 6; s++) {
    const sessions = perStep[s].size;
    const dropPct = prev && prev > 0 ? Math.round(((prev - sessions) / prev) * 100) : 0;
    const overallPct = base > 0 ? Math.round((sessions / base) * 100) : 0;
    steps.push({ step: s, name: STEP_LABELS[s], sessions, dropPct, overallPct });
    prev = sessions;
  }
  return { steps, totalSessions: base };
}
module.exports = { aggregateFunnel, STEP_LABELS };
