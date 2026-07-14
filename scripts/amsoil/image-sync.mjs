// scripts/amsoil/image-sync.mjs
// Prompted refresh: download the AMSOIL product images named in image-sources.json
// from the dz.amsoil.com digital-library CDN (via the public thumbor proxy, which
// converts AMSOIL's print-CMYK originals to web RGB + resizes), and self-host them
// under site/images/amsoil/. Run: node scripts/amsoil/image-sync.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MAN = path.join(ROOT, "scripts", "amsoil", "image-sources.json");
const OUT = path.join(ROOT, "site", "images", "amsoil");
const man = JSON.parse(fs.readFileSync(MAN, "utf8"));
const SIZE = man.thumborSize || "800x800";
const BASE = "https://dz.amsoil.com/cdn2/uploads/";

function thumbor(cdn2Path) {
  // cdn2Path may carry residual %XX encoding from the SPA; fully decode, then re-encode
  // the whole original URL as thumbor's path component.
  const original = BASE + decodeURIComponent(cdn2Path);
  return `https://dz.amsoil.com/thumbor/unsafe/fit-in/${SIZE}/${encodeURIComponent(original)}`;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const done = [], failed = [];
  for (const [sku, p] of Object.entries(man.products)) {
    const url = thumbor(p.cdn2Path);
    try {
      const res = await fetch(url);
      const ct = res.headers.get("content-type") || "";
      if (!res.ok || !ct.startsWith("image/")) throw new Error(`HTTP ${res.status} ${ct}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1500) throw new Error(`too small (${buf.length}b)`);
      fs.writeFileSync(path.join(OUT, p.file), buf);
      done.push(`${sku} -> ${p.file} (${(buf.length / 1024).toFixed(0)}kb)`);
    } catch (e) {
      failed.push(`${sku} (${p.file}): ${e.message}`);
    }
  }
  console.log("Downloaded:\n  " + (done.join("\n  ") || "(none)"));
  if (failed.length) console.log("\nFAILED:\n  " + failed.join("\n  "));
  console.log(`\n${done.length}/${Object.keys(man.products).length} images saved to site/images/amsoil/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
