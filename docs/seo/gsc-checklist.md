# Google Search Console — submission & verification checklist

Property: https://tunedyota.com (verified via `site/google8e04e8318c14272c.html`).
Run this after each SEO deploy.

## 1. Sitemap
- Search Console → **Sitemaps** → enter `sitemap.xml` → **Submit**.
- Confirm status **Success** and "Discovered URLs" = 19.

## 2. Request indexing (priority pages)
For each URL: **URL Inspection** → paste → **Test Live URL** → **Request Indexing**.
- https://tunedyota.com/
- https://tunedyota.com/find-your-exact-tune
- https://tunedyota.com/supercharger
- https://tunedyota.com/toyota-tacoma-ott-tune
- https://tunedyota.com/lexus-gx-ott-tune

## 3. Rich results validation
- https://search.google.com/test/rich-results → test a vehicle page and
  `find-your-exact-tune`. Expect detected: Breadcrumb, FAQ, (vehicle) Service/Offer,
  (booking) Event, Organization. Zero errors; warnings acceptable.

## 4. Monitor (check 1–2 weeks later)
- **Pages** report: indexed count climbing, no new "Excluded" spikes.
- **Enhancements**: Breadcrumbs, FAQ, Merchant listings, Events show valid items.
- Re-submit the sitemap after any future content ship.
