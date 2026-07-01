# "Get OTT Now!" shareable funnel — design

Date: 2026-07-01
Status: approved (brainstorming) — proceeding to plan + build

A shareable growth entry point: a **"Get OTT Now!" CTA** + a **Share button** on the site,
and a clean **`/get-ott-now`** link that runs the existing decision funnel and captures the
lead into a booking or the priority list, tagged to the share campaign. Reuses the funnel —
no booking-logic changes.

## Decisions locked
- Button = **CTA + Share** (a "Get OTT Now! →" CTA into the funnel, plus a separate Share button).
- Placement = **homepage hero + the funnel page**.
- Shareable URL = **clean `/get-ott-now`**.

## Components

### 1. Clean shareable link — `/get-ott-now` (Netlify redirect)
Add to `netlify.toml`:
```toml
[[redirects]]
  from = "/get-ott-now"
  to = "/find-your-exact-tune?utm_source=share&utm_medium=social&utm_campaign=get-ott-now"
  status = 302
```
The existing funnel already reads `utm_source/medium/campaign` from the URL and passes them
through `book.js` to Airtable's UTM columns (and the `track()` funnel-measurement beacon), so
every lead from a shared link is attributed `get-ott-now` and routed/booked exactly as today.
302 (temporary) so the target can evolve.

### 2. Share logic — `site/share.js` (one shared file, included on both pages)
UMD-ish so the pure part is node-testable:
- `shareLinks(url, text)` — pure; returns `{ sms, email, facebook, reddit }` fallback URLs
  (properly `encodeURIComponent`-ed). Exported via `module.exports` in node; attached to
  `window.TYShare` in the browser.
- Browser wiring (only when `document` exists): binds click on `[data-share-ott]` elements.
  On click: if `navigator.share` exists → `navigator.share({ title, text, url })` with
  `url = https://tunedyota.com/get-ott-now`; else open a lightweight fallback popover with
  **Copy Link** (clipboard) + direct **SMS / Email / Facebook / Reddit** buttons and a short
  "copy & paste into Instagram / TikTok / YouTube" note (those have no web share-to-DM/post).
- Constants: `URL = "https://tunedyota.com/get-ott-now"`, a short share `TEXT`.

### 3. Buttons (theme-matched, reuse `.btn`/`.cta-row`)
- **Homepage hero** (`site/index.html`, the `.cta-row` at ~line 140): add
  `<a class="btn p" href="find-your-exact-tune.html">Get OTT Now! →</a>` as the primary CTA,
  demote the existing "Find Your Exact Tune →" to `.btn o`, keep Call/Text, and add
  `<button class="btn o" type="button" data-share-ott>Share</button>`. The CTA links straight
  to the funnel (on-site click → untagged); the **Share** button shares the tagged
  `/get-ott-now` link.
- **Funnel page** (`site/find-your-exact-tune.html`): add a `<button class="btn o" data-share-ott>Share “Get OTT Now”</button>`
  near the top (the CTA-into-funnel is moot here).
- Both pages include `<script src="/share.js" defer></script>`.

## Data flow
Share button → native share sheet (mobile) / fallback (desktop) → recipient opens
`/get-ott-now` → 302 → funnel with `utm_campaign=get-ott-now` → fills vehicle/contact →
`book.js` → booking (event+slot) or **priority list** (no event / full), installer-routed,
UTM written to Airtable. Identical to the current funnel, just attributed.

## Testing
- `tests/share.test.js` — `require("../site/share.js")` (node: `document` undefined, so DOM
  wiring is skipped) and assert `shareLinks(url, text)` builds the 4 fallback URLs with the
  right hosts + encoded url/text (facebook `sharer.php?u=`, reddit `submit?url=…&title=…`,
  `mailto:`, `sms:`).
- `tests/get-ott-now.test.js` — static guards: `index.html` contains "Get OTT Now!", a
  `data-share-ott` trigger, and the `share.js` include; `find-your-exact-tune.html` contains a
  `data-share-ott` trigger + the include; `netlify.toml` has the `/get-ott-now` redirect whose
  `to` includes `utm_campaign=get-ott-now` and points at `find-your-exact-tune`.

## Deploy
Ships via the normal flow. No SEO inputs change (buttons only; `/get-ott-now` is a redirect,
not a page, so it stays out of the sitemap) → `build:seo` not required, but `npm test` (incl.
the SEO guard tests) must be green. Push master → confirm Netlify `ready` → verify
`/get-ott-now` 302s to the funnel and the homepage shows the button.

## Out of scope
- No per-platform attribution (the native share sheet shares one URL everywhere → all `get-ott-now`).
- No changes to the funnel's booking/priority logic or routing.
- No new landing page — `/get-ott-now` is a redirect into the existing funnel.
