#!/usr/bin/env node
// Render the brand-styled Tuned Yota workflow (workflow-render.html) to a PNG via headless Chrome.
//   node docs/architecture/render-workflow.js
// Output → assets-source/diagrams/tuned-yota-workflow.png (gitignored). Needs internet (Mermaid + fonts via CDN).
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

const url = "file:///" + path.join(DIR, "workflow-render.html").replace(/\\/g, "/");
const out = path.join(OUT, "tuned-yota-workflow.png");
// Generous height; Mermaid sizes the diagram to content. Adjust --window-size if it clips.
execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=2", "--virtual-time-budget=10000",
  "--window-size=1500,2760", `--screenshot=${out}`, url,
], { stdio: "ignore" });
console.log("✓ wrote", out);
