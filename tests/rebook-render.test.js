const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderRebookReport } = require("../netlify/functions/lib/rebook-render.js");

const ROWS = [
  { Name: "A One", Phone: "111", Vehicle: "Tundra", City: "Omaha", Reason: "Rebook — not completed", "Event Date": "2026-07-03", Installer: "cody" },
  { Name: "B Two", Email: "b@x.com", Vehicle: "Tacoma", City: "Omaha", Reason: "Event full", "Event Date": "2026-07-03", Installer: "cody" },
  { Name: "C Three", Phone: "333", Vehicle: "4Runner", City: "Madison", Reason: "Rebook — not completed", "Event Date": "2026-07-03", Installer: "aaron" },
];

test("renders all, grouped by city and by installer, with counts", () => {
  const m = renderRebookReport(ROWS, { title: "Weekly rebook backlog" });
  assert.match(m.subject, /Weekly rebook backlog \(3\)/);
  assert.match(m.text, /A One/); assert.match(m.text, /C Three/);
  assert.match(m.text, /Omaha \(2\)/);        // by location
  assert.match(m.text, /Madison \(1\)/);
  assert.match(m.text, /Cody Star \(2\)/);    // by installer (display name)
  assert.match(m.text, /Aaron Groshong \(1\)/);
});

test("appends the exact model year after the vehicle, omits it when blank", () => {
  const rows = [
    { Name: "A One", Phone: "111", Vehicle: "2016-2023 Toyota Tacoma 3.5L V6", "Model Year": "2019", City: "Omaha", Reason: "Rebook — not completed", Installer: "cody" },
    { Name: "B Two", Phone: "222", Vehicle: "2024+ Toyota Tacoma 2.4L-T I4", City: "Omaha", Reason: "Event full", Installer: "cody" },
  ];
  const m = renderRebookReport(rows, { title: "Post-Event Summary — Omaha (2026-07-03)" });
  assert.match(m.text, /2016-2023 Toyota Tacoma 3\.5L V6 \(2019\)/); // year appended
  assert.doesNotMatch(m.text, /2\.4L-T I4 \(\)/);                    // no dangling parens when blank
});

test("empty input says none outstanding", () => {
  const m = renderRebookReport([], { title: "Weekly rebook backlog" });
  assert.match(m.subject, /\(0\)/);
  assert.match(m.text, /None outstanding/i);
});

test("a blank installer groups under Unassigned, not the fallback installer", () => {
  const rows = [{ Name: "A", City: "Omaha", Installer: "", Reason: "No event scheduled" }];
  const m = renderRebookReport(rows, { title: "Weekly rebook backlog" });
  assert.match(m.text, /Omaha \(1\)/);       // by location
  assert.match(m.text, /Unassigned \(1\)/);  // by installer: blank → "Unassigned", not "Aaron Groshong"
  assert.doesNotMatch(m.text, /Aaron Groshong/);
});
