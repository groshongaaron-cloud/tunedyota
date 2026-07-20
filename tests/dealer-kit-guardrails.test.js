const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const KIT = path.join(__dirname, "..", "docs", "marketing", "dealer-kit");
// Forbidden substrings (case-insensitive). "MAF" uses word boundaries to avoid
// false hits inside unrelated words.
const FORBIDDEN = [
  { re: /stage\s*2/i, label: "Stage 2" },
  { re: /stage\s*3/i, label: "Stage 3" },
  { re: /\bMAF\b/i, label: "MAF" },
  { re: /\bCOBB\b/i, label: "COBB" },
  { re: /accessport/i, label: "Accessport" },
  { re: /kevin\s+whitman/i, label: "Kevin Whitman" },
];

function kitFiles() {
  if (!fs.existsSync(KIT)) return [];
  return fs.readdirSync(KIT).filter((f) => f.endsWith(".html") || f.endsWith(".md"))
    .map((f) => path.join(KIT, f));
}

test("dealer-kit content contains no brand-rule violations", () => {
  for (const file of kitFiles()) {
    const text = fs.readFileSync(file, "utf8");
    for (const { re, label } of FORBIDDEN) {
      assert.ok(!re.test(text), `Forbidden term "${label}" found in ${path.basename(file)}`);
    }
  }
});

test("emissions-intact positioning is present in the compliance statement", () => {
  const f = path.join(KIT, "01-compliance-statement.html");
  if (!fs.existsSync(f)) return; // skip until authored
  assert.match(fs.readFileSync(f, "utf8"), /emissions[-\s]intact/i);
});

// Aaron reviewed and SIGNED OFF the legal artifacts 2026-07-20 (his own legal
// sign-off; see OPEN-ITEMS.md). The pre-signoff guardrail ("must stay DRAFT")
// flips to the post-signoff invariant: the approved artifacts must ship CLEAN —
// no stray draft class or counsel banner may reappear without a new review.
test("signed-off legal artifacts ship clean (no draft flag or counsel banner)", () => {
  for (const name of ["01-compliance-statement.html", "02-warranty-magnuson-moss.html"]) {
    const f = path.join(KIT, name);
    if (!fs.existsSync(f)) continue;
    const html = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(html, /class="draft"/, `${name} has a draft flag — did copy change without Aaron's re-approval?`);
    assert.doesNotMatch(html, /COUNSEL[-\s]REVIEW/i, `${name} has a counsel banner — re-render after review state changes`);
  }
});
