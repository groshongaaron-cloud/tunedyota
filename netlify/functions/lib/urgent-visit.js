// netlify/functions/lib/urgent-visit.js
// Deterministic visit-intent tripwire (spec 2026-07-28-address-seeking-urgent-
// escalation). The one message class where minutes matter — a customer already
// heading somewhere — is the one the intake-shaped transfer tool can miss, so
// detection must not depend on the model. Bias to fire: a false positive costs
// one ignorable dispatcher SMS; a false negative costs a stranger at the door.
// Bare "address"/"where are you located" questions are deliberately NOT here —
// event-address questions are routine; the system prompt (Tier B) covers them.

const VISIT_RE = new RegExp([
  "\\bon my way\\b", "\\bomw\\b", "\\bon the way\\b",
  "\\bheaded (?:your|that) way\\b", "\\bheading (?:over|down|to you)\\b",
  "\\bcom(?:e|ing) (?:by|down|over|to you)\\b",
  "\\bstop by\\b", "\\bswing by\\b", "\\bwalk[- ]?ins?\\b",
  "\\bleaving now\\b", "\\bbe there (?:in|at|by)\\b",
  "\\bsee you (?:soon|tonight|in)\\b",
].join("|"), "i");

const PIN_RE = /maps\.apple\.com|maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps/i;

// The physical-location fragments live in env so the garage-condo move is a
// one-variable change (same one-pass update as GBP + site schema).
const DEFAULT_FRAGMENTS = "18758,iden av";

function detectVisitIntent(text, env) {
  const t = String(text || "");
  if (!t) return "";
  if (VISIT_RE.test(t)) return "visit-intent";
  if (PIN_RE.test(t)) return "map-pin";
  const low = t.toLowerCase();
  const fragments = String((env && env.TY_ADDRESS_FRAGMENTS) || DEFAULT_FRAGMENTS)
    .split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
  if (fragments.some((f) => low.includes(f))) return "address-fragment";
  return "";
}

module.exports = { detectVisitIntent };
