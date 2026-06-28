// netlify/functions/lib/markets.js
// Server source of truth for event cities + installer key.
// Mirrors MARKETS in site/find-your-exact-tune.html — keep in sync.
const MARKETS = [
  { city: "Duluth", state: "MN", inst: "aaron" },
  { city: "Twin Cities", state: "MN", inst: "aaron" },
  { city: "Mankato", state: "MN", inst: "aaron" },
  { city: "Rochester", state: "MN", inst: "aaron" },
  { city: "Eau Claire", state: "WI", inst: "aaron" },
  { city: "Green Bay", state: "WI", inst: "noah" },
  { city: "Madison", state: "WI", inst: "aaron" },
  { city: "Milwaukee", state: "WI", inst: "noah" },
  { city: "Des Moines", state: "IA", inst: "aaron" },
  { city: "Cedar Rapids", state: "IA", inst: "aaron" },
  { city: "Davenport", state: "IA", inst: "aaron" },
  { city: "Sioux City", state: "IA", inst: "cody" },
  { city: "Fargo", state: "ND", inst: "aaron" },
  { city: "Rapid City", state: "SD", inst: "cody" },
  { city: "Sioux Falls", state: "SD", inst: "cody" },
  { city: "Omaha", state: "NE", inst: "cody" },
  { city: "Lincoln", state: "NE", inst: "cody" },
];
function getMarket(city) {
  const key = String(city == null ? "" : city).trim().toLowerCase();
  if (!key) return null;
  return MARKETS.find((m) => m.city.toLowerCase() === key) || null;
}
module.exports = { MARKETS, getMarket };
