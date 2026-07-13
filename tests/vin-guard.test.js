const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compareVin } = require("../netlify/functions/lib/vin-guard.js");

test("check-digit failure → typo warning", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "1,3,14" },
    { vehicle: "2021 Toyota Tundra", modelYear: "2021" });
  assert.equal(r.ok, false);
  assert.ok(r.warnings.some((w) => /mistyped/i.test(w)));
});

test("year mismatch warns with both years", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2024 Toyota Tundra", modelYear: "2024" });
  assert.ok(r.warnings.some((w) => /2021/.test(w) && /2024/.test(w)));
});

test("make/model mismatch warns", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2021 Toyota Tacoma 3.5L V6", modelYear: "2021" });
  assert.ok(r.warnings.some((w) => /Tundra/.test(w)));
});

test("clean match → ok, no warnings", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "2021 Toyota Tundra 5.7L V8", modelYear: "2021" });
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 0);
});

test("blank booking model year → year check skipped", () => {
  const r = compareVin({ modelYear: "2021", make: "TOYOTA", model: "Tundra", errorCode: "0" },
    { vehicle: "Toyota Tundra", modelYear: "" });
  assert.equal(r.ok, true);
});

test("missing decoded fields → no false warnings", () => {
  const r = compareVin({ modelYear: "", make: "", model: "", errorCode: "0" },
    { vehicle: "2021 Toyota Tundra", modelYear: "2021" });
  assert.equal(r.ok, true);
});
