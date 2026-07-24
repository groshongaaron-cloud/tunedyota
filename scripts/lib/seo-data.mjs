// scripts/lib/seo-data.mjs
// Pure, side-effect-free builders for the SEO generator. No fs, no network.

export const SITE = "https://tunedyota.com";
export const BIZ_ID = `${SITE}/#business`;

// Brand mark (decoded from the inline SVG favicon used sitewide) + palette.
export const BRAND = {
  ink: "#3A2E26", blue: "#B3D0D9", bg: "#EDECEB", cream: "#F3EFEA",
  viewBox: "3.879 5.098 40.002 39.316",
  path: "M23.881,44.414L3.879,29.408l5.022-7.53V5.098L19.837,18.77h8.094L38.86,5.098v16.78l5.021,7.53L23.881,44.414z M7.037,28.869l16.844,12.638l16.85-12.638l-4.189-6.287V11.726l-7.5,9.36H18.72l-7.493-9.36v10.857L7.037,28.869z",
};

// Pages whose <head> the generator manages. Google Search Console verification
// file is excluded. (Filenames only; the generator resolves to site/.)
export const HEAD_PAGES = [
  "index.html","faq.html","ott-tune.html","supercharger.html","team.html",
  "links.html","find-your-exact-tune.html",
  "ott-tune-cost.html","is-the-ott-tune-worth-it.html","magnuson-supercharger-guide.html","tune-warranty-emissions-legality.html",
  "toyota-lexus-tuning-minnesota.html","toyota-lexus-tuning-iowa.html","toyota-lexus-tuning-wisconsin.html","toyota-lexus-tuning-north-dakota.html","toyota-lexus-tuning-south-dakota.html","toyota-lexus-tuning-nebraska.html",
  "toyota-4runner-ott-tune.html","toyota-camry-ott-tune.html","toyota-fj-cruiser-ott-tune.html",
  "toyota-highlander-ott-tune.html","toyota-land-cruiser-ott-tune.html","toyota-rav4-ott-tune.html",
  "toyota-sequoia-ott-tune.html","toyota-tacoma-ott-tune.html","toyota-tundra-ott-tune.html",
  "lexus-gx-ott-tune.html","lexus-ls460-ott-tune.html","lexus-lx570-ott-tune.html","lexus-rx350-ott-tune.html",
  "magnuson-supercharger-pricing.html",
  "toyota-tundra-supercharger.html","toyota-tacoma-supercharger.html","toyota-4runner-supercharger.html",
  "toyota-fj-cruiser-supercharger.html","toyota-land-cruiser-supercharger.html","lexus-lx570-supercharger.html","toyota-sequoia-supercharger.html",
  "amsoil-garage.html",
  "amsoil-toyota-tundra.html","amsoil-toyota-tacoma.html","amsoil-toyota-4runner.html","amsoil-toyota-sequoia.html",
  "amsoil-toyota-land-cruiser.html","amsoil-toyota-fj-cruiser.html","amsoil-toyota-rav4.html","amsoil-toyota-highlander.html","amsoil-toyota-camry.html",
  "amsoil-lexus-gx.html","amsoil-lexus-lx570.html","amsoil-lexus-rx350.html","amsoil-lexus-ls460.html",
  "amsoil-synthetic-motor-oil-guide.html","amsoil-synthetic-atf-guide.html","amsoil-severe-gear-guide.html",
  "amsoil-ea-oil-filter-guide.html","is-amsoil-worth-it.html","amsoil-vs-oem-toyota-lexus-fluids.html",
  "amsoil-0w20-guide.html","amsoil-5w30-guide.html","amsoil-5w20-guide.html",
  "amsoil-signature-series-0w-20-synthetic-motor-oil.html","amsoil-signature-series-5w-30-synthetic-motor-oil.html",
  "amsoil-signature-series-5w-20-synthetic-motor-oil.html","amsoil-signature-series-fuel-efficient-synthetic-atf.html",
  "amsoil-ea-oil-filter-ea15k09.html","amsoil-ea-oil-filter-ea15k51.html","amsoil-ea-oil-filter-ea15k02.html",
  "amsoil-ea-oil-filter-ea15k49.html","amsoil-ea-oil-filter-ea15k04.html",
  "amsoil-severe-gear-75w-85-synthetic-gear-lube.html","amsoil-severe-gear-75w-90-synthetic-gear-lube.html",
  "amsoil-severe-gear-75w-140-synthetic-gear-lube.html","amsoil-severe-gear-80w-90-synthetic-gear-lube.html",
  "amsoil-signature-series-5w-40-synthetic-max-duty-diesel-oil.html","amsoil-heavy-duty-5w-40-synthetic-diesel-oil.html",
  "amsoil-p-i-performance-improver-gasoline-additive.html","amsoil-upper-cylinder-lubricant-corrosion-inhibitor.html",
  "amsoil-passenger-car-light-truck-antifreeze-coolant.html","amsoil-heavy-duty-antifreeze-coolant.html",
  "amsoil-5w-40-ms-synthetic-european-motor-oil.html","amsoil-5w-30-ls-synthetic-european-motor-oil.html",
  "amsoil-0w-20-synthetic-high-mileage-motor-oil.html","amsoil-5w-30-synthetic-high-mileage-motor-oil.html",
  "amsoil-minnesota.html","amsoil-iowa.html","amsoil-wisconsin.html","amsoil-north-dakota.html","amsoil-south-dakota.html","amsoil-nebraska.html",
  "amsoil-texas.html","amsoil-florida.html","amsoil-colorado.html","amsoil-arizona.html","amsoil-michigan.html","amsoil-california.html",
  "amsoil-georgia.html","amsoil-ohio.html","amsoil-pennsylvania.html","amsoil-illinois.html","amsoil-washington.html","amsoil-tennessee.html",
  "amsoil-north-carolina.html","amsoil-missouri.html","amsoil-montana.html","amsoil-idaho.html","amsoil-oklahoma.html","amsoil-indiana.html",
  "privacy.html","terms.html","returns.html",
];
export const SITEMAP_EXCLUDE = new Set(["links.html"]);

// Sitemap priority by filename (preserves the existing sitemap's weighting).
export const PRIORITY = {
  "index.html": "1.0", "find-your-exact-tune.html": "0.9", "supercharger.html": "0.9",
  "magnuson-supercharger-pricing.html": "0.9",
  "faq.html": "0.7", "ott-tune.html": "0.7", "team.html": "0.7",
  "amsoil-garage.html": "0.9",
  "amsoil-synthetic-motor-oil-guide.html": "0.8", "amsoil-synthetic-atf-guide.html": "0.8",
  "amsoil-severe-gear-guide.html": "0.8", "amsoil-ea-oil-filter-guide.html": "0.8", "is-amsoil-worth-it.html": "0.8",
  "amsoil-vs-oem-toyota-lexus-fluids.html": "0.9",
  "amsoil-0w20-guide.html": "0.8", "amsoil-5w30-guide.html": "0.8", "amsoil-5w20-guide.html": "0.8",
  "amsoil-signature-series-0w-20-synthetic-motor-oil.html": "0.8", "amsoil-signature-series-5w-30-synthetic-motor-oil.html": "0.8",
  "amsoil-signature-series-5w-20-synthetic-motor-oil.html": "0.8", "amsoil-signature-series-fuel-efficient-synthetic-atf.html": "0.8",
  "amsoil-ea-oil-filter-ea15k09.html": "0.8", "amsoil-ea-oil-filter-ea15k51.html": "0.8", "amsoil-ea-oil-filter-ea15k02.html": "0.8",
  "amsoil-ea-oil-filter-ea15k49.html": "0.8", "amsoil-ea-oil-filter-ea15k04.html": "0.8",
  "amsoil-severe-gear-75w-85-synthetic-gear-lube.html": "0.8", "amsoil-severe-gear-75w-90-synthetic-gear-lube.html": "0.8",
  "amsoil-severe-gear-75w-140-synthetic-gear-lube.html": "0.8", "amsoil-severe-gear-80w-90-synthetic-gear-lube.html": "0.8",
  "amsoil-signature-series-5w-40-synthetic-max-duty-diesel-oil.html": "0.8", "amsoil-heavy-duty-5w-40-synthetic-diesel-oil.html": "0.8",
  "amsoil-p-i-performance-improver-gasoline-additive.html": "0.8", "amsoil-upper-cylinder-lubricant-corrosion-inhibitor.html": "0.8",
  "amsoil-passenger-car-light-truck-antifreeze-coolant.html": "0.8", "amsoil-heavy-duty-antifreeze-coolant.html": "0.8",
  "amsoil-5w-40-ms-synthetic-european-motor-oil.html": "0.8", "amsoil-5w-30-ls-synthetic-european-motor-oil.html": "0.8",
  "amsoil-0w-20-synthetic-high-mileage-motor-oil.html": "0.8", "amsoil-5w-30-synthetic-high-mileage-motor-oil.html": "0.8",
  "privacy.html": "0.3", "terms.html": "0.3", "returns.html": "0.3",
};
// loc path for a filename (index -> "/", others -> "/name" without .html).
export function locFor(file) {
  if (file === "index.html") return `${SITE}/`;
  return `${SITE}/${file.replace(/\.html$/, "")}`;
}

const ESC = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Decode the few HTML entities a title/description may already carry, so the OG
// builder re-encodes them exactly once (avoids `&amp;` -> `&amp;amp;`).
const UNESC = (s) => String(s == null ? "" : s)
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function extractMeta(html) {
  const title = UNESC((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "");
  const description = UNESC((html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"\s*\/?>/i) || [])[1]?.trim() || "");
  const canonical = (html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i) || [])[1]?.trim() || "";
  return { title, description, canonical };
}

export function buildOgTags({ title, description, canonical }) {
  const img = `${SITE}/og-image.png`;
  const lines = [
    `<meta property="og:title" content="${ESC(title)}">`,
    `<meta property="og:description" content="${ESC(description)}">`,
    `<meta property="og:url" content="${ESC(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:site_name" content="Tuned Yota">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${ESC(title)}">`,
    `<meta name="twitter:description" content="${ESC(description)}">`,
    `<meta name="twitter:image" content="${img}">`,
  ];
  return lines.join("\n");
}

// Compact business node embedded on every page so cross-page provider @id
// resolves per-page. Full reviews/aggregateRating stay only on index.html.
const BUSINESS = {
  "@context": "https://schema.org", "@type": "AutomotiveBusiness", "@id": BIZ_ID,
  name: "Tuned Yota", url: `${SITE}/`, telephone: "+1-612-406-7117", email: "info@tunedyota.com",
  // NAP: must stay character-identical to the Google Business Profile address.
  // Interim location (2026-07-20) until the garage-condo closing — update BOTH
  // here and on GBP together when it changes.
  address: { "@type": "PostalAddress", streetAddress: "18758 Iden Avenue",
    addressLocality: "Lakeville", addressRegion: "MN", postalCode: "55044", addressCountry: "US" },
  priceRange: "$$", slogan: "Undeniable Performance",
  logo: { "@type": "ImageObject", url: `${SITE}/logo.png`, width: 512, height: 512 },
  image: `${SITE}/og-image.png`,
  areaServed: ["Minnesota","Iowa","Wisconsin","North Dakota","South Dakota","Nebraska"].map((n) => ({ "@type": "State", name: n })),
  sameAs: ["https://www.facebook.com/TunedYota/","https://www.instagram.com/tunedyota/","https://www.facebook.com/groups/501008078456222"],
};
export const BUSINESS_STUB = JSON.stringify(BUSINESS);

// Org-level shipping policy (Google `ShippingService` markup) — emitted ONLY on
// returns.html, per Google's guidance to describe the standard policy on one
// page. Facts mirror AMSOIL's published Shipping Information (AMSOIL Inc.
// fulfills every order): contiguous-US free ground shipping at $100+, flat
// $12.99 under $100; 5 p.m. Central weekday cutoff, ships within 24h, arrives
// within 3 business days ground. Deliberately NOT offer-level: product-level
// shippingDetails outranks org-level and can't express the $100 threshold, so
// a flat per-offer rate would mask the free-shipping condition.
const transit = { "@type": "ServicePeriod",
  duration: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" } };
export const SHIPPING_SERVICE = {
  "@type": "ShippingService",
  name: "AMSOIL direct shipping (contiguous U.S.)",
  description: "AMSOIL product orders placed through Tuned Yota are fulfilled and shipped by AMSOIL Inc. Free ground shipping on orders of $100 or more in the contiguous U.S.; orders under $100 ship for a flat $12.99. Most orders placed by 5 p.m. Central, Monday through Friday, ship within 24 hours and arrive within 3 business days.",
  fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
  handlingTime: { "@type": "ServicePeriod",
    businessDays: ["Monday","Tuesday","Wednesday","Thursday","Friday"].map((d) => `https://schema.org/${d}`),
    cutoffTime: "17:00:00-06:00",
    duration: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" } },
  shippingConditions: [
    { "@type": "ShippingConditions",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      orderValue: { "@type": "MonetaryAmount", minValue: 0, maxValue: 99.99, currency: "USD" },
      shippingRate: { "@type": "MonetaryAmount", value: 12.99, currency: "USD" },
      transitTime: transit },
    { "@type": "ShippingConditions",
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      orderValue: { "@type": "MonetaryAmount", minValue: 100, currency: "USD" },
      shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "USD" },
      transitTime: transit },
  ],
};
export const BUSINESS_STUB_SHIPPING = JSON.stringify({ ...BUSINESS, hasShippingService: SHIPPING_SERVICE });

export function buildEventsJsonLd(events, states) {
  const asArr = (v) => Array.isArray(v) ? v : (v ? [v] : []);
  const items = Object.entries(events)
    .flatMap(([key, v]) => asArr(v).map((e) => [key, e]))
    .filter(([, e]) => e && e.active && e.dateISO)
    .sort((a, b) => a[1].dateISO.localeCompare(b[1].dateISO))
    .map(([city, e], i) => {
      const region = states[city] || "";
      const cityName = city.replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        "@type": "ListItem", position: i + 1,
        item: {
          "@type": "Event",
          name: e.event || `Tuned Yota OTT Tuning Event — ${cityName}`,
          startDate: e.dateISO,
          eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
          eventStatus: "https://schema.org/EventScheduled",
          location: { "@type": "Place", name: `${cityName}, ${region}`,
            address: { "@type": "PostalAddress", addressLocality: cityName, addressRegion: region, addressCountry: "US" } },
          organizer: { "@id": BIZ_ID },
          offers: { "@type": "Offer", url: `${SITE}/find-your-exact-tune`, availability: "https://schema.org/InStock", price: "450", priceCurrency: "USD" },
        },
      };
    });
  return JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: "Tuned Yota 2026 OTT Tuning Events", itemListElement: items });
}

// Per-entry lastmod (content-change date) with the build date as fallback —
// stamping every URL with the build date tells crawlers everything changed
// every build.
export function buildSitemap(entries, lastmod) {
  const urls = entries.map((e) =>
    `  <url>\n    <loc>${e.loc}</loc>\n    <lastmod>${e.lastmod || lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${e.priority || "0.8"}</priority>\n  </url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
