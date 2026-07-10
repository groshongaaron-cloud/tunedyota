// scripts/amsoil/lib/verify.mjs
// Pure helpers for REVIEWING and VERIFYING per-platform AMSOIL fluid data in
// site/amsoil-garage.json. No fs, no network — the CLI (verify-platform.mjs) does IO.
//
// Why review-then-confirm (not a blind flag flip): a generation's `verified: true`
// publishes its fluid CAPACITIES + drain INTERVALS to the garage picker AND the
// per-vehicle SEO pages. Those numbers are Toyota-OEM-spec DRAFTS until an installer
// confirms them (docs/amsoil/fluid-data-verification.md). So the flow is: review the
// draft, correct any capacity with setCapacity(), then setVerified() to go live.

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

// All platforms with their verified rollup. cat = parsed amsoil-garage.json.
export function platforms(cat) {
  const out = [];
  for (const make of Object.keys(cat.vehicles)) {
    for (const model of Object.keys(cat.vehicles[make])) {
      const gens = cat.vehicles[make][model];
      out.push({
        make, model, name: `${make} ${model}`,
        total: gens.length,
        verified: gens.filter((g) => g.verified).length,
        years: gens.map((g) => ({ y: g.y, e: g.e, verified: !!g.verified })),
      });
    }
  }
  return out;
}

// Resolve a platform by "Make Model" (or a unique bare model name). Throws if not
// found or ambiguous, with a helpful list — never guesses.
export function findModel(cat, name) {
  const q = norm(name);
  const matches = [];
  for (const make of Object.keys(cat.vehicles)) {
    for (const model of Object.keys(cat.vehicles[make])) {
      if (norm(`${make} ${model}`) === q || norm(model) === q) {
        matches.push({ make, model, gens: cat.vehicles[make][model] });
      }
    }
  }
  if (matches.length === 1) return matches[0];
  const all = platforms(cat).map((p) => p.name).join(", ");
  if (matches.length === 0) throw new Error(`No platform matches "${name}". Known platforms: ${all}`);
  throw new Error(`"${name}" is ambiguous — qualify with the make. Known platforms: ${all}`);
}

// Structured, printable review of a platform's draft specs.
export function review(cat, name) {
  const { make, model, gens } = findModel(cat, name);
  return {
    name: `${make} ${model}`,
    generations: gens.map((g) => ({
      y: g.y, e: g.e, verified: !!g.verified,
      systems: (g.systems || []).map((s) => ({
        system: s.system,
        product: (cat.products[s.sku] || {}).name || s.sku,
        capacity: s.capacity, unit: s.unit,
        factoryInterval: s.factoryInterval, tunedInterval: s.tunedInterval,
      })),
    })),
  };
}

// Select the generations of a platform, optionally narrowed to one year string.
function selectGens(cat, name, year) {
  const { make, model, gens } = findModel(cat, name);
  if (year == null) return { make, model, gens };
  const hit = gens.filter((g) => String(g.y) === String(year));
  if (!hit.length) {
    throw new Error(`No "${make} ${model}" generation with year "${year}". Years: ${gens.map((g) => g.y).join(", ")}`);
  }
  return { make, model, gens: hit };
}

// Set/clear the verified flag. MUTATES cat. Returns what changed.
export function setVerified(cat, name, { year = null, value = true } = {}) {
  const { make, model, gens } = selectGens(cat, name, year);
  const changed = [];
  for (const g of gens) {
    if (g.verified !== value) { g.verified = value; changed.push(g.y); }
  }
  return { name: `${make} ${model}`, value, changed, unchanged: gens.length - changed.length };
}

// Correct a capacity on one generation's system before verifying. MUTATES cat.
// `capacity` is a number; `systemName` matches the system's label (case-insensitive).
export function setCapacity(cat, name, year, systemName, capacity) {
  if (year == null) throw new Error("setCapacity requires a specific year");
  const num = Number(capacity);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Capacity must be a positive number, got "${capacity}"`);
  const { make, model, gens } = selectGens(cat, name, year);
  const g = gens[0];
  const sys = (g.systems || []).find((s) => norm(s.system) === norm(systemName));
  if (!sys) throw new Error(`No system "${systemName}" on ${make} ${model} ${g.y}. Systems: ${g.systems.map((s) => s.system).join(", ")}`);
  const before = sys.capacity;
  sys.capacity = num;
  return { name: `${make} ${model}`, year: g.y, system: sys.system, before, after: num };
}
