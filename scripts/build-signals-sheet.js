// Generate docs/dealers/dealer-signals.xlsx — a fast fill sheet for the two owner
// signals the tier score needs: truckVolume (high/med/low) + enthusiastPosture
// (yes/no). One row per dealer, clustered by rep → group → name so a whole dealer
// group can be filled in one Excel pass (fill-down). Existing values are pre-filled.
// Owner fills the two right columns, saves, then runs `npm run ingest:signals`.
const fs = require("node:fs");
const path = require("node:path");
const { buildWorkbook } = require("../netlify/functions/lib/xlsx-writer.js");

const ROOT = path.join(__dirname, "..");
const REG = path.join(ROOT, "netlify", "functions", "lib", "dealers.json");
const OUT = path.join(ROOT, "docs", "dealers", "dealer-signals.xlsx");
const REP_NAMES = { aaron: "Aaron", noah: "Noah", cody: "Cody" };
const REP_ORDER = { aaron: 0, noah: 1, cody: 2 };

const enthText = (v) => (v == null ? "" : v ? "yes" : "no");

// Rep order, then grouped stores first (clustered by group name), singletons last.
function order(a, b) {
  const ga = a.group ? 0 : 1;
  const gb = b.group ? 0 : 1;
  return (
    (REP_ORDER[a.owningRep] ?? 9) - (REP_ORDER[b.owningRep] ?? 9) ||
    ga - gb ||
    (a.group || "").localeCompare(b.group || "") ||
    a.name.localeCompare(b.name)
  );
}

function main() {
  const dealers = JSON.parse(fs.readFileSync(REG, "utf8")).slice().sort(order);
  const header = [
    "Rep", "Dealer", "City", "ST", "Group", "Proximity",
    "Truck Volume (high/med/low)", "Enthusiast? (yes/no)",
  ];
  const rows = dealers.map((d) => [
    REP_NAMES[d.owningRep] || d.owningRep,
    d.name, d.city, d.state,
    d.group || "", d.proximity || "",
    d.truckVolume || "", enthText(d.enthusiastPosture),
  ]);
  const help = [
    ["How to fill the Signals sheet"],
    ["Truck Volume — high / med / low: the store's full-size truck (Tundra/Tacoma) sales weight."],
    ["Enthusiast? — yes / no: does the store lean performance / off-road / enthusiast?"],
    ["Rows are clustered by rep then dealer group — fill a whole group in one pass (Excel fill-down)."],
    ["Blank = leave the current value as-is. Save the file, then run: npm run ingest:signals"],
  ];
  const buf = buildWorkbook([
    { name: "Signals", aoa: [header, ...rows] },
    { name: "How to fill", aoa: help },
  ]);
  fs.writeFileSync(OUT, buf);

  const need = dealers.filter((d) => d.truckVolume == null || d.enthusiastPosture == null).length;
  console.log(
    `Wrote ${path.relative(ROOT, OUT)} — ${dealers.length} dealers (${need} still need a signal).\n` +
    `Fill the two right columns in Excel, save, then: npm run ingest:signals`
  );
}

main();
