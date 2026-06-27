const { test } = require("node:test");
const assert = require("node:assert/strict");
const { renderRosterEmail } = require("../netlify/functions/lib/roster-render.js");

const event = { city: "Green Bay", state: "WI", label: "Sep 12, 2026", dateISO: "2026-09-12", address: "123 Dyno Rd" };
const bookings = [
  { Slot: "9:20", Name: "B Two", Vehicle: "2024+ Toyota Tacoma 2.4L-T I4", Phone: "p2", Email: "b@x.com", Modifications: "35s", Goals: "Towing confidence" },
  { Slot: "9:00", Name: "A One", Vehicle: "2021 Toyota 4Runner 4.0L V6", Phone: "p1", Email: "a@x.com", Modifications: "", Goals: "Sharper daily response" },
];
const waitlist = [{ Name: "W Lister", Phone: "p3", Email: "w@x.com", Reason: "Event full" }];

test("roster sorts by slot, basics-only columns, no goal blurbs", () => {
  const { subject, html, text } = renderRosterEmail(event, bookings, waitlist);
  assert.match(subject, /Green Bay/);
  assert.ok(html.indexOf("A One") < html.indexOf("B Two"));
  ["Time", "Name", "Vehicle", "Phone", "Email", "Mods"].forEach((h) => assert.ok(html.includes(h)));
  assert.ok(html.includes("35s") && html.includes("2024+ Toyota Tacoma 2.4L-T I4"));
  assert.ok(!/Towing confidence|Sharper daily response/.test(html));
  assert.ok(html.includes("W Lister") && /waitlist/i.test(html));
  assert.ok(text.includes("A One"));
});
test("roster handles empty bookings + empty waitlist", () => {
  const { html } = renderRosterEmail(event, [], []);
  assert.ok(/no bookings/i.test(html));
});
