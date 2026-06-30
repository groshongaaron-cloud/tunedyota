// scripts/measure/lib/snapshot.mjs
const CTR_CURVE = { 1: 0.28, 2: 0.15, 3: 0.10, 4: 0.07, 5: 0.05 };

export function expectedCtr(position) {
  if (!position || position < 1) return 0;
  const p = Math.round(position);
  if (p <= 5) return CTR_CURVE[p];
  if (p <= 10) return 0.03;
  return 0.01;
}

function rate(arr, pred) {
  return arr.length ? Number((arr.filter(pred).length / arr.length).toFixed(2)) : 0;
}

export function assembleSnapshot({ date, gsc, webSearch = [], perplexity = [], errors = [] }) {
  const ctrOpportunities = (gsc?.tracked || [])
    .filter((r) => r.impressions >= 100 && r.position > 0 && r.position <= 10 && r.ctr < 0.7 * expectedCtr(r.position))
    .map((r) => r.query);
  return {
    date,
    gsc: gsc || null,
    ai: { webSearch, perplexity },
    summary: {
      aiPresenceRate: rate(webSearch, (r) => r.present),
      perplexityCiteRate: rate(perplexity, (r) => r.citedUs),
      ctrOpportunities,
    },
    meta: { errors },
  };
}

export function diffSnapshots(prev, curr) {
  if (!prev) return { baseline: true, movers: [], ai: { aiPresenceDelta: 0, perplexityCiteDelta: 0 } };
  const prevByQuery = new Map((prev.gsc?.tracked || []).map((r) => [r.query.toLowerCase(), r]));
  const movers = (curr.gsc?.tracked || [])
    .map((r) => {
      const p = prevByQuery.get(r.query.toLowerCase());
      return p ? { query: r.query, positionDelta: Number((p.position - r.position).toFixed(1)), ctrDelta: Number((r.ctr - p.ctr).toFixed(4)) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.positionDelta) - Math.abs(a.positionDelta));
  return {
    baseline: false,
    movers,
    ai: {
      aiPresenceDelta: Number((curr.summary.aiPresenceRate - prev.summary.aiPresenceRate).toFixed(2)),
      perplexityCiteDelta: Number((curr.summary.perplexityCiteRate - prev.summary.perplexityCiteRate).toFixed(2)),
    },
  };
}

export function selectLatestPrior(filenames, beforeDate) {
  return filenames
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .filter((d) => d < beforeDate)
    .sort()
    .pop() || null;
}
