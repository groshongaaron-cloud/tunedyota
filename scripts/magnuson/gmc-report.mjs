// Per-product Merchant Center performance report for GMC 5336800267 —
// free-listing (and, when campaigns exist, Shopping-ads) clicks/impressions
// by offer, via the Content API v2.1 reports.search endpoint. The gsc-reader
// service account has the Performance role, so this needs no human login.
//
// Usage:
//   node scripts/magnuson/gmc-report.mjs            # last 30 days, free listings
//   node scripts/magnuson/gmc-report.mjs 7          # last 7 days
//   node scripts/magnuson/gmc-report.mjs 30 ads     # Shopping ads program
//
// Output: TSV to stdout (offerId, title, clicks, impressions, CTR) sorted by
// clicks — pipe-friendly for the seo-monitor agent and ad-hoc analysis.
import { GoogleAuth } from "google-auth-library";

const MERCHANT_ID = "5336800267";
const days = Number(process.argv[2]) || 30;
const program = (process.argv[3] || "free") === "ads" ? "SHOPPING_ADS" : "FREE_PRODUCT_LISTING";

const end = new Date();
const start = new Date(end.getTime() - days * 86400_000);
const d = (x) => x.toISOString().slice(0, 10);

const query = `
  SELECT segments.offer_id, segments.title, metrics.clicks, metrics.impressions, metrics.ctr
  FROM MerchantPerformanceView
  WHERE segments.date BETWEEN '${d(start)}' AND '${d(end)}'
    AND segments.program = '${program}'
  ORDER BY metrics.clicks DESC
`;

const auth = new GoogleAuth({
  keyFile: "C:/Users/grosh/Downloads/tunedyota-fa3fb6aeac63.json",
  scopes: ["https://www.googleapis.com/auth/content"],
});
const client = await auth.getClient();

let pageToken;
const rows = [];
do {
  const res = await client.request({
    url: `https://shoppingcontent.googleapis.com/content/v2.1/${MERCHANT_ID}/reports/search`,
    method: "POST",
    data: { query, ...(pageToken ? { pageToken } : {}) },
  });
  for (const r of res.data.results || []) {
    rows.push({
      offerId: r.segments?.offerId ?? "",
      title: r.segments?.title ?? "",
      clicks: Number(r.metrics?.clicks ?? 0),
      impressions: Number(r.metrics?.impressions ?? 0),
      ctr: Number(r.metrics?.ctr ?? 0),
    });
  }
  pageToken = res.data.nextPageToken;
} while (pageToken);

console.log(`# GMC ${program} ${d(start)}..${d(end)} — ${rows.length} offers`);
console.log("offerId\ttitle\tclicks\timpressions\tctr");
for (const r of rows) {
  console.log(`${r.offerId}\t${r.title}\t${r.clicks}\t${r.impressions}\t${(r.ctr * 100).toFixed(2)}%`);
}
const totals = rows.reduce((a, r) => ({ c: a.c + r.clicks, i: a.i + r.impressions }), { c: 0, i: 0 });
console.log(`# totals: ${totals.c} clicks / ${totals.i} impressions`);
