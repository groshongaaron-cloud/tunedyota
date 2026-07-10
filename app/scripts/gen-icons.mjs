// app/scripts/gen-icons.mjs
// Generate the app icon + splash source assets from the brand fox mark on the
// brand ink background. Output → app/resources/{icon.png,splash.png}. These feed
// @capacitor/assets (or Codemagic) to produce all platform sizes.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RES = path.join(ROOT, "app", "resources");
fs.mkdirSync(RES, { recursive: true });
const FOX = path.join(ROOT, "site", "icon-512.png");
const INK = { r: 0x3a, g: 0x2e, b: 0x26, alpha: 1 }; // --ink brand color

async function make(size, foxFrac, out) {
  const foxSize = Math.round(size * foxFrac);
  const foxBuf = await sharp(FOX).resize(foxSize, foxSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: foxBuf, gravity: "centre" }])
    .png().toFile(out);
}

await make(1024, 0.6, path.join(RES, "icon.png"));
await make(2732, 0.24, path.join(RES, "splash.png"));
console.log("app icon + splash generated in app/resources/");
