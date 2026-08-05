// scripts/rocky/build-reference-pack.mjs
// Usage: node scripts/rocky/build-reference-pack.mjs "<procedure-search>"
// Downloads the source video + auto subs, extracts reference frames, writes
// assets/rocky/reference-packs/<episode-id>/ with index.json.
// Reference frames are INTERNAL tracing reference only — never shipped.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadGuides, findByProcedure } from "./lib/dataset.mjs";
import { planFrameTimestamps, buildPackIndex } from "./lib/reference-pack.mjs";

const search = process.argv[2];
if (!search) { console.error('Usage: build-reference-pack.mjs "<procedure-search>"'); process.exit(1); }

const guides = loadGuides(path.join("scripts", "rocky", "data", "toyota-guides.json"));
const hits = findByProcedure(guides, search);
if (hits.length !== 1) {
  console.error(`Expected exactly 1 match for "${search}", got ${hits.length}. Narrow the search.`);
  for (const h of hits) console.error(" -", h.Title);
  process.exit(1);
}
const guide = hits[0];
const videoId = guide["YouTube Video ID"];
const id = `${guide.Model}-${guide["Year Range"]}-${guide.Procedure}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const outDir = path.join("assets", "rocky", "reference-packs", id);
fs.mkdirSync(outDir, { recursive: true });

const url = `https://www.youtube.com/watch?v=${videoId}`;
console.log("Downloading", url);
execFileSync("yt-dlp", ["-f", "bv*[height<=720]+ba/b[height<=720]", "--merge-output-format", "mp4", "--write-auto-subs", "--sub-lang", "en", "--convert-subs", "srt", "-o", path.join(outDir, "source.%(ext)s"), url], { stdio: "inherit" });

// probe duration
const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path.join(outDir, "source.mp4")]).toString().trim());

// parse subtitle cue start times if present (SRT)
let cues = [];
const srtPath = path.join(outDir, "source.en.srt");
if (fs.existsSync(srtPath)) {
  const times = [...fs.readFileSync(srtPath, "utf8").matchAll(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) -->/g)];
  cues = times.map((m) => ({ start: (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 }));
}

const stamps = planFrameTimestamps({ durationSec: dur, transcriptCues: cues, minGapSec: 4, maxFrames: 40 });
stamps.forEach((t, i) => {
  const file = path.join(outDir, `frame-${String(i).padStart(3, "0")}.jpg`);
  execFileSync("ffmpeg", ["-y", "-ss", String(t), "-i", path.join(outDir, "source.mp4"), "-frames:v", "1", "-q:v", "3", file], { stdio: "ignore" });
});

const index = buildPackIndex({ videoId, guide, frames: stamps });
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(index, null, 2));
console.log(`Wrote ${stamps.length} frames + index.json to ${outDir}`);
