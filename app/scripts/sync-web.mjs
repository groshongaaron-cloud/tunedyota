// app/scripts/sync-web.mjs
// Assemble app/www (the Capacitor webDir) from the canonical console assets in
// site/ — no fork. installer.html becomes the app's index.html. Run before build.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");
const WWW = path.join(ROOT, "app", "www");

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, "vendor"), { recursive: true });

fs.copyFileSync(path.join(SITE, "installer.html"), path.join(WWW, "index.html"));
for (const f of ["site.css", "chat.css", "chat.js", "favicon.ico", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "fox.svg", "installer.webmanifest", "commission-tally.js", "offline-queue.js", "sw.js"]) {
  const src = path.join(SITE, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f));
}
fs.copyFileSync(path.join(SITE, "vendor", "zxing.min.js"), path.join(WWW, "vendor", "zxing.min.js"));
console.log("app/www assembled from site/ console assets");
