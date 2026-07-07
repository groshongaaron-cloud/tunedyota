# Dealer Pipeline (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 77-dealer Toyota master list into a repo-side, rep-assigned, group-tagged, A/B/C-scored prospecting pipeline with a fill-in worksheet for the two owner-supplied scoring signals.

**Architecture:** Pure CommonJS config + scoring modules under `netlify/functions/lib/` (require-able by `node --test`), a dependency-free `.xlsx` reader mirroring the existing `lib/xlsx-writer.js`, two one-shot CommonJS scripts (ingest + score/generate), a JSON registry, and two generated markdown views. Scoring is deterministic and provisional until the owner fills `truckVolume` + `enthusiastPosture`.

**Tech Stack:** Node.js (CommonJS), `node:test`, `node:zlib` (dependency-free xlsx inflate). No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-07-dealer-network-partnership-design.md` (Part B).

---

## File Structure

- **Create** `netlify/functions/lib/dealer-zones.js` — state→rep map, home-metro proximity clusters, multi-store group fragments, and pure helpers (`assignRep`, `computeProximity`, `tagGroup`).
- **Create** `netlify/functions/lib/dealer-scoring.js` — pure scoring (`scoreDealer`, `inferOwnership`, `STAGES` enum).
- **Create** `netlify/functions/lib/xlsx-reader.js` — dependency-free `.xlsx` → array-of-row-objects reader (central-directory ZIP parse + `inflateRawSync`).
- **Create** `netlify/functions/lib/dealers.json` — the registry (seeded by ingest, computed fields written by scorer).
- **Create** `scripts/ingest-dealers.js` — parse `docs/dealers/dealer-master-list.xlsx` → seed/merge `dealers.json` identity + computed fields, preserving living state.
- **Create** `scripts/score-dealers.js` — recompute scores, write back, regenerate the two markdown views.
- **Create** `docs/dealers/dealer-pipeline.md` — generated read-only dashboard (ranked, grouped by rep).
- **Create** `docs/dealers/dealer-scoring-worksheet.md` — generated editable fill-in aid (blank signal columns).
- **Create** `tests/dealers.test.js` — unit tests (zones + scoring + reader) and registry-integrity tests over the seeded `dealers.json`.
- **Modify** `package.json` — add `"ingest:dealers"` and `"score:dealers"` npm scripts.

---

## Task 1: Zone map & helpers

**Files:**
- Create: `netlify/functions/lib/dealer-zones.js`
- Test: `tests/dealers.test.js`

- [ ] **Step 1: Write the failing test** (create `tests/dealers.test.js`)

```js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { assignRep, computeProximity, tagGroup, STATE_REP } = require("../netlify/functions/lib/dealer-zones.js");

test("assignRep maps each state to the correct rep", () => {
  assert.equal(assignRep("MN"), "aaron");
  assert.equal(assignRep("IA"), "aaron");
  assert.equal(assignRep("ND"), "aaron");
  assert.equal(assignRep("WI"), "noah");
  assert.equal(assignRep("SD"), "cody");
  assert.equal(assignRep("NE"), "cody");
  assert.equal(assignRep("mn"), "aaron"); // case-insensitive
  assert.equal(assignRep("XX"), null);    // unknown → null
});

test("computeProximity is 'close' for home-metro cities, 'mid' otherwise", () => {
  assert.equal(computeProximity("Burnsville", "aaron"), "close");
  assert.equal(computeProximity("burnsville", "aaron"), "close"); // case-insensitive
  assert.equal(computeProximity("Bemidji", "aaron"), "mid");
  assert.equal(computeProximity("Sioux Falls", "cody"), "close");
  assert.equal(computeProximity("Sheboygan", "noah"), "close");
});

test("tagGroup name-matches multi-store groups, else null", () => {
  assert.equal(tagGroup("Walser Bloomington Toyota"), "Walser");
  assert.equal(tagGroup("Luther Brookdale Toyota"), "Luther");
  assert.equal(tagGroup("Lake Country Toyota"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dealers.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/dealer-zones.js'`

- [ ] **Step 3: Write minimal implementation** (`netlify/functions/lib/dealer-zones.js`)

```js
// Dealer prospecting zones: which rep owns which state, which cities count as
// "close" to that rep's home base, and which dealer names belong to a known
// multi-store group. Pure data + helpers, no I/O. Mirrors the coverage map in
// the strategy brief (§5.2) and installer home bases.
const STATE_REP = { MN: "aaron", IA: "aaron", ND: "aaron", WI: "noah", SD: "cody", NE: "cody" };

// Lowercased home-metro city clusters → proximity "close". Owner-overridable per
// dealer in dealers.json. Aaron = Twin Cities metro; Cody = SD anchors + Omaha;
// Noah = Sheboygan/Milwaukee/Green Bay corridor.
const CLOSE_CITIES = {
  aaron: ["rosemount", "bloomington", "burnsville", "brooklyn center", "coon rapids",
    "golden valley", "inver grove heights", "maplewood", "minneapolis", "saint paul",
    "st paul", "eagan", "apple valley", "lakeville", "richfield", "edina",
    "brooklyn park", "plymouth", "maple grove", "shakopee", "white bear lake", "roseville"],
  cody: ["sioux falls", "rapid city", "omaha"],
  noah: ["sheboygan", "milwaukee", "green bay", "grafton", "mequon", "brookfield", "waukesha"],
};

// Group display name → lowercased name-fragments identifying member stores (§5.1).
const GROUP_FRAGMENTS = {
  Baxter: ["baxter"],
  Corwin: ["corwin"],
  "Gregg Young": ["gregg young"],
  Dahl: ["dahl"],
  Billion: ["billion"],
  LeadCar: ["leadcar"],
  Luther: ["luther"],
  Walser: ["walser"],
  Deery: ["deery"],
};

function assignRep(state) {
  return STATE_REP[String(state || "").toUpperCase().trim()] || null;
}
function computeProximity(city, rep) {
  const c = String(city || "").toLowerCase().trim();
  return (CLOSE_CITIES[rep] || []).includes(c) ? "close" : "mid";
}
function tagGroup(name) {
  const n = String(name || "").toLowerCase();
  for (const [group, frags] of Object.entries(GROUP_FRAGMENTS)) {
    if (frags.some((f) => n.includes(f))) return group;
  }
  return null;
}

module.exports = { STATE_REP, CLOSE_CITIES, GROUP_FRAGMENTS, assignRep, computeProximity, tagGroup };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dealers.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/dealer-zones.js tests/dealers.test.js
git commit -m "feat(dealers): zone map, proximity, and group-tag helpers"
```

---

## Task 2: Scoring module

**Files:**
- Create: `netlify/functions/lib/dealer-scoring.js`
- Test: `tests/dealers.test.js` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/dealers.test.js`)

```js
const { scoreDealer, inferOwnership, STAGES } = require("../netlify/functions/lib/dealer-scoring.js");

test("inferOwnership: group present → group, else independent", () => {
  assert.equal(inferOwnership("Luther"), "group");
  assert.equal(inferOwnership(null), "independent");
});

test("scoreDealer: fully-signalled A-tier", () => {
  const r = scoreDealer({ truckVolume: "high", proximity: "close", enthusiastPosture: true, ownershipType: "independent" });
  assert.equal(r.score, 7); // 3+2+1+1
  assert.equal(r.tier, "A");
  assert.equal(r.needsSignal, false);
});

test("scoreDealer: null signals score provisionally and flag needsSignal", () => {
  const r = scoreDealer({ truckVolume: null, proximity: "mid", enthusiastPosture: null, ownershipType: "independent" });
  assert.equal(r.score, 4); // 2(null→med)+1+0+1
  assert.equal(r.tier, "B");
  assert.equal(r.needsSignal, true);
});

test("scoreDealer: group store with null signals defaults to C", () => {
  const r = scoreDealer({ truckVolume: null, proximity: "mid", enthusiastPosture: null, ownershipType: "group" });
  assert.equal(r.score, 3); // 2+1+0+0
  assert.equal(r.tier, "C");
  assert.equal(r.needsSignal, true);
});

test("scoreDealer: tier thresholds (A>=6, B 4-5, C<=3)", () => {
  assert.equal(scoreDealer({ truckVolume: "high", proximity: "close", enthusiastPosture: false, ownershipType: "group" }).tier, "B"); // 3+2+0+0=5
  assert.equal(scoreDealer({ truckVolume: "med", proximity: "close", enthusiastPosture: true, ownershipType: "independent" }).tier, "A"); // 2+2+1+1=6
});

test("STAGES enum is the pipeline order", () => {
  assert.deepEqual(STAGES, ["Prospect", "Contacted", "Kit Sent", "Pilot", "Active"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dealers.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/dealer-scoring.js'`

- [ ] **Step 3: Write minimal implementation** (`netlify/functions/lib/dealer-scoring.js`)

```js
// Pure dealer scoring. score = truck volume + proximity + enthusiast + ownership.
// Null owner-signals are scored provisionally (truckVolume→med) and flagged via
// needsSignal so the tier is real but marked provisional until the owner fills in.
const TRUCK_PTS = { high: 3, med: 2, low: 1 };
const PROX_PTS = { close: 2, mid: 1 };
const STAGES = ["Prospect", "Contacted", "Kit Sent", "Pilot", "Active"];

function inferOwnership(group) {
  return group ? "group" : "independent";
}

function scoreDealer(d) {
  const truckPts = d.truckVolume == null ? 2 : (TRUCK_PTS[d.truckVolume] ?? 2);
  const proxPts = PROX_PTS[d.proximity] ?? 1;
  const enthPts = d.enthusiastPosture === true ? 1 : 0;
  const ownPts = d.ownershipType === "independent" ? 1 : 0;
  const score = truckPts + proxPts + enthPts + ownPts;
  const tier = score >= 6 ? "A" : score >= 4 ? "B" : "C";
  const needsSignal = d.truckVolume == null || d.enthusiastPosture == null;
  return { score, tier, needsSignal };
}

module.exports = { TRUCK_PTS, PROX_PTS, STAGES, inferOwnership, scoreDealer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dealers.test.js`
Expected: PASS (9 tests total)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/dealer-scoring.js tests/dealers.test.js
git commit -m "feat(dealers): deterministic A/B/C scoring with provisional signals"
```

---

## Task 3: Dependency-free .xlsx reader

**Files:**
- Create: `netlify/functions/lib/xlsx-reader.js`
- Test: `tests/dealers.test.js` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/dealers.test.js`)

This test reads the real master-list file (present in the repo) and asserts the shape we verified during brainstorming.

```js
const path = require("node:path");
const fs = require("node:fs");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");

test("readXlsx parses the dealer master list into row objects", () => {
  const file = path.join(__dirname, "..", "docs", "dealers", "dealer-master-list.xlsx");
  if (!fs.existsSync(file)) return; // skip if the source file isn't present
  const rows = readXlsx(file);
  assert.equal(rows.length, 77);
  const header = Object.keys(rows[0]);
  for (const col of ["State", "Abbrev", "Dealer Name", "City", "ZIP"]) {
    assert.ok(header.includes(col), `missing column ${col}`);
  }
  assert.equal(rows[0]["Dealer Name"], "Lake Country Toyota");
  assert.equal(rows[0]["Abbrev"], "MN");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dealers.test.js`
Expected: FAIL — `Cannot find module '../netlify/functions/lib/xlsx-reader.js'`

- [ ] **Step 3: Write minimal implementation** (`netlify/functions/lib/xlsx-reader.js`)

```js
// Minimal dependency-free .xlsx reader — the read-side companion to xlsx-writer.js.
// Parses the ZIP via its central directory, inflates DEFLATE entries with zlib,
// and reads the first worksheet into an array of row objects keyed by the header
// row. Handles shared-string ("s"), inline-string ("inlineStr"), and literal
// ("str"/number) cells. Sufficient for flat table sheets (no merged cells).
const { readFileSync } = require("node:fs");
const { inflateRawSync } = require("node:zlib");

function unzip(buf) {
  // End Of Central Directory: scan backward for its signature.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("Not a .xlsx (no ZIP end-of-central-directory)");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("Bad central directory entry");
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    files.set(name, method === 0 ? comp : inflateRawSync(comp));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function unescapeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const si of xml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)) {
    const texts = [...si[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((t) => t[1]);
    out.push(unescapeXml(texts.join("")));
  }
  return out;
}

function colToIndex(ref) {
  const letters = /^([A-Z]+)/.exec(ref)[1];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function readXlsx(file) {
  const files = unzip(readFileSync(file));
  const shared = parseSharedStrings(files.get("xl/sharedStrings.xml")?.toString("utf8"));
  const sheet = files.get("xl/worksheets/sheet1.xml").toString("utf8");
  const rows = [];
  for (const rowM of sheet.matchAll(/<(?:\w+:)?row[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const cells = [];
    for (const cM of rowM[1].matchAll(/<(?:\w+:)?c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const idx = colToIndex(cM[1]);
      const tType = /t="([^"]+)"/.exec(cM[2])?.[1];
      const inner = cM[3];
      let val = "";
      if (tType === "s") {
        const vi = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        val = vi ? shared[parseInt(vi[1], 10)] : "";
      } else if (tType === "inlineStr") {
        const ti = /<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/.exec(inner);
        val = ti ? unescapeXml(ti[1]) : "";
      } else {
        const vi = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(inner);
        val = vi ? unescapeXml(vi[1]) : "";
      }
      cells[idx] = val;
    }
    rows.push(cells);
  }
  const header = (rows[0] || []).map((h) => String(h).trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v != null && v !== ""))
    .map((r) => {
      const o = {};
      header.forEach((h, i) => { o[h] = r[i] == null ? "" : r[i]; });
      return o;
    });
}

module.exports = { readXlsx };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dealers.test.js`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/lib/xlsx-reader.js tests/dealers.test.js
git commit -m "feat(dealers): dependency-free .xlsx reader"
```

---

## Task 4: Ingest script — seed the registry

**Files:**
- Create: `scripts/ingest-dealers.js`
- Create (as output): `netlify/functions/lib/dealers.json`
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Write the ingest script** (`scripts/ingest-dealers.js`)

```js
// One-shot ingest: parse docs/dealers/dealer-master-list.xlsx → seed the dealer
// registry with identity + computed fields (rep, group, ownership, proximity).
// Owner-signal fields and living pipeline state default to null/empty. Re-running
// PRESERVES living state (truckVolume, enthusiastPosture, stage, lastTouch, notes)
// for any dealer matched by name+city, so a future re-verify doesn't wipe progress.
const fs = require("node:fs");
const path = require("node:path");
const { readXlsx } = require("../netlify/functions/lib/xlsx-reader.js");
const { assignRep, computeProximity, tagGroup } = require("../netlify/functions/lib/dealer-zones.js");
const { inferOwnership } = require("../netlify/functions/lib/dealer-scoring.js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "docs", "dealers", "dealer-master-list.xlsx");
const OUT = path.join(ROOT, "netlify", "functions", "lib", "dealers.json");

const key = (name, city) => `${String(name).toLowerCase().trim()}|${String(city).toLowerCase().trim()}`;

function main() {
  const rows = readXlsx(SRC);
  // Preserve living state from any existing registry.
  const prev = new Map();
  if (fs.existsSync(OUT)) {
    for (const d of JSON.parse(fs.readFileSync(OUT, "utf8"))) prev.set(key(d.name, d.city), d);
  }
  const dealers = rows.map((r) => {
    const name = r["Dealer Name"];
    const city = r["City"];
    const state = r["Abbrev"];
    const rep = assignRep(state);
    const group = tagGroup(name);
    const old = prev.get(key(name, city)) || {};
    return {
      name,
      city,
      state,
      address: r["Street Address"] || "",
      zip: r["ZIP"] || "",
      sourceUrl: r["Source URL"] || "",
      owningRep: rep,
      group,
      ownershipType: inferOwnership(group),
      ownershipInferred: true,
      proximity: old.proximity || computeProximity(city, rep), // keep owner overrides
      truckVolume: old.truckVolume ?? null,
      enthusiastPosture: old.enthusiastPosture ?? null,
      stage: old.stage || "Prospect",
      lastTouch: old.lastTouch || null,
      notes: old.notes || "",
    };
  });
  fs.writeFileSync(OUT, JSON.stringify(dealers, null, 2) + "\n");
  console.log(`Ingested ${dealers.length} dealers → ${path.relative(ROOT, OUT)}`);
}

main();
```

- [ ] **Step 2: Add npm script** — in `package.json` `"scripts"`, add:

```json
    "ingest:dealers": "node scripts/ingest-dealers.js",
```

- [ ] **Step 3: Run the ingest**

Run: `npm run ingest:dealers`
Expected: `Ingested 77 dealers → netlify/functions/lib/dealers.json`

- [ ] **Step 4: Sanity-check the output**

Run: `node -e "const d=require('./netlify/functions/lib/dealers.json'); console.log(d.length, d.filter(x=>x.owningRep==='aaron').length, d.filter(x=>x.group).length); console.log(d.find(x=>x.name.includes('Walser')))"`
Expected: `77` total; a non-zero aaron count and group count; the Walser record shows `group: "Walser"`, `ownershipType: "group"`, `owningRep: "aaron"`.

- [ ] **Step 5: Commit**

```bash
git add scripts/ingest-dealers.js netlify/functions/lib/dealers.json package.json
git commit -m "feat(dealers): ingest master list into dealers.json registry"
```

---

## Task 5: Score + generate the pipeline and worksheet views

**Files:**
- Create: `scripts/score-dealers.js`
- Create (as output): `docs/dealers/dealer-pipeline.md`, `docs/dealers/dealer-scoring-worksheet.md`
- Modify: `netlify/functions/lib/dealers.json` (computed fields written back)
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Write the scorer + generators** (`scripts/score-dealers.js`)

```js
// Recompute rep/group/ownership/proximity + score/tier/needsSignal for every
// dealer, write them back to dealers.json, and regenerate the two markdown views.
// Idempotent: safe to run any time (e.g. after the owner edits signals).
const fs = require("node:fs");
const path = require("node:path");
const { assignRep, computeProximity, tagGroup } = require("../netlify/functions/lib/dealer-zones.js");
const { inferOwnership, scoreDealer, STAGES } = require("../netlify/functions/lib/dealer-scoring.js");

const ROOT = path.join(__dirname, "..");
const REG = path.join(ROOT, "netlify", "functions", "lib", "dealers.json");
const PIPE = path.join(ROOT, "docs", "dealers", "dealer-pipeline.md");
const WORK = path.join(ROOT, "docs", "dealers", "dealer-scoring-worksheet.md");
const REP_NAMES = { aaron: "Aaron", noah: "Noah", cody: "Cody" };
const TIER_ORDER = { A: 0, B: 1, C: 2 };

function enrich(d) {
  const rep = assignRep(d.state);
  const group = tagGroup(d.name);
  d.owningRep = rep;
  d.group = group;
  d.ownershipType = inferOwnership(group);
  d.ownershipInferred = true;
  if (!d.proximity) d.proximity = computeProximity(d.city, rep);
  Object.assign(d, scoreDealer(d));
  return d;
}

function sortDealers(a, b) {
  return (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || (b.score - a.score) || a.name.localeCompare(b.name);
}

function pipelineMd(dealers) {
  const counts = { A: 0, B: 0, C: 0 };
  dealers.forEach((d) => counts[d.tier]++);
  const stageCounts = STAGES.map((s) => `${s}: ${dealers.filter((d) => d.stage === s).length}`).join(" · ");
  let md = `# Dealer Pipeline\n\n`;
  md += `_Generated by \`npm run score:dealers\` — do not edit by hand (edit the worksheet or dealers.json)._\n\n`;
  md += `**${dealers.length} dealers** · Tier A ${counts.A} · B ${counts.B} · C ${counts.C}\n\n`;
  md += `**Stages:** ${stageCounts}\n\n`;
  md += `Legend: ⚠ = provisional tier (needs truck-volume + enthusiast signal) · group name in **bold**.\n\n`;
  for (const rep of ["aaron", "noah", "cody"]) {
    const list = dealers.filter((d) => d.owningRep === rep).sort(sortDealers);
    md += `## ${REP_NAMES[rep]} (${list.length})\n\n`;
    md += `| Tier | Dealer | City | ST | Group | Stage |\n|---|---|---|---|---|---|\n`;
    for (const d of list) {
      const flag = d.needsSignal ? " ⚠" : "";
      const grp = d.group ? `**${d.group}**` : "—";
      md += `| ${d.tier}${flag} | ${d.name} | ${d.city} | ${d.state} | ${grp} | ${d.stage} |\n`;
    }
    md += `\n`;
  }
  return md;
}

function worksheetMd(dealers) {
  let md = `# Dealer Scoring Worksheet\n\n`;
  md += `Fill **Truck Volume** (high/med/low) and **Enthusiast?** (yes/no) for each dealer,\n`;
  md += `then paste values back into \`netlify/functions/lib/dealers.json\` (or hand this to Claude)\n`;
  md += `and run \`npm run score:dealers\`. Grouped by rep; tip: fill by group in one pass.\n\n`;
  for (const rep of ["aaron", "noah", "cody"]) {
    const list = dealers.filter((d) => d.owningRep === rep).sort((a, b) => a.name.localeCompare(b.name));
    md += `## ${REP_NAMES[rep]} (${list.length})\n\n`;
    md += `| Dealer | City | ST | Group | Truck Volume | Enthusiast? |\n|---|---|---|---|---|---|\n`;
    for (const d of list) {
      const grp = d.group || "—";
      const tv = d.truckVolume || "";
      const en = d.enthusiastPosture == null ? "" : (d.enthusiastPosture ? "yes" : "no");
      md += `| ${d.name} | ${d.city} | ${d.state} | ${grp} | ${tv} | ${en} |\n`;
    }
    md += `\n`;
  }
  return md;
}

function main() {
  const dealers = JSON.parse(fs.readFileSync(REG, "utf8")).map(enrich);
  fs.writeFileSync(REG, JSON.stringify(dealers, null, 2) + "\n");
  fs.writeFileSync(PIPE, pipelineMd(dealers));
  fs.writeFileSync(WORK, worksheetMd(dealers));
  const c = { A: 0, B: 0, C: 0 };
  dealers.forEach((d) => c[d.tier]++);
  console.log(`Scored ${dealers.length} dealers (A ${c.A} · B ${c.B} · C ${c.C}) → pipeline + worksheet regenerated`);
}

main();
```

- [ ] **Step 2: Add npm script** — in `package.json` `"scripts"`, add:

```json
    "score:dealers": "node scripts/score-dealers.js",
```

- [ ] **Step 3: Run the scorer**

Run: `npm run score:dealers`
Expected: `Scored 77 dealers (A .. · B .. · C ..) → pipeline + worksheet regenerated`

- [ ] **Step 4: Verify the generated views**

Run: `node -e "const d=require('./netlify/functions/lib/dealers.json'); const bad=d.filter(x=>!['A','B','C'].includes(x.tier)); console.log('bad tiers:', bad.length); console.log('needsSignal all true pre-signals:', d.every(x=>x.needsSignal))"`
Expected: `bad tiers: 0`; `needsSignal all true pre-signals: true` (no signals filled yet).
Also open `docs/dealers/dealer-pipeline.md` and confirm three rep sections render with tier/stage counts.

- [ ] **Step 5: Commit**

```bash
git add scripts/score-dealers.js package.json netlify/functions/lib/dealers.json docs/dealers/dealer-pipeline.md docs/dealers/dealer-scoring-worksheet.md
git commit -m "feat(dealers): score registry + generate pipeline and worksheet views"
```

---

## Task 6: Registry-integrity tests

**Files:**
- Test: `tests/dealers.test.js` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/dealers.test.js`)

```js
const { STATE_REP: SR } = require("../netlify/functions/lib/dealer-zones.js");

test("registry integrity: every dealer is valid and consistently scored", () => {
  const regPath = path.join(__dirname, "..", "netlify", "functions", "lib", "dealers.json");
  if (!fs.existsSync(regPath)) return; // skip until ingest+score have run
  const dealers = JSON.parse(fs.readFileSync(regPath, "utf8"));
  assert.ok(dealers.length > 0, "registry is empty");
  for (const d of dealers) {
    assert.match(d.state, /^[A-Z]{2}$/, `bad state ${d.state} for ${d.name}`);
    assert.ok(STAGES.includes(d.stage), `bad stage ${d.stage} for ${d.name}`);
    assert.equal(d.owningRep, SR[d.state], `rep mismatch for ${d.name} (${d.state})`);
    assert.ok(["A", "B", "C"].includes(d.tier), `bad tier ${d.tier} for ${d.name}`);
    // score/tier must agree with the pure function (registry not hand-edited into inconsistency)
    const fresh = scoreDealer(d);
    assert.equal(d.score, fresh.score, `stale score for ${d.name}`);
    assert.equal(d.tier, fresh.tier, `stale tier for ${d.name}`);
  }
});
```

- [ ] **Step 2: Run the full suite**

Run: `node --test tests/dealers.test.js`
Expected: PASS (11 tests). If the registry test reports stale score/tier, run `npm run score:dealers` and re-run — the registry must always be freshly scored when committed.

- [ ] **Step 3: Run the whole repo suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (prior green count + the new dealer tests).

- [ ] **Step 4: Commit**

```bash
git add tests/dealers.test.js
git commit -m "test(dealers): registry integrity + score-consistency guard"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** Registry schema (Task 4) · scorer + rubric (Tasks 2, 5) · zone map + proximity (Task 1) · group tagging (Task 1) · xlsx ingest (Tasks 3, 4) · both output views (Task 5) · tests incl. determinism + integrity (Tasks 1, 2, 6). All Part B spec sections map to a task.
- **Provisional scoring** is exercised by Task 2's null-signal tests and asserted registry-wide in Task 6.
- **No new dependencies** — the reader uses only `node:zlib`/`node:fs`.
- When the owner returns the filled worksheet, the flow is: edit `dealers.json` signal fields (or paste from the worksheet) → `npm run score:dealers` → commit. Tiers upgrade from provisional to final automatically.
