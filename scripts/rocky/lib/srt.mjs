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
