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
