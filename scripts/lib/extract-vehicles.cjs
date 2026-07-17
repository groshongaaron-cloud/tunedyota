// scripts/lib/extract-vehicles.cjs
// Brace-matched extraction of the funnel's inline `const VEHICLES = {...}` literal
// (the human-edited "Edit prices here" source in find-your-exact-tune.html).
// Replaces the old single-line regex, which broke the SEO build the moment a
// formatter split the literal across lines. CJS so both the ESM build script
// (scripts/build-seo.mjs) and the CJS parity test can share it.
function extractVehicles(html) {
  const marker = "const VEHICLES = ";
  const start = html.indexOf(marker);
  const open = start + marker.length;
  if (start === -1 || html[open] !== "{") throw new Error("VEHICLES literal not found in find-your-exact-tune.html");
  let depth = 0, inStr = false, esc = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(open, i + 1)); // throws on malformed JSON → fails the build
    }
  }
  throw new Error("VEHICLES literal is unbalanced in find-your-exact-tune.html");
}
module.exports = { extractVehicles };
