// tests/measure-perplexity.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/perplexity.mjs"); });

test("buildPerplexityBody uses the sonar model and carries the query", () => {
  const b = M.buildPerplexityBody("is an ott tune worth it");
  assert.equal(b.model, "sonar");
  assert.equal(b.messages.at(-1).content, "is an ott tune worth it");
});

test("parsePerplexityResult flags our domain (incl. subdomain) and lists competitors", () => {
  const resp = { citations: ["https://www.tunedyota.com/is-the-ott-tune-worth-it", "https://blog.tunedyota.com/x", "https://example.com/a", "https://rival.com/b"] };
  const r = M.parsePerplexityResult("is an ott tune worth it", resp, { ourDomain: "tunedyota.com" });
  assert.equal(r.citedUs, true);
  assert.equal(r.ourCitations.length, 2);
  assert.deepEqual(r.competitors.sort(), ["example.com", "rival.com"]);
});

test("parsePerplexityResult handles no citations", () => {
  const r = M.parsePerplexityResult("q", {}, { ourDomain: "tunedyota.com" });
  assert.equal(r.citedUs, false);
  assert.deepEqual(r.competitors, []);
});

test("probePerplexity records a per-query error instead of throwing", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    if (n === 1) return { ok: true, json: async () => ({ citations: ["https://tunedyota.com/x"] }) };
    throw new Error("rate limited");
  };
  const out = await M.probePerplexity({
    queries: [{ query: "a" }, { query: "b" }],
    fetchImpl, apiKey: "k", ourDomain: "tunedyota.com",
  });
  assert.equal(out[0].citedUs, true);
  assert.equal(out[1].error, "rate limited");
  assert.equal(out[1].citedUs, false);
});
