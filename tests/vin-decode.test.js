const { test } = require("node:test");
const assert = require("node:assert/strict");
const { processVinDecode } = require("../netlify/functions/vin-decode.js");

const VIN = "5TFDW5F16MX000000"; // 17 chars, valid check digit
function fakeFetch(results) { return async () => ({ ok: true, json: async () => ({ Results: [results] }) }); }

test("year mismatch → not ok, both years in a warning", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2024 Toyota Tacoma", modelYear: "2024" },
    { fetchImpl: fakeFetch({ ModelYear: 2021, Make: "TOYOTA", Model: "Tundra", ErrorCode: "0" }) });
  assert.equal(out.ok, false);
  assert.equal(out.unavailable, false);
  assert.ok(out.warnings.some((w) => /2021/.test(w) && /2024/.test(w)));
});

test("clean match → ok, no warnings", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2021 Toyota Tundra 5.7L V8", modelYear: "2021" },
    { fetchImpl: fakeFetch({ ModelYear: 2021, Make: "TOYOTA", Model: "Tundra", ErrorCode: "0" }) });
  assert.equal(out.ok, true);
  assert.equal(out.warnings.length, 0);
});

test("NHTSA error → unavailable, non-blocking", async () => {
  const out = await processVinDecode(
    { vin: VIN, vehicle: "2024 Toyota Tacoma", modelYear: "2024" },
    { fetchImpl: async () => { throw new Error("network"); } });
  assert.equal(out.ok, true);
  assert.equal(out.unavailable, true);
});

test("non-17-char VIN → unavailable, fetch not called", async () => {
  let called = false;
  const out = await processVinDecode({ vin: "SHORT", vehicle: "x", modelYear: "" },
    { fetchImpl: async () => { called = true; return { ok: true, json: async () => ({}) }; } });
  assert.equal(out.unavailable, true);
  assert.equal(called, false);
});

test("check-digit failure is caught locally even when NHTSA is down (was: zero warnings)", async () => {
  const out = await processVinDecode(
    { vin: "5TFDW5F17MX000000", vehicle: "2021 Toyota Tundra", modelYear: "2021" },
    { fetchImpl: async () => { throw new Error("network"); } });
  assert.equal(out.ok, false);
  assert.ok(out.warnings.some((w) => /check digit/i.test(w)));
});

test("check-digit warning is not duplicated when NHTSA also flags it", async () => {
  const out = await processVinDecode(
    { vin: "5TFDW5F17MX000000", vehicle: "2021 Toyota Tundra 5.7L V8", modelYear: "2021" },
    { fetchImpl: fakeFetch({ ModelYear: 2021, Make: "TOYOTA", Model: "Tundra", ErrorCode: "1" }) });
  assert.equal(out.ok, false);
  assert.equal(out.warnings.filter((w) => /check digit/i.test(w)).length, 1);
});
