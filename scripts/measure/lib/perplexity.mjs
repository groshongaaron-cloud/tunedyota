// scripts/measure/lib/perplexity.mjs
const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions";

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}
function isOurs(domain, ourDomain) {
  return domain === ourDomain || (domain && domain.endsWith(`.${ourDomain}`));
}

export function buildPerplexityBody(query) {
  return {
    model: "sonar",
    messages: [
      { role: "system", content: "Answer concisely and cite your sources." },
      { role: "user", content: query },
    ],
  };
}

export function parsePerplexityResult(query, resp, { ourDomain = "tunedyota.com" } = {}) {
  const citations = (resp && resp.citations) || [];
  const ourCitations = citations.filter((u) => isOurs(domainOf(u), ourDomain));
  const competitors = [...new Set(
    citations.map(domainOf).filter((d) => d && !isOurs(d, ourDomain))
  )];
  return { query, citedUs: ourCitations.length > 0, ourCitations, competitors };
}

export async function probePerplexity({ queries, fetchImpl = fetch, apiKey, ourDomain = "tunedyota.com" }) {
  const out = [];
  for (const q of queries) {
    try {
      const res = await fetchImpl(PERPLEXITY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildPerplexityBody(q.query)),
      });
      if (!res.ok) throw new Error(`Perplexity ${res.status}`);
      const json = await res.json();
      out.push(parsePerplexityResult(q.query, json, { ourDomain }));
    } catch (e) {
      out.push({ query: q.query, citedUs: false, ourCitations: [], competitors: [], error: e.message });
    }
  }
  return out;
}
