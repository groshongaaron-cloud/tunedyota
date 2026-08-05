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
