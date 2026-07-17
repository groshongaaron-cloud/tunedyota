const { test } = require("node:test");
const assert = require("node:assert/strict");
const { slugifyCity, buildEventSlug, parseEventSlug, eventUrl } = require("../netlify/functions/lib/event-links.js");

test("slugifyCity lowercases and hyphenates known market names", () => {
  assert.equal(slugifyCity("Fargo"), "fargo");
  assert.equal(slugifyCity("Twin Cities"), "twin-cities");
  assert.equal(slugifyCity("Coon Rapids"), "coon-rapids");
});

test("buildEventSlug + eventUrl compose city and date", () => {
  assert.equal(buildEventSlug("Twin Cities", "2026-08-09"), "twin-cities-2026-08-09");
  assert.equal(eventUrl("Fargo", "2026-08-09"), "https://tunedyota.com/book/fargo-2026-08-09");
});

test("parseEventSlug resolves a real market city + date", () => {
  const p = parseEventSlug("twin-cities-2026-08-09");
  assert.equal(p.city, "Twin Cities");           // canonical market casing
  assert.equal(p.dateISO, "2026-08-09");
});

test("parseEventSlug rejects unknown cities, bad dates, junk", () => {
  assert.equal(parseEventSlug("atlantis-2026-08-09"), null);
  assert.equal(parseEventSlug("fargo-2026-13-45"), null); // impossible date parts
  assert.equal(parseEventSlug("fargo"), null);
  assert.equal(parseEventSlug(""), null);
  assert.equal(parseEventSlug(null), null);
});
