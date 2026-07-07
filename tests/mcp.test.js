const { test } = require("node:test");
const assert = require("node:assert/strict");
const { handleRequest } = require("../netlify/functions/mcp.js");

const NOW = new Date("2026-07-07T12:00:00Z");
function fakeFetch({ taken = [] } = {}) {
  return async (url) => {
    if (String(url).includes("docs.google.com")) return { ok: false };
    if (String(url).includes("api.airtable.com")) return { ok: true, json: async () => ({ records: taken.map((s) => ({ fields: { Slot: s } })) }) };
    return { ok: false };
  };
}
function deps(taken = []) {
  return { fetchImpl: fakeFetch({ taken }), env: { WEBMCP_ENABLED: "1", EVENTS_SHEET_ID: "", AIRTABLE_TOKEN: "t", AIRTABLE_BASE_ID: "b" }, log: { warn() {}, error() {} }, now: NOW };
}

test("disabled by default → JSON-RPC error, HTTP 503", async () => {
  const d = { fetchImpl: fakeFetch(), env: { EVENTS_SHEET_ID: "" }, log: { warn() {}, error() {} }, now: NOW };
  const out = await handleRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, d);
  assert.equal(out.status, 503);
  assert.equal(out.json.error.code, -32000);
});
test("initialize returns protocol + serverInfo", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, deps());
  assert.equal(out.status, 200);
  assert.equal(out.json.result.serverInfo.name, "tunedyota-webmcp");
  assert.ok(out.json.result.protocolVersion);
});
test("tools/list returns the 3 read-only tools", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, deps());
  const names = out.json.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["find_tuning_events", "check_event_availability", "get_tune_pricing"]);
});
test("find_tuning_events filters by state and returns upcoming events soonest-first", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "find_tuning_events", arguments: { state: "MN" } } }, deps());
  const data = JSON.parse(out.json.result.content[0].text);
  assert.ok(data.count > 0);
  assert.ok(data.events.every((e) => e.state === "MN"));
  assert.ok(data.events.every((e) => e.dateISO >= "2026-07-07"));
  const ds = data.events.map((e) => e.dateISO);
  assert.deepEqual(ds, [...ds].sort());
});
test("get_tune_pricing returns guidance + exact-price link (no fabricated per-vehicle price)", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_tune_pricing", arguments: {} } }, deps());
  const data = JSON.parse(out.json.result.content[0].text);
  assert.match(data.ottTuneFrom, /\$400/);
  assert.match(data.exactPrice, /find-your-exact-tune/);
});
test("check_event_availability returns upcoming dates + open slot counts", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "check_event_availability", arguments: { city: "Twin Cities" } } }, deps([]));
  const data = JSON.parse(out.json.result.content[0].text);
  assert.equal(data.hasEvent, true);
  assert.ok(data.events.length >= 1);
  assert.equal(data.events[0].openSlots, 12); // none taken
});
test("unknown tool → isError result (not a protocol crash)", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope", arguments: {} } }, deps());
  assert.equal(out.json.result.isError, true);
});
test("unknown method → -32601", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", id: 7, method: "bogus" }, deps());
  assert.equal(out.json.error.code, -32601);
});
test("notifications get no response body", async () => {
  const out = await handleRequest({ jsonrpc: "2.0", method: "notifications/initialized" }, deps());
  assert.equal(out.status, 200);
  assert.deepEqual(out.json, {});
});
