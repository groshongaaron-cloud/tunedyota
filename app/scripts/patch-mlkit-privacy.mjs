// postinstall: bump @capacitor-mlkit/barcode-scanning's pinned GoogleMLKit
// from 5.0.0 to 6.0.0. MLKit 5.0.0 pins GoogleToolboxForMac ~>2.1 (2.3.2),
// which ships no privacy manifest — App Store submission dies with ITMS-91061.
// MLKit 6.0.0 requires GoogleToolboxForMac >=4.2.1 (manifest included) and
// keeps the iOS 13 floor (7.0.0 would raise it to 15.5). Verified working with
// this plugin major: capawesome-team/capacitor-mlkit#178.
// When the podspec actually changes, the stale Podfile.lock is deleted so the
// next pod install re-resolves; commit the regenerated lock from CI artifacts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const podspec = path.join(APP, "node_modules", "@capacitor-mlkit", "barcode-scanning", "CapacitorMlkitBarcodeScanning.podspec");
const lock = path.join(APP, "ios", "App", "Podfile.lock");

if (!fs.existsSync(podspec)) { console.log("patch-mlkit-privacy: plugin not installed, skipping"); process.exit(0); }
const src = fs.readFileSync(podspec, "utf8");
const patched = src.replace("'GoogleMLKit/BarcodeScanning', '5.0.0'", "'GoogleMLKit/BarcodeScanning', '6.0.0'");
if (patched === src) {
  console.log(src.includes("'GoogleMLKit/BarcodeScanning', '6.0.0'")
    ? "patch-mlkit-privacy: already patched"
    : "patch-mlkit-privacy: WARNING — expected pin not found; plugin version changed? inspect " + podspec);
  process.exit(0);
}
fs.writeFileSync(podspec, patched);
console.log("patch-mlkit-privacy: GoogleMLKit 5.0.0 -> 6.0.0");
if (fs.existsSync(lock)) { fs.unlinkSync(lock); console.log("patch-mlkit-privacy: removed stale Podfile.lock for re-resolution"); }
