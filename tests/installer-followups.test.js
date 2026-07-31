// Static wiring: the console's overdue/follow-up surfaces exist and use the
// approved prefilled-draft flow (never a direct send).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("leads view has Active/Overdue sub-tabs driven by STATE.leadTab", () => {
  assert.ok(HTML.includes("STATE.leadTab"));
  assert.ok(HTML.includes("⏰ Overdue"));
});

test("overdue reminders send through the chat prefilled-draft flow", () => {
  assert.ok(HTML.includes("sendFollowup"));
  assert.ok(HTML.includes("STATE.followupPending"));
  assert.ok(HTML.includes("followupSent"));
  // The saved message lands in the composer via the existing prefill mechanism.
  const fn = HTML.slice(HTML.indexOf("async function sendFollowup"));
  assert.ok(fn.slice(0, 900).includes("STATE.chatPrefill"));
});

test("follow-ups carry an optional message with a custom date", () => {
  assert.ok(HTML.includes("Message to send with the follow-up (optional)"));
  assert.ok(/action:'setFollowup',date:date,message:/.test(HTML));
  assert.ok(/fuDate\.type='date'/.test(HTML));
});

test("overdue leads leave the Active stage lists", () => {
  assert.ok(/\(l\.stage\|\|'New'\)===stage && !isOverdueLead\(l\)/.test(HTML));
});
