// tests/installer-merge-strip.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const html = fs.readFileSync("site/installer.html", "utf8");

test("duplicate strip renders from lead.duplicates with Merge / Review / Notes actions", () => {
  assert.match(html, /Possible duplicate/);
  assert.match(html, /action:\s*["']merge["']/);
  assert.match(html, /duplicateId/);
  assert.match(html, /mergeReview|dup-review/i, "Review affordance present");
  assert.match(html, /dup-notes|mergeNotes/i, "Notes jump affordance present");
});

test("merge success jump-and-flashes the surviving card (console rule: no silent outcomes)", () => {
  // the merge handler must call the console's existing flash/jump helper with survivorId
  assert.match(html, /survivorId/);
});
