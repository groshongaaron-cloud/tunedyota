// tests/amsoil-fleet-audit.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");

async function mod() { return import("../scripts/amsoil-fleet-audit.mjs"); }

test("Toyota vehicle rows resolve through the garage with verified quantities + stock numbers", async () => {
  const { rowsForUnit } = await mod();
  const rows = rowsForUnit({ unit: "2014 Tundra crew", type: "vehicle", vehicle: "Toyota Tundra", year: 2014 });
  const oil = rows.find((r) => /Motor Oil/i.test(r.product));
  assert.ok(oil, "engine oil row present");
  assert.match(oil.qty, /^7\.9 qt$/); // 2013-2017 5.7L verified capacity
  assert.equal(oil.note, "verified capacity");
  assert.ok(rows.every((r) => !/Transmission Fluid.*qt/.test(r.product + r.qty)), "no transmission quantity");
});

test("commercial equipment maps to the commercial line without invented numbers", async () => {
  const { rowsForUnit } = await mod();
  const saber = rowsForUnit({ unit: "Stihl trimmers x6", type: "2-stroke" });
  assert.match(saber[0].product, /SABER Professional/);
  assert.match(saber[0].qty, /100:1/);
  const zt = rowsForUnit({ unit: "Exmark x3", type: "zero-turn" });
  assert.equal(zt.length, 2); // engine + hydro
  assert.match(zt[1].product, /Hydrostatic/);
  assert.equal(zt[1].qty, "per OEM manual");
});

test("buildAudit and buildBlankForm produce branded printable pages", async () => {
  const { buildAudit, buildBlankForm } = await mod();
  const audit = buildAudit({ business: "OZ Lawn Care", contact: "Mike", units: [
    { unit: "2014 Tundra", type: "vehicle", vehicle: "Toyota Tundra", year: 2014 },
    { unit: "Trimmers", type: "2-stroke" } ] });
  assert.match(audit, /Fleet Fluid Audit/);
  assert.match(audit, /OZ Lawn Care/);
  assert.match(audit, /✓ verified/);
  assert.match(audit, /\(612\) 406-7117/);
  assert.match(audit, /commercial account/i);
  const blank = buildBlankForm();
  assert.match(blank, /capture form/i);
  assert.match(blank, /Pain points/);
  assert.ok((blank.match(/class="blank"/g) || []).length >= 10, "enough blank rows to handwrite a fleet");
});
