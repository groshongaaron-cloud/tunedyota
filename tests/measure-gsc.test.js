// tests/measure-gsc.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
let M;
test.before(async () => { M = await import("../scripts/measure/lib/gsc.mjs"); });

test("buildSearchAnalyticsBody sets final dataState and defaults", () => {
  const b = M.buildSearchAnalyticsBody({ startDate: "2026-06-01", endDate: "2026-06-28" });
  assert.equal(b.startDate, "2026-06-01");
  assert.deepEqual(b.dimensions, ["query", "page"]);
  assert.equal(b.dataState, "final");
});

test("normalizeRows maps keys onto dimension names with metric defaults", () => {
  const rows = M.normalizeRows([{ keys: ["ott tune cost", "https://tunedyota.com/ott-tune-cost"], clicks: 3, impressions: 200, ctr: 0.015, position: 4.2 }], ["query", "page"]);
  assert.deepEqual(rows[0], { clicks: 3, impressions: 200, ctr: 0.015, position: 4.2, query: "ott tune cost", page: "https://tunedyota.com/ott-tune-cost" });
});

test("pullGsc filters tracked rows by query and returns top pages", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const rows = body.dimensions.length === 2
      ? [{ keys: ["ott tune cost", "https://tunedyota.com/ott-tune-cost"], clicks: 3, impressions: 200, ctr: 0.015, position: 4 },
         { keys: ["unrelated", "https://tunedyota.com/x"], clicks: 1, impressions: 5, ctr: 0.2, position: 9 }]
      : [{ keys: ["https://tunedyota.com/"], clicks: 50, impressions: 4000, ctr: 0.0125, position: 6 }];
    return { ok: true, json: async () => ({ rows }) };
  };
  const out = await M.pullGsc({
    getAccessToken: async () => "tok",
    fetchImpl,
    property: "sc-domain:tunedyota.com",
    startDate: "2026-06-01", endDate: "2026-06-28",
    trackedQueries: [{ query: "ott tune cost" }],
  });
  assert.equal(out.tracked.length, 1);
  assert.equal(out.tracked[0].query, "ott tune cost");
  assert.equal(out.topPages.length, 1);
  assert.equal(out.range.end, "2026-06-28");
  assert.equal(calls.length, 2);
});

test("pullGsc throws on a non-ok response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) });
  await assert.rejects(
    M.pullGsc({ getAccessToken: async () => "tok", fetchImpl, property: "p", startDate: "a", endDate: "b" }),
    /GSC 403/
  );
});
