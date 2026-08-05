const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deriveTunes, toPurchaseView, mergePurchases } = require("../netlify/functions/lib/purchases-view.js");

test("deriveTunes makes one OTT Tune entry per COMPLETED booking", () => {
  const t = deriveTunes([
    { id: "bk1", status: "Completed", dateISO: "2022-05-01", vehicle: "2022 Tacoma", calibration: "OTT Stage 1", installer: "aaron", certSent: true },
    { id: "bk2", status: "Booked", dateISO: "2026-09-01", vehicle: "4Runner" },
  ]);
  assert.equal(t.length, 1);
  assert.equal(t[0].category, "OTT Tune");
  assert.equal(t[0].source, "booking");
  assert.ok(t[0].item.includes("Tacoma"));
  assert.equal(t[0].cert, true);
});

test("toPurchaseView maps a manual Purchases row", () => {
  const v = toPurchaseView({ id: "p1", fields: { Date: "2026-08-01", Category: "Banks", Item: "PedalMonster", Amount: 349, Vehicle: "2021 4Runner", Installer: "cody", Notes: "installed same day" } });
  assert.equal(v.source, "manual");
  assert.equal(v.category, "Banks");
  assert.equal(v.item, "PedalMonster");
  assert.equal(v.amount, 349);
});

test("mergePurchases combines and sorts newest-first", () => {
  const out = mergePurchases(
    [{ source: "booking", date: "2022-05-01", category: "OTT Tune", item: "tune" }],
    [{ source: "manual", date: "2026-08-01", category: "Banks", item: "PedalMonster" }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].date, "2026-08-01"); // newest first
});
