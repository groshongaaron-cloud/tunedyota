// scripts/measure/report.mjs
// Usage: node scripts/measure/report.mjs <snapshot.json> <diff.json>
// Prints the Slack markdown report to stdout.
import fs from "node:fs";
import { renderReport } from "./lib/report.mjs";

const [snapPath, diffPath] = process.argv.slice(2);
const snapshot = JSON.parse(fs.readFileSync(snapPath, "utf8"));
const diff = JSON.parse(fs.readFileSync(diffPath, "utf8"));
process.stdout.write(renderReport(snapshot, diff));
