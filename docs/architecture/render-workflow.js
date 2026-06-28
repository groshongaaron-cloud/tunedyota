#!/usr/bin/env node
// Render every architecture diagram (*-render.html in this folder) to a PNG via headless Chrome.
//   node docs/architecture/render-workflow.js
// Each *-render.html declares its canvas via:  <!-- render: WIDTHxHEIGHT -->  (default 1500x2200).
// Output → assets-source/diagrams/<base>.png (gitignored). Needs internet (Mermaid + fonts via CDN).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "../..");
const OUT = path.join(ROOT, "assets-source", "diagrams");
fs.mkdirSync(OUT, { recursive: true });

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const CHROME = CHROMES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome/Edge found."); process.exit(1); }

const files = fs.readdirSync(DIR).filter((f) => f.endsWith("-render.html"));
let n = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(DIR, f), "utf8");
  const m = html.match(/<!--\s*render:\s*(\d+)x(\d+)\s*-->/i);
  const [w, h] = m ? [m[1], m[2]] : ["1500", "2200"];
  const base = f.replace(/-render\.html$/, "");
  const out = path.join(OUT, `${base}.png`);
  const url = "file:///" + path.join(DIR, f).replace(/\\/g, "/");
  try {
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=2", "--virtual-time-budget=10000",
      `--window-size=${w},${h}`, `--screenshot=${out}`, url,
    ], { stdio: "ignore" });
    console.log(`✓ ${base}.png  (${w}×${h})`);
    n++;
  } catch (e) { console.error("✗ failed:", f, e.message); }
}
console.log(`\nRendered ${n} diagram(s) → ${OUT}`);
