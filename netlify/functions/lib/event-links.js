// netlify/functions/lib/event-links.js
// Per-event shareable booking links: tunedyota.com/book/<city-slug>-<YYYY-MM-DD>.
// Pure — used by the event-qr endpoint and unit tests. The client pages (book.html,
// installer.html) inline the same slugify expression; tests/event-links.test.js +
// the client presence tests keep them in step.
const { MARKETS } = require("./markets.js");

function slugifyCity(city) {
  return String(city || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildEventSlug(city, dateISO) { return `${slugifyCity(city)}-${dateISO}`; }

function eventUrl(city, dateISO, base = "https://tunedyota.com") {
  return `${base}/book/${buildEventSlug(city, dateISO)}`;
}

// slug → { city (canonical market casing), dateISO } | null. Date is validated
// structurally (real month/day ranges); whether an EVENT exists on that date is
// the caller's job (book.html asks the availability endpoint).
function parseEventSlug(slug) {
  const m = String(slug || "").match(/^([a-z0-9-]+)-(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, citySlug, y, mo, d] = m;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  const market = MARKETS.find((mk) => slugifyCity(mk.city) === citySlug);
  if (!market) return null;
  return { city: market.city, dateISO: `${y}-${mo}-${d}` };
}

module.exports = { slugifyCity, buildEventSlug, parseEventSlug, eventUrl };
