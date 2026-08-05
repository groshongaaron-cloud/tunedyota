// scripts/rocky/lib/dataset.mjs
import fs from "node:fs";

export function loadGuides(path) {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error("dataset must be a JSON array");
  return raw;
}

export function findByProcedure(guides, needle) {
  const n = String(needle).toLowerCase();
  return guides.filter(
    (g) =>
      String(g.Procedure || "").toLowerCase().includes(n) ||
      String(g.Title || "").toLowerCase().includes(n)
  );
}

export function byModel(guides, model) {
  const m = String(model).toLowerCase();
  return guides.filter((g) => String(g.Model || "").toLowerCase() === m);
}
