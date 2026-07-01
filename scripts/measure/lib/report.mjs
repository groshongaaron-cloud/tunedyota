// scripts/measure/lib/report.mjs
const pct = (n) => `${Math.round((n || 0) * 100)}%`;
const ptsDelta = (n) => {
  const v = Math.round((n || 0) * 100);
  return v === 0 ? "flat" : `${v > 0 ? "+" : ""}${v}pts`;
};

export function renderReport(snapshot, diff) {
  const s = snapshot.summary;
  // Only report a probe's stat if that probe actually ran — a local run that skips
  // the WebSearch probe should not show a misleading "AI presence 0%".
  const hasWeb = ((snapshot.ai?.webSearch) || []).length > 0;
  const hasPplx = ((snapshot.ai?.perplexity) || []).length > 0;
  const lines = [];
  lines.push(`*Search + AI visibility — ${snapshot.date}*`);

  if (diff.baseline) {
    const parts = [];
    if (hasWeb) parts.push(`AI presence ${pct(s.aiPresenceRate)}`);
    if (hasPplx) parts.push(`Perplexity cites ${pct(s.perplexityCiteRate)}`);
    lines.push(`Baseline established.${parts.length ? ` ${parts.join(", ")}.` : ""}`);
  } else {
    const parts = [];
    if (hasWeb) parts.push(`AI presence ${pct(s.aiPresenceRate)} (${ptsDelta(diff.ai?.aiPresenceDelta)})`);
    if (hasPplx) parts.push(`Perplexity cites ${pct(s.perplexityCiteRate)} (${ptsDelta(diff.ai?.perplexityCiteDelta)})`);
    if (parts.length) lines.push(`${parts.join(", ")}.`);
    const top = (diff.movers || []).slice(0, 5)
      // positionDelta = prev.position - curr.position, so a positive value (+) means rank IMPROVED
      .map((m) => `• ${m.query}: position ${m.positionDelta >= 0 ? "+" : ""}${m.positionDelta}`)
      .join("\n");
    if (top) lines.push(`*Top movers:*\n${top}`);
  }

  if ((s.ctrOpportunities || []).length) {
    lines.push(`*CTR opportunities (${s.ctrOpportunities.length}):* ${s.ctrOpportunities.join(", ")}`);
  }

  const errors = snapshot.meta?.errors || [];
  if (errors.length) lines.push(`⚠ *Probe errors:* ${errors.join("; ")}`);

  return lines.join("\n");
}
