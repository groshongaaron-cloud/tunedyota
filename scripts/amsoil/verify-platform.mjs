// scripts/amsoil/verify-platform.mjs
// One-stop CLI to review + verify AMSOIL platform fluid data, then flip it live.
//
//   node scripts/amsoil/verify-platform.mjs list
//   node scripts/amsoil/verify-platform.mjs review "Toyota Tundra"
//   node scripts/amsoil/verify-platform.mjs set-cap "Toyota Tundra" "2007-2021" "Engine Oil" 7.9
//   node scripts/amsoil/verify-platform.mjs confirm "Toyota Tundra" [--year "2007-2021"] [--build]
//   node scripts/amsoil/verify-platform.mjs unverify "Toyota Tundra" [--year "2007-2021"]
//
// `confirm` sets verified:true (publishing capacities + intervals for that platform).
// Review the drafts first; correct any capacity with set-cap; then confirm.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import * as V from "./lib/verify.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA = path.join(ROOT, "site", "amsoil-garage.json");

function load() { return { raw: fs.readFileSync(DATA, "utf8") }; }
function read() { return JSON.parse(fs.readFileSync(DATA, "utf8")); }
// Match the price-sync writer exactly (scripts/amsoil/price-sync.mjs): canonical 2-space, LF.
function write(cat) { fs.writeFileSync(DATA, JSON.stringify(cat, null, 2) + "\n"); }

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : undefined; };
// positional args = everything that isn't a --flag or a --flag's value
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { if (argv[i + 1] && !argv[i + 1].startsWith("--")) i++; continue; }
  pos.push(argv[i]);
}
const [cmd, name, ...rest] = pos;
const year = flag("year");

function nextSteps(didBuild) {
  const lines = [];
  if (!didBuild) lines.push("  npm run build:seo   # regenerate the 13 vehicle pages + sitemap");
  lines.push("  npm test            # confirm green");
  lines.push("  # then ship: commit site/amsoil-garage.json + regenerated pages, push master");
  return "\nNext:\n" + lines.join("\n");
}

try {
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).join("\n").replace(/^\/\/ ?/gm, ""));
    process.exit(0);
  }

  if (cmd === "list") {
    const rows = V.platforms(read());
    const total = rows.reduce((n, r) => n + r.total, 0), ver = rows.reduce((n, r) => n + r.verified, 0);
    for (const r of rows) {
      const badge = r.verified === r.total ? "LIVE " : r.verified === 0 ? "draft" : "part ";
      console.log(`  [${badge}] ${r.name.padEnd(22)} ${r.verified}/${r.total} verified`);
    }
    console.log(`\n${ver}/${total} generations verified across ${rows.length} platforms.`);
    process.exit(0);
  }

  if (cmd === "review") {
    if (!name) throw new Error(`Usage: review "<Make Model>"`);
    const r = V.review(read(), name);
    console.log(`\n${r.name} — draft fluid specs (review before you confirm)\n`);
    for (const g of r.generations) {
      console.log(`  ${g.verified ? "✓ LIVE" : "· draft"}  ${g.y}  (${g.e})`);
      for (const s of g.systems) {
        const cap = s.capacity != null ? `${s.capacity} ${s.unit}` : "—";
        console.log(`      ${String(s.system).padEnd(20)} ${String(cap).padEnd(9)} ${(s.product || "").slice(0, 46)}`);
      }
    }
    console.log(`\nCorrect a capacity:  node scripts/amsoil/verify-platform.mjs set-cap "${r.name}" "<year>" "<System>" <number>`);
    console.log(`Publish this platform: node scripts/amsoil/verify-platform.mjs confirm "${r.name}"`);
    process.exit(0);
  }

  if (cmd === "set-cap") {
    const [yr, system, cap] = rest.length ? rest : [];
    if (!name || !yr || !system || cap == null) throw new Error(`Usage: set-cap "<Make Model>" "<year>" "<System>" <number>`);
    const cat = read();
    const r = V.setCapacity(cat, name, yr, system, cap);
    write(cat);
    console.log(`Set ${r.name} ${r.year} ${r.system}: ${r.before} → ${r.after}`);
    console.log(`(still draft — run 'confirm' when the platform's capacities are all correct)`);
    process.exit(0);
  }

  if (cmd === "confirm" || cmd === "unverify") {
    if (!name) throw new Error(`Usage: ${cmd} "<Make Model>" [--year "<year>"]`);
    const value = cmd === "confirm";
    const cat = read();
    const r = V.setVerified(cat, name, { year: year === true ? null : year, value });
    if (!r.changed.length) {
      console.log(`No change — ${r.name}${year && year !== true ? ` (${year})` : ""} already ${value ? "verified" : "unverified"}.`);
      process.exit(0);
    }
    write(cat);
    console.log(`${value ? "VERIFIED (live)" : "Unverified"}: ${r.name} — generations: ${r.changed.join(", ")}`);
    if (value) console.log(`Capacities + severe-service intervals for these will now render on the garage + vehicle page.`);
    let didBuild = false;
    if (flag("build")) {
      console.log(`\nRunning build:seo …`);
      execSync("npm run build:seo", { cwd: ROOT, stdio: "inherit" });
      didBuild = true;
    }
    console.log(nextSteps(didBuild));
    process.exit(0);
  }

  throw new Error(`Unknown command "${cmd}". Try: list | review | set-cap | confirm | unverify`);
} catch (e) {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
}
