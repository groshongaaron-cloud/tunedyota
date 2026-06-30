// scripts/measure/lib/report.mjs
const pct = (n) => `${Math.round((n || 0) * 100)}%`;
const ptsDelta = (n) => {
  const v = Math.round((n || 0) * 100);
  return v === 0 ? "flat" : `${v > 0 ? "+" : ""}${v}pts`;
};

export function renderReport(snapshot, diff) {
  const s = snapshot.summary;
  const lines = [];
  lines.push(`*Search + AI visibility — ${snapshot.date}*`);

  if (diff.baseline) {
    lines.push(`Baseline established. AI presence ${pct(s.aiPresenceRate)}, Perplexity cites ${pct(s.perplexityCiteRate)}.`);
  } else {
    lines.push(`AI presence ${pct(s.aiPresenceRate)} (${ptsDelta(diff.ai.aiPresenceDelta)}), Perplexity cites ${pct(s.perplexityCiteRate)} (${ptsDelta(diff.ai.perplexityCiteDelta)}).`);
    const top = (diff.movers || []).slice(0, 5)
      .map((m) => `• ${m.query}: position ${m.positionDelta >= 0 ? "+" : ""}${m.positionDelta}`)
      .join("\n");
    if (top) lines.push(`*Top movers:*\n${top}`);
  }

  if (s.ctrOpportunities.length) {
    lines.push(`*CTR opportunities (${s.ctrOpportunities.length}):* ${s.ctrOpportunities.join(", ")}`);
  }

  const errors = snapshot.meta?.errors || [];
  if (errors.length) lines.push(`⚠ *Probe errors:* ${errors.join("; ")}`);

  return lines.join("\n");
}
