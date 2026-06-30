// scripts/measure/lib/gsc.mjs
export function buildSearchAnalyticsBody({ startDate, endDate, dimensions = ["query", "page"], rowLimit = 1000 }) {
  return { startDate, endDate, dimensions, rowLimit, dataState: "final" };
}

export function normalizeRows(apiRows = [], dimensions = ["query", "page"]) {
  return apiRows.map((r) => {
    const out = { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 };
    (r.keys || []).forEach((k, i) => { out[dimensions[i]] = k; });
    return out;
  });
}

export async function pullGsc({ getAccessToken, fetchImpl = fetch, property, startDate, endDate, trackedQueries = [] }) {
  const token = await getAccessToken();
  const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const call = async (body) => {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GSC ${res.status}`);
    const json = await res.json();
    return json.rows || [];
  };
  const byQueryPage = normalizeRows(
    await call(buildSearchAnalyticsBody({ startDate, endDate, dimensions: ["query", "page"] })),
    ["query", "page"]
  );
  const wanted = new Set(trackedQueries.map((q) => q.query.toLowerCase()));
  const tracked = byQueryPage.filter((r) => wanted.has((r.query || "").toLowerCase()));
  const topPages = normalizeRows(
    await call(buildSearchAnalyticsBody({ startDate, endDate, dimensions: ["page"], rowLimit: 25 })),
    ["page"]
  );
  return { range: { start: startDate, end: endDate }, tracked, topPages };
}
