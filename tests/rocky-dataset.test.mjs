// tests/rocky-dataset.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGuides, findByProcedure, byModel } from "../scripts/rocky/lib/dataset.mjs";

const SAMPLE = [
  { "Title": "2007-2021 Toyota Tundra Front Brake Pads And Rotors Replacement Instructions",
    "Model": "Tundra", "Procedure": "Front Brake Pads And Rotors Replacement", "Page URL": "u1" },
  { "Title": "2011-2020 Toyota Sienna Engine Oil Change", "Model": "Sienna", "Procedure": "Engine Oil Change And Filter Replacement", "Page URL": "u2" },
];

test("findByProcedure matches on procedure or title, case-insensitive", () => {
  const hits = findByProcedure(SAMPLE, "front brake");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]["Page URL"], "u1");
});

test("byModel filters exact model, case-insensitive", () => {
  assert.equal(byModel(SAMPLE, "tundra").length, 1);
  assert.equal(byModel(SAMPLE, "Sienna").length, 1);
  assert.equal(byModel(SAMPLE, "Camry").length, 0);
});

test("loadGuides reads the vendored dataset array", () => {
  const g = loadGuides("scripts/rocky/data/toyota-guides.json");
  assert.equal(Array.isArray(g), true);
  assert.equal(g.length, 148);
});
