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
