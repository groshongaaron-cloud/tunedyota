// app/scripts/sync-lib.mjs
// Assembly logic for app/www (the Capacitor webDir), exported for tests.
// The client shell (app.html) is the app's index; installer console + booking
// ride along. Bundled HTML gets the native-fetch bootstrap injected so
// /.netlify/functions/* calls reach the live site from the native WebView.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SITE = path.join(ROOT, "site");
const WWW = path.join(ROOT, "app", "www");

export const PAGES = [
  ["app.html", "index.html"],
  ["installer.html", "installer.html"],
  ["book.html", "book.html"],
  ["privacy.html", "privacy.html"],
  ["terms.html", "terms.html"],
  ["calibration.html", "calibration.html"],
  ["my-tuned-yota.html", "my-tuned-yota.html"],
];

// Self-hosted fonts for my-tuned-yota.html (Archivo/IBM Plex) and book.html
// (Lato/Spectral) — referenced relatively (assets/fonts/...) so they resolve
// in both the bundle and on the web.
export const FONTS = [
  "archivo-var.woff2",
  "ibm-plex-sans-400.woff2", "ibm-plex-sans-500.woff2", "ibm-plex-sans-600.woff2",
  "ibm-plex-mono-400.woff2", "ibm-plex-mono-500.woff2", "ibm-plex-mono-600.woff2",
  "lato-400.woff2", "lato-700.woff2", "lato-900.woff2",
  "spectral-400.woff2", "spectral-500.woff2", "spectral-600.woff2", "spectral-700.woff2",
];

export const ASSETS = [
  "site.css", "chat.css", "favicon.ico", "icon-192.png", "icon-512.png",
  "apple-touch-icon.png", "fox.svg", "logo.png", "installer.webmanifest",
  "commission-tally.js", "offline-queue.js", "sw.js",
  "app-shell.js", "product-lines.js", "native-fetch.js", "payment-checkout.js",
  "magnuson-catalog.js", "banks-catalog.js", "amsoil-garage-render.js", "amsoil-garage.json",
  "vehicles.json", "chat.js",
];

export function injectNativeFetch(html) {
  const tag = '<script src="/native-fetch.js"></script>';
  if (html.includes(tag)) return html;
  return html.replace(/<head([^>]*)>/i, (m) => m + "\n  " + tag);
}

export function assemble() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(path.join(WWW, "vendor"), { recursive: true });
  for (const [src, dst] of PAGES) {
    const html = fs.readFileSync(path.join(SITE, src), "utf8");
    fs.writeFileSync(path.join(WWW, dst), injectNativeFetch(html));
  }
  for (const f of ASSETS) {
    const src = path.join(SITE, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(WWW, f));
  }
  fs.copyFileSync(path.join(SITE, "vendor", "zxing.min.js"), path.join(WWW, "vendor", "zxing.min.js"));
  fs.mkdirSync(path.join(WWW, "assets", "fonts"), { recursive: true });
  for (const f of FONTS) {
    fs.copyFileSync(path.join(SITE, "assets", "fonts", f), path.join(WWW, "assets", "fonts", f));
  }
  // Extensionless /privacy and /terms: create index.html inside each dir so
  // Capacitor's local server resolves /privacy and /terms without redirects.
  for (const name of ["privacy", "terms"]) {
    const dir = path.join(WWW, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(WWW, name + ".html"), path.join(dir, "index.html"));
  }
  console.log("app/www assembled: client shell (index) + installer console + booking + privacy/terms/calibration + my-tuned-yota (with fonts)");
}
