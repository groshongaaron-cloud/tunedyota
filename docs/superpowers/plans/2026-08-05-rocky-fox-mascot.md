# Rocky Fox Mascot — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable, tested episode-production toolkit and the Rocky brand/pilot deliverables needed to ship ONE approved pilot episode — *2007–2021 Tundra Front Brake Pads & Rotors* — hosted by Rocky the Tuned Yota fox.

**Architecture:** A small set of pure, unit-tested Node ESM libraries under `scripts/rocky/lib/` (dataset access, reference-frame planning, SRT captions, episode manifest) with thin CLI wrappers that call `yt-dlp`/`ffmpeg`/`sharp`. Creative assets (the rigged 3D Rocky model, animation, Ava voiceover, traced diagrams) are produced from Claude-generated briefs/scripts through an owner/artist handoff. Reference frames from the source video are **internal tracing reference only — never shipped**; specs/torque values are **owner/FSM-verified, never fabricated**.

**Tech Stack:** Node.js (built-in `node --test`), ESM `.mjs`, `sharp` (already a dep), system `yt-dlp` + `ffmpeg`, TTS = locked Ava education voice.

**Spec:** `docs/superpowers/specs/2026-08-05-rocky-fox-mascot-design.md`

---

## File Structure

**Toolkit (Claude/subagent-built, tested):**
- `scripts/rocky/data/toyota-guides.json` — vendored copy of the enriched 148-row dataset (source of episode metadata).
- `scripts/rocky/lib/dataset.mjs` — load + query guides (by procedure/model).
- `scripts/rocky/lib/reference-pack.mjs` — pure logic: choose frame timestamps, build pack index.
- `scripts/rocky/lib/srt.mjs` — pure logic: SRT timestamp + document generation.
- `scripts/rocky/lib/episode-manifest.mjs` — pure logic: validate an episode manifest.
- `scripts/rocky/build-reference-pack.mjs` — CLI: yt-dlp + ffmpeg → reference pack folder.
- `scripts/rocky/build-episode.mjs` — CLI: assemble + validate an episode manifest.
- `tests/rocky-dataset.test.mjs`, `tests/rocky-reference-pack.test.mjs`, `tests/rocky-srt.test.mjs`, `tests/rocky-manifest.test.mjs`

**Brand + pilot deliverables (Claude-generated, owner/artist review):**
- `docs/brand/rocky/character-brief.md` — 3D build brief (form, color match 6X3, expressions, rig).
- `docs/brand/rocky/concept-prompt-pack.md` — AI concept/turnaround prompt pack.
- `docs/brand/rocky/pilot-tundra-front-brakes-script.md` — pilot VO script (specs flagged for owner verification).

**Produced at episode time (owner/artist/tools):**
- `assets/rocky/reference-packs/<episode-id>/` — extracted frames + `index.json` (git-ignored; internal reference).
- Rocky 3D model + turnaround renders (external asset store).
- Final pilot video export + `.srt`.

---

## Task 1: Vendor the dataset + build the guide loader

**Files:**
- Create: `scripts/rocky/data/toyota-guides.json` (copied from `C:/Users/grosh/viktorgautomotive-toyota-guides.json`)
- Create: `scripts/rocky/lib/dataset.mjs`
- Test: `tests/rocky-dataset.test.mjs`

- [ ] **Step 1: Copy the enriched dataset into the repo**

Run:
```bash
mkdir -p scripts/rocky/data
cp "/c/Users/grosh/viktorgautomotive-toyota-guides.json" scripts/rocky/data/toyota-guides.json
node -e "const g=require('./scripts/rocky/data/toyota-guides.json'); console.log('rows:', g.length, '| keys:', Object.keys(g[0]).join(','))"
```
Expected: `rows: 148 | keys: Page URL,Year Range,Model,Procedure,Title,YouTube Video ID,YouTube Watch URL,Thumbnail`

- [ ] **Step 2: Write the failing test**

```js
// tests/rocky-dataset.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGuides, findByProcedure, byModel } from "../scripts/rocky/lib/dataset.mjs";

const SAMPLE = [
  { "Title": "2007-2021 Toyota Tundra Front Brake Pads And Rotors Replacement Instructions",
    "Model": "Tundra", "Procedure": "Front Brake Pads And Rotors Replacement", "Page URL": "u1" },
  { "Title": "2011-2020 Toyota Sienna Engine Oil Change", "Model": "Sienna", "Procedure": "Engine Oil Change And Filter Replacement", "Page URL": "u2" },
];

test("findByProcedure matches on procedure or title, case-insensitive", () => {
  const hits = findByProcedure(SAMPLE, "front brake");
  assert.equal(hits.length, 1);
  assert.equal(hits[0]["Page URL"], "u1");
});

test("byModel filters exact model, case-insensitive", () => {
  assert.equal(byModel(SAMPLE, "tundra").length, 1);
  assert.equal(byModel(SAMPLE, "Sienna").length, 1);
  assert.equal(byModel(SAMPLE, "Camry").length, 0);
});

test("loadGuides reads the vendored dataset array", () => {
  const g = loadGuides("scripts/rocky/data/toyota-guides.json");
  assert.equal(Array.isArray(g), true);
  assert.equal(g.length, 148);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/rocky-dataset.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/rocky/lib/dataset.mjs'`

- [ ] **Step 4: Write minimal implementation**

```js
// scripts/rocky/lib/dataset.mjs
import fs from "node:fs";

export function loadGuides(path) {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) throw new Error("dataset must be a JSON array");
  return raw;
}

export function findByProcedure(guides, needle) {
  const n = String(needle).toLowerCase();
  return guides.filter(
    (g) =>
      String(g.Procedure || "").toLowerCase().includes(n) ||
      String(g.Title || "").toLowerCase().includes(n)
  );
}

export function byModel(guides, model) {
  const m = String(model).toLowerCase();
  return guides.filter((g) => String(g.Model || "").toLowerCase() === m);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/rocky-dataset.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/rocky/data/toyota-guides.json scripts/rocky/lib/dataset.mjs tests/rocky-dataset.test.mjs
git commit -m "feat(rocky): vendor Toyota guide dataset + loader"
```

---

## Task 2: Reference-frame planning library

**Files:**
- Create: `scripts/rocky/lib/reference-pack.mjs`
- Test: `tests/rocky-reference-pack.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/rocky-reference-pack.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { planFrameTimestamps, buildPackIndex } from "../scripts/rocky/lib/reference-pack.mjs";

test("planFrameTimestamps keeps open + near-end and honors minGap", () => {
  const frames = planFrameTimestamps({
    durationSec: 60,
    transcriptCues: [{ start: 2 }, { start: 3 }, { start: 20 }, { start: 21 }],
    minGapSec: 5,
    maxFrames: 40,
  });
  assert.deepEqual(frames, [0, 20, 59]);
});

test("planFrameTimestamps caps at maxFrames, keeping first and last", () => {
  const cues = Array.from({ length: 100 }, (_, i) => ({ start: i * 2 + 1 }));
  const frames = planFrameTimestamps({ durationSec: 300, transcriptCues: cues, minGapSec: 1, maxFrames: 10 });
  assert.equal(frames.length <= 10, true);
  assert.equal(frames[0], 0);
  assert.equal(frames[frames.length - 1] <= 300, true);
});

test("planFrameTimestamps rejects non-positive duration", () => {
  assert.throws(() => planFrameTimestamps({ durationSec: 0 }), /durationSec/);
});

test("buildPackIndex marks referenceOnly and numbers frame files", () => {
  const idx = buildPackIndex({
    videoId: "abc",
    guide: { "Page URL": "u", "Title": "T", "Model": "Tundra", "Year Range": "2007-2021", "Procedure": "Front Brakes" },
    frames: [0, 10],
  });
  assert.equal(idx.referenceOnly, true);
  assert.equal(idx.frameCount, 2);
  assert.equal(idx.frames[1].file, "frame-001.jpg");
  assert.equal(idx.model, "Tundra");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rocky-reference-pack.test.mjs`
Expected: FAIL — cannot find module `reference-pack.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/rocky/lib/reference-pack.mjs
// Pure planning logic. Network/IO (yt-dlp, ffmpeg) lives in the CLI wrapper.

/**
 * Choose timestamps (seconds) to extract frames at.
 * One frame per transcript cue start (step boundaries), always include the
 * opening (0) and a near-end frame, enforce a minimum gap to avoid duplicates,
 * and cap the total (thinning evenly while keeping first + last).
 */
export function planFrameTimestamps({ durationSec, transcriptCues = [], minGapSec = 4, maxFrames = 40 }) {
  if (!(durationSec > 0)) throw new Error("durationSec must be > 0");
  const candidates = [0, ...transcriptCues.map((c) => c.start), Math.max(0, durationSec - 1)];
  const sorted = [...new Set(candidates)]
    .filter((t) => typeof t === "number" && t >= 0 && t <= durationSec)
    .sort((a, b) => a - b);

  const picked = [];
  for (const t of sorted) {
    if (picked.length === 0 || t - picked[picked.length - 1] >= minGapSec) picked.push(t);
  }

  if (picked.length > maxFrames) {
    const step = (picked.length - 1) / (maxFrames - 1);
    const thinned = [];
    for (let i = 0; i < maxFrames; i++) thinned.push(picked[Math.round(i * step)]);
    return [...new Set(thinned)];
  }
  return picked;
}

/** Build the pack index.json the diagram artist / pipeline reads. */
export function buildPackIndex({ videoId, guide, frames }) {
  if (!videoId) throw new Error("videoId required");
  if (!guide || !guide["Page URL"]) throw new Error("guide row required");
  return {
    videoId,
    sourceUrl: guide["Page URL"],
    title: guide["Title"] ?? "",
    model: guide["Model"] ?? "",
    yearRange: guide["Year Range"] ?? "",
    procedure: guide["Procedure"] ?? "",
    referenceOnly: true, // internal tracing reference — never shipped
    frameCount: frames.length,
    frames: frames.map((t, i) => ({ index: i, t, file: `frame-${String(i).padStart(3, "0")}.jpg` })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/rocky-reference-pack.test.mjs`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/rocky/lib/reference-pack.mjs tests/rocky-reference-pack.test.mjs
git commit -m "feat(rocky): reference-frame planning lib"
```

---

## Task 3: SRT caption library

**Files:**
- Create: `scripts/rocky/lib/srt.mjs`
- Test: `tests/rocky-srt.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/rocky-srt.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimestamp, toSrt } from "../scripts/rocky/lib/srt.mjs";

test("formatTimestamp renders HH:MM:SS,mmm", () => {
  assert.equal(formatTimestamp(0), "00:00:00,000");
  assert.equal(formatTimestamp(3661.5), "01:01:01,500");
});

test("toSrt numbers cues and renders arrow timing", () => {
  const srt = toSrt([
    { start: 0, end: 1.2, text: "Hey, it's Rocky." },
    { start: 1.2, end: 3, text: "Front brakes today." },
  ]);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,200\nHey, it's Rocky\./);
  assert.match(srt, /2\n00:00:01,200 --> 00:00:03,000\nFront brakes today\./);
});

test("toSrt rejects a cue whose end is not after start", () => {
  assert.throws(() => toSrt([{ start: 2, end: 1, text: "x" }]), /end must be after start/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rocky-srt.test.mjs`
Expected: FAIL — cannot find module `srt.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/rocky/lib/srt.mjs

/** Format seconds as an SRT timestamp: HH:MM:SS,mmm */
export function formatTimestamp(sec) {
  if (!(sec >= 0)) throw new Error("sec must be >= 0");
  const ms = Math.round(sec * 1000);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** cues: [{ start, end, text }] in seconds → SRT document string. */
export function toSrt(cues) {
  if (!Array.isArray(cues) || cues.length === 0) throw new Error("cues required");
  return cues
    .map((c, i) => {
      if (!(c.end > c.start)) throw new Error(`cue ${i}: end must be after start`);
      return `${i + 1}\n${formatTimestamp(c.start)} --> ${formatTimestamp(c.end)}\n${String(c.text).trim()}\n`;
    })
    .join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/rocky-srt.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/rocky/lib/srt.mjs tests/rocky-srt.test.mjs
git commit -m "feat(rocky): SRT caption generation lib"
```

---

## Task 4: Episode manifest validation library

**Files:**
- Create: `scripts/rocky/lib/episode-manifest.mjs`
- Test: `tests/rocky-manifest.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// tests/rocky-manifest.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateManifest, MANIFEST_STATUSES } from "../scripts/rocky/lib/episode-manifest.mjs";

const COMPLETE = {
  id: "tundra-front-brakes-2007-2021",
  sourceUrl: "https://www.viktorgautomotive.com/toyota/2007-2021-toyota-tundra-front-brake-pads-and-rotors-replacement-instructions-sequoia-lx570-lc200",
  videoId: "REPLACE_WITH_REAL_ID",
  model: "Tundra",
  yearRange: "2007-2021",
  procedure: "Front Brake Pads And Rotors Replacement",
  scriptPath: "docs/brand/rocky/pilot-tundra-front-brakes-script.md",
  status: "draft",
};

test("validateManifest accepts a complete manifest", () => {
  const { ok, errors } = validateManifest(COMPLETE);
  assert.deepEqual(errors, []);
  assert.equal(ok, true);
});

test("validateManifest reports missing fields and invalid status", () => {
  const { ok, errors } = validateManifest({ id: "x", status: "bogus" });
  assert.equal(ok, false);
  assert.equal(errors.some((e) => e.includes("missing required field: videoId")), true);
  assert.equal(errors.some((e) => e.includes("invalid status: bogus")), true);
});

test("shipped-unverified is a valid status (matches ty-publish convention)", () => {
  assert.equal(MANIFEST_STATUSES.includes("shipped-unverified"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rocky-manifest.test.mjs`
Expected: FAIL — cannot find module `episode-manifest.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/rocky/lib/episode-manifest.mjs
const REQUIRED = ["id", "sourceUrl", "videoId", "model", "yearRange", "procedure", "scriptPath", "status"];
// Status vocabulary reuses ty-publish's "shipped-unverified" for cross-system consistency.
const STATUSES = ["draft", "reference-ready", "script-ready", "rendered", "shipped-unverified", "approved"];

export function validateManifest(m) {
  if (!m || typeof m !== "object") return { ok: false, errors: ["manifest must be an object"] };
  const errors = [];
  for (const k of REQUIRED) {
    if (m[k] === undefined || m[k] === null || m[k] === "") errors.push(`missing required field: ${k}`);
  }
  if (m.status && !STATUSES.includes(m.status)) errors.push(`invalid status: ${m.status}`);
  return { ok: errors.length === 0, errors };
}

export { REQUIRED as MANIFEST_REQUIRED, STATUSES as MANIFEST_STATUSES };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/rocky-manifest.test.mjs`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/rocky/lib/episode-manifest.mjs tests/rocky-manifest.test.mjs
git commit -m "feat(rocky): episode manifest validation lib"
```

---

## Task 5: Reference-pack CLI (yt-dlp + ffmpeg)

**Files:**
- Create: `scripts/rocky/build-reference-pack.mjs`
- Modify: `.gitignore` (add `assets/rocky/reference-packs/`)

This task has network/IO and is verified by running against the pilot video, not by unit tests (the pure logic it calls is already covered by Task 2).

- [ ] **Step 1: Ignore generated reference packs**

Add this line to `.gitignore` (create the file if absent):
```
assets/rocky/reference-packs/
```

- [ ] **Step 2: Write the CLI**

```js
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
execFileSync("yt-dlp", ["-f", "bv*[height<=720]+ba/b[height<=720]", "--write-auto-subs", "--sub-lang", "en", "--convert-subs", "srt", "-o", path.join(outDir, "source.%(ext)s"), url], { stdio: "inherit" });

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
```

- [ ] **Step 3: Run it against the pilot and verify output**

Run: `node scripts/rocky/build-reference-pack.mjs "front brake pads and rotors"`
Expected: downloads the Tundra brakes video, prints `Wrote N frames + index.json to assets/rocky/reference-packs/tundra-2007-2021-...`, and that folder contains `frame-000.jpg …` plus `index.json` with `"referenceOnly": true`.

- [ ] **Step 4: Commit (code + gitignore only — not the generated pack)**

```bash
git add scripts/rocky/build-reference-pack.mjs .gitignore
git commit -m "feat(rocky): reference-pack CLI (yt-dlp+ffmpeg)"
```

---

## Task 6: Episode manifest CLI

**Files:**
- Create: `scripts/rocky/build-episode.mjs`

- [ ] **Step 1: Write the CLI**

```js
// scripts/rocky/build-episode.mjs
// Usage: node scripts/rocky/build-episode.mjs "<procedure-search>"
// Emits a validated episode manifest JSON to stdout for the pilot episode.
import path from "node:path";
import { loadGuides, findByProcedure } from "./lib/dataset.mjs";
import { validateManifest } from "./lib/episode-manifest.mjs";

const search = process.argv[2];
if (!search) { console.error('Usage: build-episode.mjs "<procedure-search>"'); process.exit(1); }

const guides = loadGuides(path.join("scripts", "rocky", "data", "toyota-guides.json"));
const hits = findByProcedure(guides, search);
if (hits.length !== 1) { console.error(`Expected 1 match, got ${hits.length}`); process.exit(1); }
const g = hits[0];
const id = `${g.Model}-${g["Year Range"]}-${g.Procedure}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const manifest = {
  id,
  sourceUrl: g["Page URL"],
  videoId: g["YouTube Video ID"],
  model: g.Model,
  yearRange: g["Year Range"],
  procedure: g.Procedure,
  scriptPath: "docs/brand/rocky/pilot-tundra-front-brakes-script.md",
  status: "draft",
};

const { ok, errors } = validateManifest(manifest);
if (!ok) { console.error("Invalid manifest:", errors); process.exit(1); }
console.log(JSON.stringify(manifest, null, 2));
```

- [ ] **Step 2: Run it and verify a valid manifest prints**

Run: `node scripts/rocky/build-episode.mjs "front brake pads and rotors"`
Expected: a JSON manifest with `"model": "Tundra"`, `"yearRange": "2007-2021"`, a real `videoId`, and no validation error.

- [ ] **Step 3: Commit**

```bash
git add scripts/rocky/build-episode.mjs
git commit -m "feat(rocky): episode manifest CLI"
```

---

## Task 7: Rocky character brief (3D build spec)

**Files:**
- Create: `docs/brand/rocky/character-brief.md`

This is a written deliverable for the 3D artist / AI tool. Acceptance = owner sign-off, not a unit test.

- [ ] **Step 1: Write the brief with these required sections (concrete, no placeholders):**
  - **Identity:** name Rocky; stylized 3D red fox; calm master-tech mentor.
  - **Color of record:** Toyota **Lunar Rock 6X3** (alt 2QU; PPG 953058). Instruction: color-match off a real swatch / PPG 953058 during texturing — do not eyeball a hex. Accents: TY orange `#E85D2A` (ear insides, tail tip), off-white belly `#F3EFEA`, earth/sage support `#99A08E`/`#7c8472`, UI blue `#B3D0D9`.
  - **Wardrobe:** TY shop shirt or apron + TY cap; a hand prop slot that swaps per episode (torque wrench, trim tool).
  - **Rig requirements:** full facial rig for lip-sync (visemes), pointing/gesture poses, idle + "explain" + "reassure" expressions; a neutral A-pose for the turnaround.
  - **Deliverables:** rigged model file, 5-view turnaround render, expression sheet (min 6), a phone-legibility check render at 1080×1920.
  - **On-model checklist** the owner signs off against (silhouette reads as fox at thumbnail size; Lunar Rock body; TY accents present; shop wardrobe; not goofy).

- [ ] **Step 2: Commit**

```bash
git add docs/brand/rocky/character-brief.md
git commit -m "docs(rocky): 3D character build brief"
```

---

## Task 8: Rocky concept / turnaround prompt pack

**Files:**
- Create: `docs/brand/rocky/concept-prompt-pack.md`

- [ ] **Step 1: Write the prompt pack (concrete, ready to paste into an image/3D concept tool):**
  - 3–5 concept prompts describing Rocky per the brief (stylized 3D fox, Lunar Rock body with orange accents, shop apron + TY cap, calm confident expression, studio lighting, front + 3/4 views).
  - A **consistency approach** note: pick ONE approved concept as the canonical reference, then generate the turnaround and all future poses from that single reference (never re-prompt from scratch) — this is what keeps Rocky on-model, mirroring the "build once, reuse" decision.
  - An explicit **do-not** list (no verbatim likeness of any real person/mascot; Lunar Rock not orange body; not cartoonish/goofy).

- [ ] **Step 2: Commit**

```bash
git add docs/brand/rocky/concept-prompt-pack.md
git commit -m "docs(rocky): concept + turnaround prompt pack"
```

---

## Task 9: Pilot VO script — Tundra front brakes

**Files:**
- Create: `docs/brand/rocky/pilot-tundra-front-brakes-script.md`

**Accuracy rule for this task:** every torque value, fluid, or part number is written as an explicit **`⟨VERIFY: …⟩`** marker, NOT a guessed number. These markers are a product requirement (never-fabricate), not plan placeholders — Task 11 replaces them with owner/FSM-sourced values.

- [ ] **Step 1: Write the script following the locked episode anatomy:**
  1. **Cold open** — Rocky states the job + vehicle verbatim: "2007 to 2021 Toyota Tundra — front brake pads and rotors. I'm Rocky. Let's knock this out."
  2. **Parts & tools card** — list pads, rotors, and tools; note the matching TY SKU slot as `⟨TY-SKU: front-brake-kit⟩`.
  3. **The fix** — step beats keyed to reference-pack frame indices (e.g. `[ref frame 003]`), covering: wheel off, caliper removal, `⟨VERIFY: caliper bolt torque⟩`, pad/rotor swap, reassembly, `⟨VERIFY: caliper bracket torque⟩`, `⟨VERIFY: lug nut torque⟩`, brake pedal bed-in.
  4. **Torque/spec + safety beat** — restate the verified specs; standard DIY safety disclaimer line.
  5. **CTA** — shop the TY brake kit / book service / subscribe.
  - Apply TY caption + "re-gear" pronunciation rules; keep Ava-education cadence.

- [ ] **Step 2: Commit**

```bash
git add docs/brand/rocky/pilot-tundra-front-brakes-script.md
git commit -m "docs(rocky): pilot script — Tundra front brakes (specs flagged for verify)"
```

---

## Task 10 [Owner/Artist]: Build & rig the 3D Rocky model

Not a code task. Owner or 3D artist builds Rocky from `character-brief.md` + `concept-prompt-pack.md`.

- [ ] Approve one canonical concept.
- [ ] Model + texture (color-matched to 6X3 / PPG 953058) + rig for lip-sync/gestures.
- [ ] Deliver rigged model + 5-view turnaround + expression sheet + 1080×1920 legibility render.
- [ ] **Owner sign-off** against the on-model checklist in the brief.

---

## Task 11 [Owner-verify + Production]: Produce the pilot episode

Uses the toolkit (Tasks 1–6) + Rocky asset (Task 10) + script (Task 9).

- [ ] **Verify specs:** replace every `⟨VERIFY: …⟩` in the pilot script with owner/FSM-sourced values. Commit the finalized script.
- [ ] **Reference pack:** run `node scripts/rocky/build-reference-pack.mjs "front brake pads and rotors"`; trace exploded-view diagrams/callouts from the extracted frames (frames stay internal — only the traced diagrams ship).
- [ ] **Voice:** render the finalized script with the locked Ava education voice.
- [ ] **Animate:** Rocky lip-synced to the VO from the locked rig, gesturing to the on-screen diagrams; assemble to the episode anatomy.
- [ ] **Captions:** produce the timed cue list and generate `.srt` via `scripts/rocky/lib/srt.mjs`; burn captions into the export.
- [ ] **Export** the branded video + `.srt`; set manifest `status: "rendered"`.

Acceptance: video follows the 5-part anatomy, Lunar Rock Rocky is on-model, all specs verified, captions present + `.srt` sidecar exists.

---

## Task 12 [Owner gate]: Review & approve

- [ ] Upload the pilot **unlisted** per the standing gate.
- [ ] Owner reviews; on approval set manifest `status: "approved"` and publish via content-ops (YouTube + Reel/Short cut + site embed on the Tundra brake parts page).
- [ ] Retro: confirm the episode template is locked before Phase 1 (top ~15 evergreen jobs).

---

## Self-Review

**Spec coverage:** Character bible → Tasks 7–8, 10. Episode anatomy → Task 9 + Task 11. Build-once 3D asset → Task 10. Reference-anchored accuracy → Tasks 2, 5, 9, 11. Captions/.srt → Tasks 3, 11. Dataset/marketing integration → Tasks 1, 6, 12. Pilot rollout → Tasks 9–12. Guardrails (never-fabricate, reference-only, original media) → Tasks 5, 9, 11. All spec sections map to tasks.

**Placeholder scan:** No code steps use TBD/TODO. The `⟨VERIFY: …⟩` markers in Task 9 are an intentional never-fabricate product requirement resolved in Task 11, and `⟨TY-SKU⟩` is a data slot filled at production — both explicitly called out, not lazy placeholders.

**Type consistency:** `loadGuides`/`findByProcedure`/`byModel` (Task 1) used identically in Tasks 5–6. `planFrameTimestamps`/`buildPackIndex` (Task 2) used in Task 5. `toSrt` (Task 3) used in Task 11. `validateManifest`/`MANIFEST_STATUSES` (Task 4) used in Task 6. Manifest field names (`id,sourceUrl,videoId,model,yearRange,procedure,scriptPath,status`) consistent across Tasks 4 and 6.
