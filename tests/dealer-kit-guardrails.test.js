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

test("both legal artifacts carry the counsel-review draft flag", () => {
  for (const name of ["01-compliance-statement.html", "02-warranty-magnuson-moss.html"]) {
    const f = path.join(KIT, name);
    if (!fs.existsSync(f)) continue; // skip until authored
    assert.match(fs.readFileSync(f, "utf8"), /class="draft"/, `${name} missing body.draft`);
    assert.match(fs.readFileSync(f, "utf8"), /COUNSEL[-\s]REVIEW/i, `${name} missing counsel banner`);
  }
});
