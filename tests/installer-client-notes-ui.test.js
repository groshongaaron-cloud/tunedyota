// Static wiring: client notes — stamped notes live on the client record and
// render on every card for that client (owner rule 2026-07-31).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "site", "installer.html"), "utf8");

test("booking cards join the client's notes from loaded leads", () => {
  assert.ok(HTML.includes("function clientLeadFor"), "join helper exists");
  const fn = HTML.slice(HTML.indexOf("function clientLeadFor"));
  assert.ok(fn.slice(0, 700).includes("l.bookingId===b.id"), "linked lead first");
  assert.ok(fn.slice(0, 700).includes("callDigits"), "phone fallback");
});

test("notes strip + Add note render on open, completed, and no-show cards", () => {
  assert.ok((HTML.match(/notesBlock\(b\)/g) || []).length >= 3, "strip on all three card branches");
});

test("saving a note posts to installer-client-note and highlights the booking", () => {
  const fn = HTML.slice(HTML.indexOf("function addClientNote"));
  assert.ok(fn.slice(0, 1200).includes("installer-client-note"), "endpoint");
  assert.ok(fn.slice(0, 1200).includes("bookingId:"), "booking-scoped body");
  assert.ok(fn.slice(0, 1600).includes("jumpToBooking"), "jump-and-flash");
});

test("lead cards show notes and can add one via leadId", () => {
  const fn = HTML.slice(HTML.indexOf("function leadCard"));
  assert.ok(fn.includes("noteLines(l.clientNotes)"), "strip renders lead notes");
  assert.ok(fn.includes("addLeadNote(l"), "add-note wired");
  const add = HTML.slice(HTML.indexOf("function addLeadNote"));
  assert.ok(add.slice(0, 900).includes("installer-client-note"), "endpoint");
  assert.ok(add.slice(0, 900).includes("leadId:"), "lead-scoped body");
});

test("the feed lazy-loads leads so notes can render on booking cards", () => {
  const fn = HTML.slice(HTML.indexOf("function renderFeed"));
  assert.ok(fn.slice(0, 600).includes("loadLeads()"), "lazy trigger in feed render");
});
