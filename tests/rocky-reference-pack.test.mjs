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
