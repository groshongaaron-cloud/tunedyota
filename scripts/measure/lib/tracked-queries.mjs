// scripts/measure/lib/tracked-queries.mjs
export function loadTrackedQueries(raw) {
  if (!Array.isArray(raw)) throw new Error("tracked-queries must be an array");
  return raw.map((q, i) => {
    for (const k of ["query", "intent", "targetPage"]) {
      if (!q || typeof q[k] !== "string" || !q[k].trim()) {
        throw new Error(`tracked query ${i} missing ${k}`);
      }
    }
    return { query: q.query.trim(), intent: q.intent.trim(), targetPage: q.targetPage.trim() };
  });
}
