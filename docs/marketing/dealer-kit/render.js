#!/usr/bin/env node
// Render every Dealer Partner Kit HTML artifact to a US-Letter PDF via headless Chrome.
//   node docs/marketing/dealer-kit/render.js
// Output → assets-source/dealer-kit-exports/ (gitignored). No dependencies.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "../../..");
const OUT = path.join(ROOT, "assets-source", "dealer-kit-exports");
fs.mkdirSync(OUT, { recursive: true });

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const CHROME = CHROMES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome/Edge found. Edit CHROMES in render.js."); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => /^\d.*\.html$/.test(f));
let n = 0;
for (const f of files) {
  const out = path.join(OUT, f.replace(/\.html$/, ".pdf"));
  try {
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
      "--virtual-time-budget=6000", `--print-to-pdf=${out}`,
      "file:///" + path.join(DIR, f).replace(/\\/g, "/"),
    ], { stdio: "ignore" });
    console.log(`✓ ${path.basename(out)}`);
    n++;
  } catch (e) {
    console.error("✗ failed:", f, e.message);
  }
}
console.log(`\nRendered ${n} artifact(s) → ${OUT}`);
