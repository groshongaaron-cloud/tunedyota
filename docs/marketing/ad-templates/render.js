#!/usr/bin/env node
// Render every Tuned Yota ad template to a PNG at its exact canvas size, via headless Chrome.
//   node docs/marketing/ad-templates/render.js
// Output → assets-source/ad-exports/ (gitignored). No dependencies.
//
// How it works: each template's body is styled for nice on-screen preview (centered, padded).
// For export we write a temp copy *in the same folder* (so relative image paths still resolve)
// with a print-reset injected, screenshot it at the .canvas width×height, then delete the temp.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const ROOT = path.resolve(DIR, "../../..");
const OUT = path.join(ROOT, "assets-source", "ad-exports");
fs.mkdirSync(OUT, { recursive: true });

const CHROMES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const CHROME = CHROMES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error("No Chrome/Edge found. Install Chrome or edit CHROMES in render.js."); process.exit(1); }

const RESET = "<style>html,body{margin:0!important;padding:0!important;background:#fff!important;display:block!important}.canvas{margin:0!important}</style>";

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".html") && !f.endsWith(".__export.html"));
let n = 0;
for (const f of files) {
  const html = fs.readFileSync(path.join(DIR, f), "utf8");
  const m = html.match(/\.canvas\s*\{[^}]*?width:\s*(\d+)px[^}]*?height:\s*(\d+)px/);
  if (!m) { console.warn("skip (no .canvas size):", f); continue; }
  const [w, h] = [m[1], m[2]];
  const tmpName = f.replace(/\.html$/, ".__export.html");
  const tmp = path.join(DIR, tmpName);
  fs.writeFileSync(tmp, html.replace(/<\/head>/i, RESET + "</head>"));
  const out = path.join(OUT, f.replace(/\.html$/, `-${w}x${h}.png`));
  try {
    execFileSync(CHROME, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--virtual-time-budget=6000",
      `--window-size=${w},${h}`, `--screenshot=${out}`,
      "file:///" + tmp.replace(/\\/g, "/"),
    ], { stdio: "ignore" });
    console.log(`✓ ${path.basename(out)}  (${w}×${h})`);
    n++;
  } catch (e) {
    console.error("✗ failed:", f, e.message);
  } finally {
    fs.unlinkSync(tmp);
  }
}
console.log(`\nRendered ${n} template(s) → ${OUT}`);
